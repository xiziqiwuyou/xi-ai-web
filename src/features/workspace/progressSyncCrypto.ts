import type { ProgressSyncPayload, ProgressSyncPublicMaterial } from "./progressSyncTypes";
import { parseProgressSyncPayload } from "./progressSyncTypes";

const packetVersion = 1;
const packetHeaderBytes = 14;
const compressedFlag = 1;
const publicKeyBytes = 65;
const nonceBytes = 16;

export type ProgressSyncEphemeralKeys = {
  keyPair: CryptoKeyPair;
  material: ProgressSyncPublicMaterial;
};

function requireWebCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error("当前浏览器不支持临时同步所需的 Web Crypto。");
  }
  return globalThis.crypto;
}

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

export function decodeBase64Url(value: string, maxBytes = 512) {
  const text = String(value || "").trim();
  if (!text || !/^[A-Za-z0-9_-]+$/u.test(text)) throw new Error("同步握手数据格式无效。");
  const padding = "=".repeat((4 - (text.length % 4)) % 4);
  let binary = "";
  try {
    binary = atob(text.replace(/-/gu, "+").replace(/_/gu, "/") + padding);
  } catch {
    throw new Error("同步握手数据格式无效。");
  }
  if (binary.length > maxBytes) throw new Error("同步握手数据超出限制。");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function generateProgressSyncEphemeralKeys(): Promise<ProgressSyncEphemeralKeys> {
  const cryptoApi = requireWebCrypto();
  const keyPair = await cryptoApi.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
  const rawPublicKey = new Uint8Array(await cryptoApi.subtle.exportKey("raw", keyPair.publicKey));
  const nonce = cryptoApi.getRandomValues(new Uint8Array(nonceBytes));
  return {
    keyPair,
    material: {
      publicKey: encodeBase64Url(rawPublicKey),
      nonce: encodeBase64Url(nonce)
    }
  };
}

function normalizeMaterial(value: ProgressSyncPublicMaterial) {
  const publicKey = decodeBase64Url(value.publicKey, publicKeyBytes);
  const nonce = decodeBase64Url(value.nonce, nonceBytes);
  if (publicKey.length !== publicKeyBytes || publicKey[0] !== 4 || nonce.length !== nonceBytes) {
    throw new Error("同步握手公钥或随机数无效。");
  }
  return {
    publicKey: encodeBase64Url(publicKey),
    nonce: encodeBase64Url(nonce),
    publicKeyBytes: publicKey
  };
}

export function progressSyncTranscript(
  sessionId: string,
  sender: ProgressSyncPublicMaterial,
  receiver: ProgressSyncPublicMaterial
) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!/^[A-Za-z0-9_-]{16,160}$/u.test(normalizedSessionId)) throw new Error("临时同步会话 ID 无效。");
  const senderMaterial = normalizeMaterial(sender);
  const receiverMaterial = normalizeMaterial(receiver);
  return JSON.stringify({
    protocol: "xi-ai-web.progress-sync/1",
    sessionId: normalizedSessionId,
    senderPublicKey: senderMaterial.publicKey,
    senderNonce: senderMaterial.nonce,
    receiverPublicKey: receiverMaterial.publicKey,
    receiverNonce: receiverMaterial.nonce
  });
}

