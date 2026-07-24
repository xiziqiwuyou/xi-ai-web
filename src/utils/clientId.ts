function fallbackUuid() {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    const seed = Date.now();
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (seed + index * 31 + Math.floor(Math.random() * 256)) & 0xff;
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createClientId(prefix = "") {
  const cryptoApi = globalThis.crypto;
  const uuid = typeof cryptoApi?.randomUUID === "function" ? cryptoApi.randomUUID() : fallbackUuid();
  return prefix ? `${prefix}-${uuid}` : uuid;
}
