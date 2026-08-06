const DEFAULT_FLUSH_MS = 32;
const DEFAULT_MAX_WAIT_MS = 80;
const DEFAULT_MAX_CHARS = 512;
const DEFAULT_MAX_QUEUE_CHARS = 131_072;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function textSize(value) {
  return String(value || "").length;
}

function asError(value, fallback) {
  return value instanceof Error ? value : new Error(String(value || fallback));
}

function createAbortError(message = "SSE response was closed") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function waitForDrain(res, signal, timeoutMs) {
  if (!res.writableNeedDrain) return Promise.resolve();
  if (signal?.aborted || res.writableEnded || res.destroyed) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      res.removeListener("drain", onDrain);
      res.removeListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(createAbortError());
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    res.once("drain", onDrain);
    res.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("SSE response backpressure timeout"));
    }, timeoutMs);
  });
}

export async function writeSseEventWithBackpressure(
  res,
  event,
  payload,
  { signal, timeoutMs = 5_000 } = {}
) {
  if (signal?.aborted || res.writableEnded || res.destroyed) throw createAbortError();
  const canContinue = res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  if (!canContinue) await waitForDrain(res, signal, timeoutMs);
}

export function createSseTokenBuffer({
  flushMs = DEFAULT_FLUSH_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  maxChars = DEFAULT_MAX_CHARS,
  maxQueueChars = DEFAULT_MAX_QUEUE_CHARS,
  onFlush,
  onError
} = {}) {
  if (typeof onFlush !== "function") throw new TypeError("SSE token buffer requires an onFlush callback");

  const cadenceMs = boundedInteger(flushMs, DEFAULT_FLUSH_MS, 16, 100);
  const maximumWaitMs = boundedInteger(maxWaitMs, DEFAULT_MAX_WAIT_MS, 16, 200);
  const batchLimit = boundedInteger(maxChars, DEFAULT_MAX_CHARS, 128, 4096);
  const queueLimit = boundedInteger(maxQueueChars, DEFAULT_MAX_QUEUE_CHARS, batchLimit, 131_072);

  let buffer = "";
  let inFlightChars = 0;
  let firstQueuedAt = 0;
  let timer = null;
  let flushChain = Promise.resolve();
  let finishPromise = null;
  let terminalError = null;
  let closing = false;
  let closed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const reportError = (error) => {
    const normalized = asError(error, "SSE token buffer failed");
    if (!terminalError) {
      terminalError = normalized;
      clearTimer();
      try {
        onError?.(normalized);
      } catch {
        // Error reporting must never mask the original stream failure.
      }
    }
    return terminalError;
  };

  const enqueueFlush = () => {
    if (!buffer) return flushChain;
    const chunk = buffer;
    buffer = "";
    firstQueuedAt = 0;
    const chunkSize = textSize(chunk);
    inFlightChars += chunkSize;
    flushChain = flushChain
      .then(() => onFlush(chunk))
      .finally(() => {
        inFlightChars = Math.max(0, inFlightChars - chunkSize);
      });
    return flushChain;
  };

  const flushNow = async () => {
    if (terminalError) throw terminalError;
    const pending = enqueueFlush();
    try {
      await pending;
    } catch (error) {
      throw reportError(error);
    }
    if (buffer && !closing && !closed) scheduleFlush();
  };

  const scheduleFlush = () => {
    if (timer !== null || !buffer || closing || closed || terminalError) return;
    const now = Date.now();
    const deadline = firstQueuedAt + maximumWaitMs;
    const delay = Math.max(0, Math.min(cadenceMs, deadline - now));
    timer = setTimeout(() => {
      timer = null;
      void flushNow().catch(reportError);
    }, delay);
  };

  const push = async (value) => {
    if (closing || closed) throw new Error("SSE token buffer is closed");
    if (terminalError) throw terminalError;
    const next = String(value || "");
    if (!next) return;
    if (!buffer) firstQueuedAt = Date.now();
    buffer += next;
    if (textSize(buffer) + inFlightChars > queueLimit) {
      throw reportError(new Error("SSE token buffer queue limit reached"));
    }
    if (textSize(buffer) >= batchLimit) {
      clearTimer();
      await flushNow();
      return;
    }
    scheduleFlush();
  };

  const finish = () => {
    if (finishPromise) return finishPromise;
    finishPromise = (async () => {
      if (closed) {
        if (terminalError) throw terminalError;
        return;
      }
      closing = true;
      clearTimer();
      try {
        await flushNow();
        await flushChain;
      } catch (error) {
        throw reportError(error);
      } finally {
        closed = true;
      }
      if (terminalError) throw terminalError;
    })();
    return finishPromise;
  };

  const cancel = () => {
    closing = true;
    closed = true;
    buffer = "";
    firstQueuedAt = 0;
    clearTimer();
  };

  return {
    push,
    finish,
    cancel,
    get pendingChars() {
      return textSize(buffer) + inFlightChars;
    },
    get failed() {
      return Boolean(terminalError);
    }
  };
}

export const sseTokenBufferDefaults = Object.freeze({
  flushMs: DEFAULT_FLUSH_MS,
  maxWaitMs: DEFAULT_MAX_WAIT_MS,
  maxChars: DEFAULT_MAX_CHARS,
  maxQueueChars: DEFAULT_MAX_QUEUE_CHARS
});
