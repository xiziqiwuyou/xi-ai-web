const maxUpstreamErrorLength = 1200;

export class LangflowClientError extends Error {
  constructor(message, { status = 502, code = "LANGFLOW_UPSTREAM_ERROR", upstreamStatus = null } = {}) {
    super(message);
    this.name = "LangflowClientError";
    this.status = status;
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

function safeHeaderValue(value, maxLength = 4096) {
  return String(value || "").replace(/[\r\n]/g, "").slice(0, maxLength);
}

function workflowEndpoint(baseUrl, workflowPath = "/api/v2/workflows") {
  const path = String(workflowPath || "/api/v2/workflows").replace(/^\/+/, "");
  return new URL(path, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function linkedAbortSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Langflow request timed out")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) controller.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

function langflowHeaders(config, request) {
  return {
    Accept: "text/event-stream, application/x-ndjson, application/json",
    "Content-Type": "application/json",
    "x-api-key": safeHeaderValue(config.apiKey, 4096),
    "X-LANGFLOW-GLOBAL-VAR-XI_API_URL": safeHeaderValue(request.connection?.baseUrl),
    "X-LANGFLOW-GLOBAL-VAR-XI_API_KEY": safeHeaderValue(request.connection?.apiKey),
    "X-LANGFLOW-GLOBAL-VAR-XI_MODEL_ID": safeHeaderValue(request.modelId, 240),
    "X-LANGFLOW-GLOBAL-VAR-XI_MODEL_NAME": safeHeaderValue(request.modelName, 240),
    "X-LANGFLOW-GLOBAL-VAR-XI_VENDOR": safeHeaderValue(request.vendor, 80)
  };
}

export async function startLangflowWorkflow(config, request, { fetchImpl = fetch, signal } = {}) {
  if (!config?.enabled) {
    throw new LangflowClientError("Langflow 工作流尚未启用", {
      status: 503,
      code: "LANGFLOW_DISABLED"
    });
  }
  if (!config?.configured) {
    throw new LangflowClientError("Langflow 工作流服务尚未完成配置", {
      status: 503,
      code: "LANGFLOW_NOT_CONFIGURED"
    });
  }

  const linked = linkedAbortSignal(signal, config.timeoutMs);
  try {
    const response = await fetchImpl(workflowEndpoint(config.baseUrl, config.workflowPath), {
      method: "POST",
      headers: langflowHeaders(config, request),
      body: JSON.stringify({
        flow_id: request.flowId,
        input_value: request.input,
        mode: "stream",
        session_id: request.sessionId,
        stream_protocol: "langflow"
      }),
      redirect: "error",
      signal: linked.signal
    });

    if (!response.ok) {
      const body = (await response.text().catch(() => "")).slice(0, maxUpstreamErrorLength);
      throw new LangflowClientError(
        body ? `Langflow 请求失败：${body}` : `Langflow 请求失败（${response.status}）`,
        { upstreamStatus: response.status }
      );
    }
    if (!response.body) {
      throw new LangflowClientError("Langflow 没有返回可读取的数据流");
    }
    return { response, dispose: linked.dispose };
  } catch (error) {
    linked.dispose();
    if (error instanceof LangflowClientError) throw error;
    if (error?.name === "AbortError" || linked.signal.aborted) {
      throw new LangflowClientError("Langflow 请求已取消或超时", {
        status: signal?.aborted ? 499 : 504,
        code: signal?.aborted ? "LANGFLOW_CANCELLED" : "LANGFLOW_TIMEOUT"
      });
    }
    throw new LangflowClientError("无法连接 Langflow 工作流服务");
  }
}

function parsedJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function firstString(values) {
  return values.map(stringValue).find(Boolean) || "";
}

function nestedPayload(payload) {
  return payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
    ? payload.data
    : null;
}

export function normalizeLangflowEvent(eventName, payload) {
  const nested = nestedPayload(payload);
  const kind = firstString([
    eventName,
    payload?.event,
    payload?.type,
    nested?.event,
    nested?.type
  ]).toLowerCase();
  const token = firstString([
    payload?.token,
    payload?.delta,
    payload?.chunk,
    nested?.token,
    nested?.delta,
    nested?.chunk
  ]);
  if (token || kind === "token") return { type: "token", token };

  const text = firstString([
    payload?.text,
    payload?.message?.text,
    payload?.message,
    payload?.output,
    nested?.text,
    nested?.message?.text,
    nested?.message,
    nested?.output
  ]);
  if (["end", "done", "complete", "completed", "add_message"].includes(kind)) {
    return { type: "done", text };
  }
  if (["error", "failed", "failure"].includes(kind)) {
    return { type: "error", error: text || "Langflow 工作流执行失败" };
  }
  return { type: "status", event: kind || "message", payload };
}

function parseSseFrame(frame) {
  const lines = frame.split(/\r?\n/);
  const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "";
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return data === "[DONE]" ? { type: "done", text: "" } : null;
  return normalizeLangflowEvent(eventName, parsedJson(data) ?? { text: data });
}

export async function* readLangflowEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  const sseStream = contentType.includes("text/event-stream");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    if (sseStream) {
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const event = parseSseFrame(frame.trim());
        if (event) yield event;
      }
    } else {
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
        const payload = parsedJson(line);
        if (payload) yield normalizeLangflowEvent("", payload);
      }
    }
  }

  buffer += decoder.decode();

  const tail = buffer.trim();
  if (tail) {
    const event = sseStream
      ? parseSseFrame(tail)
      : normalizeLangflowEvent("", parsedJson(tail) ?? { text: tail });
    if (event) yield event;
  }
}
