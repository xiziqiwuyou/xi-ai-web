function positiveInt(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function createRequestGuard({
  scope,
  windowMs = process.env.REQUEST_RATE_WINDOW_MS,
  maxRequests = process.env.REQUEST_RATE_MAX_REQUESTS,
  maxConcurrent = process.env.REQUEST_MAX_CONCURRENT
}) {
  const normalizedWindowMs = positiveInt(windowMs, 60_000, 3_600_000);
  const normalizedMaxRequests = positiveInt(maxRequests, 30, 10_000);
  const normalizedMaxConcurrent = positiveInt(maxConcurrent, 8, 512);
  const buckets = new Map();
  let concurrent = 0;

  return (req, res, next) => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    const key = `${scope}:${clientKey(req)}`;
    const bucket = buckets.get(key);
    const current = bucket && bucket.resetAt > now
      ? bucket
      : { count: 0, resetAt: now + normalizedWindowMs };
    current.count += 1;
    buckets.set(key, current);
    if (current.count > normalizedMaxRequests) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      return res.status(429).json({ error: "请求过于频繁，请稍后再试" });
    }
    if (concurrent >= normalizedMaxConcurrent) {
      res.setHeader("Retry-After", "5");
      return res.status(429).json({ error: "当前请求繁忙，请稍后再试" });
    }

    concurrent += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      concurrent = Math.max(0, concurrent - 1);
    };
    res.once("finish", release);
    res.once("close", release);
    req.requestGuardScope = scope;
    return next();
  };
}