export async function deriveProgressSyncKey(input: {
  sessionId: string;
  ownPrivateKey: CryptoKey;
  sender: ProgressSyncPublicMaterial;
  receiver: ProgressSyncPublicMaterial;
  peer: ProgressSyncPublicMaterial;
}) {
  const cryptoApi = requireWebCrypto();
  const transcript = progressSyncTranscript(input.sessionId, input.sender, input.receiver);
  const peer = normalizeMaterial(input.peer);
  let peerPublicKey: CryptoKey;
  try {
    peerPublicKey = await cryptoApi.subtle.importKey(
      "raw",
      exactArrayBuffer(peer.publicKeyBytes),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );
  } catch {
    throw new Error("无法导入另一台设备的临时公钥。");
  }
  const sharedBits = await cryptoApi.subtle.deriveBits(
    { name: "ECDH", public: peerPublicKey },
    input.ownPrivateKey,
    256
  );
  const hkdfKey = await cryptoApi.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const transcriptBytes = new TextEncoder().encode(transcript);
  const salt = await cryptoApi.subtle.digest("SHA-256", transcriptBytes);
  return cryptoApi.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: exactArrayBuffer(transcriptBytes)
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function progressSyncFingerprint(
  sessionId: string,
  sender: ProgressSyncPublicMaterial,
  receiver: ProgressSyncPublicMaterial
) {
  const digest = new Uint8Array(await requireWebCrypto().subtle.digest(
    "SHA-256",
    new TextEncoder().encode(progressSyncTranscript(sessionId, sender, receiver))
  ));
  let value = 0;
  for (let index = 0; index < 8; index += 1) value = (value * 256 + digest[index]) % 1_000_000;
  return String(value).padStart(6, "0");
}

function progressSyncAad(sessionId: string) {
  return new TextEncoder().encode(`xi-ai-web.progress-sync/1:${sessionId}`);
}

async function gzip(bytes: Uint8Array) {
  if (typeof CompressionStream === "undefined") return { bytes, compressed: false };
  const stream = new Blob([exactArrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return compressed.length < bytes.length ? { bytes: compressed, compressed: true } : { bytes, compressed: false };
}

async function readBoundedStream(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("decompressed payload exceeds limit");
        throw new Error("解压后的同步快照超出安全限制。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function gunzip(bytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器无法解压该同步快照。");
  const stream = new Blob([exactArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return readBoundedStream(stream, 256 * 1024 * 1024);
}

export async function encryptProgressSyncPayload(
  payload: ProgressSyncPayload,
  key: CryptoKey,
  sessionId: string,
  maxBytes: number
) {
  const limit = Math.max(5 * 1024 * 1024, Math.min(64 * 1024 * 1024, Math.trunc(maxBytes)));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const prepared = await gzip(plain);
  const iv = requireWebCrypto().getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await requireWebCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: exactArrayBuffer(iv),
      additionalData: exactArrayBuffer(progressSyncAad(sessionId)),
      tagLength: 128
    },
    key,
    exactArrayBuffer(prepared.bytes)
  ));
  const packet = new Uint8Array(packetHeaderBytes + ciphertext.length);
  packet[0] = packetVersion;
  packet[1] = prepared.compressed ? compressedFlag : 0;
  packet.set(iv, 2);
  packet.set(ciphertext, packetHeaderBytes);
  if (packet.byteLength > limit) throw new Error(`加密后的同步快照超过 ${Math.floor(limit / 1024 / 1024)} MB 限制。`);
  return packet;
}

export async function decryptProgressSyncPayload(
  packetValue: ArrayBuffer | Uint8Array,
  key: CryptoKey,
  sessionId: string,
  maxBytes: number
) {
  const packet = packetValue instanceof Uint8Array ? packetValue : new Uint8Array(packetValue);
  const limit = Math.max(5 * 1024 * 1024, Math.min(64 * 1024 * 1024, Math.trunc(maxBytes)));
  if (packet.byteLength < packetHeaderBytes + 16 || packet.byteLength > limit) {
    throw new Error("加密同步快照的大小无效。");
  }
  if (packet[0] !== packetVersion || (packet[1] & ~compressedFlag) !== 0) {
    throw new Error("不支持的加密同步快照版本。");
  }
  const iv = packet.slice(2, packetHeaderBytes);
  const ciphertext = packet.slice(packetHeaderBytes);
  let decrypted: Uint8Array;
  try {
    decrypted = new Uint8Array(await requireWebCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: exactArrayBuffer(iv),
        additionalData: exactArrayBuffer(progressSyncAad(sessionId)),
        tagLength: 128
      },
      key,
      exactArrayBuffer(ciphertext)
    ));
  } catch {
    throw new Error("同步快照解密失败，安全指纹或会话可能不匹配。");
  }
  const plain = packet[1] & compressedFlag ? await gunzip(decrypted) : decrypted;
  if (plain.byteLength > 256 * 1024 * 1024) throw new Error("解压后的同步快照超出安全限制。");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    throw new Error("同步快照内容损坏或不是有效 JSON。");
  }
  return parseProgressSyncPayload(value);
}
