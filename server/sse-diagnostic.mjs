export const SSE_DIAGNOSTIC_DELAY_MS = 400;

function writeEvent(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function handleSseDiagnostic(req, res, { delayMs = SSE_DIAGNOSTIC_DELAY_MS } = {}) {
  let closed = false;
  let timer = null;
  const cleanup = () => {
    closed = true;
    if (timer) clearTimeout(timer);
  };

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.socket?.setNoDelay?.(true);
  res.flushHeaders?.();
  writeEvent(res, "probe", { sequence: 1 });

  res.once("close", cleanup);
  timer = setTimeout(() => {
    if (closed || res.writableEnded || res.destroyed) return;
    writeEvent(res, "done", { sequence: 2 });
    res.end();
  }, Math.max(100, Math.min(2_000, Number(delayMs) || SSE_DIAGNOSTIC_DELAY_MS)));
}
