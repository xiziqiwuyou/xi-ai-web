const DEFAULT_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createMetadataWriteQueue({
  methods = DEFAULT_WRITE_METHODS,
  shouldQueue = () => true
} = {}) {
  const writeMethods = methods instanceof Set
    ? methods
    : new Set(Array.from(methods || [], (method) => String(method).toUpperCase()));
  let tail = Promise.resolve();

  return function metadataWriteQueue(req, res, next) {
    if (
      !writeMethods.has(String(req.method || "").toUpperCase()) ||
      !shouldQueue(req)
    ) return next();

    const previous = tail;
    let unlock;
    const current = new Promise((resolve) => {
      unlock = resolve;
    });
    tail = previous.then(() => current);

    let released = false;
    let disconnectedWhileWaiting = Boolean(req.aborted || res.destroyed);
    const markDisconnected = () => {
      disconnectedWhileWaiting = true;
    };
    const release = () => {
      if (released) return;
      released = true;
      unlock();
    };

    req.once?.("aborted", markDisconnected);
    res.once?.("close", markDisconnected);

    void previous.then(() => {
      req.removeListener?.("aborted", markDisconnected);
      res.removeListener?.("close", markDisconnected);

      if (disconnectedWhileWaiting || req.aborted || res.destroyed) {
        release();
        return;
      }

      res.once("finish", release);
      res.once("close", release);
      try {
        next();
      } catch (error) {
        release();
        next(error);
      }
    });
  };
}
