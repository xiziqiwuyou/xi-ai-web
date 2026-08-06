const MAX_SHELL_JWT_CHARS = 8_192;
const MAX_API_KEY_CHARS = 4_096;
const MAX_RESPONSE_CHARS = 128_000;

export class ShellJwtExchangeError extends Error {
  constructor(status, message, code = "SHELL_JWT_EXCHANGE_FAILED") {
    super(message);
    this.name = "ShellJwtExchangeError";
    this.status = status;
    this.code = code;
  }
}

function boundedSecret(value, label, maximum, minimum = 1) {
  const text = String(value || "").trim();
  if (text.length < minimum || text.length > maximum || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new ShellJwtExchangeError(400, `${label}无效`);
  }
  return text;
}

function controlPlaneOrigin(upstreamBaseUrl) {
  try {
    return new URL(String(upstreamBaseUrl || "")).origin;
  } catch {
    throw new ShellJwtExchangeError(500, "上游服务地址未正确配置");
  }
}

async function responseJson(response, failureMessage) {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new ShellJwtExchangeError(502, failureMessage);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ShellJwtExchangeError(502, failureMessage);
  }
}

function isCrossDomainLoginDisabled(payload) {
  const message = typeof payload?.message === "string" ? payload.message : "";
  return /jwt\s+cross-domain\s+login\s+is\s+not\s+enabled\s+by\s+the\s+administrator/iu.test(message);
}

function upstreamFailure(response, payload, failureMessage) {
  if (isCrossDomainLoginDisabled(payload)) {
    return new ShellJwtExchangeError(
      502,
      "上游未启用跨域 JWT 登录，请在 Shell 管理端开启后重试",
      "UPSTREAM_CROSS_DOMAIN_LOGIN_DISABLED"
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new ShellJwtExchangeError(401, failureMessage, "UPSTREAM_AUTH_EXPIRED");
  }
  if (response.status === 404 || response.status === 405) {
    return new ShellJwtExchangeError(
      502,
      "上游未找到 Shell 令牌兑换接口，请检查统一上游 API 域名",
      "UPSTREAM_ENDPOINT_MISSING"
    );
  }
  return new ShellJwtExchangeError(502, failureMessage, "UPSTREAM_EXCHANGE_FAILED");
}

async function shellRequest(fetchImpl, url, init, failureMessage) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    if (init.signal?.aborted) {
      throw new ShellJwtExchangeError(504, "外部登录令牌验证超时，请重试");
    }
    throw new ShellJwtExchangeError(502, failureMessage);
  }
  const payload = await responseJson(response, failureMessage);
  if (!response.ok || payload?.success !== true) {
    throw upstreamFailure(response, payload, failureMessage);
  }
  return payload;
}

export async function exchangeShellJwt({ token, upstreamBaseUrl, fetchImpl = fetch, signal }) {
  const shellJwt = boundedSecret(token, "外部登录令牌", MAX_SHELL_JWT_CHARS, 16);
  const origin = controlPlaneOrigin(upstreamBaseUrl);
  const commonHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-S-Token": shellJwt
  };

  const refresh = await shellRequest(
    fetchImpl,
    new URL("/api/user/login/refresh", origin),
    {
      method: "POST",
      headers: commonHeaders,
      body: "{}",
      redirect: "error",
      signal
    },
    "外部登录令牌无效或已过期"
  );

  const refreshedJwt = refresh?.token
    ? boundedSecret(refresh.token, "刷新后的登录令牌", MAX_SHELL_JWT_CHARS, 16)
    : shellJwt;
  const defaultToken = await shellRequest(
    fetchImpl,
    new URL("/api/token/default", origin),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-S-Token": refreshedJwt
      },
      redirect: "error",
      signal
    },
    "无法获取当前账号的默认 API Key"
  );

  const key = boundedSecret(defaultToken?.data?.key, "默认 API Key", MAX_API_KEY_CHARS);
  return { apiKey: key.startsWith("sk-") ? key : `sk-${key}` };
}
