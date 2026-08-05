import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import {
  PROGRESS_SYNC_ERROR_CODES,
  createProgressSyncFileStore,
  createProgressSyncRouter,
  createProgressSyncService
} from "../../server/progress-sync.mjs";

const MEBIBYTE = 1024 * 1024;

function deterministicRandom(seed = "progress-sync-test") {
  let counter = 0;
  return (size) => {
    const chunks = [];
    let length = 0;
    while (length < size) {
      const chunk = crypto
        .createHash("sha256")
        .update(`${seed}:${counter}`)
        .digest();
      counter += 1;
      chunks.push(chunk);
      length += chunk.length;
    }
    return Buffer.concat(chunks, length).subarray(0, size);
  };
}

function publicMaterial(seed) {
  const privateKey = Buffer.alloc(32);
  privateKey[31] = seed;
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(privateKey);
  return {
    publicKey: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
    nonce: Buffer.alloc(16, seed).toString("base64url")
  };
}

function changedMaterial(material) {
  return {
    ...material,
    nonce: Buffer.alloc(16, 99).toString("base64url")
  };
}

function errorCode(code) {
  return (error) => error?.code === code;
}

async function createHarness(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-progress-sync-"));
  let now = Date.UTC(2026, 7, 4, 0, 0, 0);
  const service = createProgressSyncService({
    dataDir,
    clock: () => now,
    randomBytes: deterministicRandom(options.randomSeed),
    hashSecret: Buffer.alloc(32, 7),
    ttlMs: 10 * 60_000,
    terminalRetentionMs: 5 * 60_000,
    maxPayloadBytes: 5 * MEBIBYTE,
    autoCleanup: false,
    ...options
  });
  await service.ready;
  t.after(async () => {
    await service.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    service,
    advance(milliseconds) {
      now += milliseconds;
    }
  };
}

async function createJoinedSession(service) {
  const sender = publicMaterial(1);
  const receiver = publicMaterial(2);
  const created = await service.createSession({ sender });
  const joined = await service.joinSession({
    code: created.code,
    receiver,
    deviceLabel: "Receiver browser",
    ip: "203.0.113.10"
  });
  return { sender, receiver, created, joined };
}

async function approveSession(service, session) {
  return service.approveSession({
    sessionId: session.created.sessionId,
    creatorToken: session.created.creatorToken,
    receiver: session.receiver
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("create and join retain only hashed codes and role tokens", async (t) => {
  const { service } = await createHarness(t);
  const sender = publicMaterial(1);
  const receiver = publicMaterial(2);
  const created = await service.createSession({ sender });

  assert.match(created.sessionId, /^[A-Za-z0-9_-]{16,160}$/);
  assert.match(created.code, /^\d{6}$/);
  assert.match(created.creatorToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(created.expiresAt, new Date(Date.UTC(2026, 7, 4, 0, 10, 0)).toISOString());

  let metadata = service.snapshotMetadata();
  let serialized = JSON.stringify(metadata);
  assert.equal(serialized.includes(created.code), false);
  assert.equal(serialized.includes(created.code.replace("-", "")), false);
  assert.equal(serialized.includes(created.creatorToken), false);
  assert.match(metadata[0].codeHash, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(metadata[0].creatorTokenHash, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(metadata[0].joinTokenHash, null);

  const joined = await service.joinSession({
    code: created.code.toLowerCase().replace("-", " "),
    receiver,
    deviceLabel: "  Mobile Chrome  ",
    ip: "203.0.113.10"
  });
  assert.deepEqual(joined.sender, sender);
  assert.equal(joined.sessionId, created.sessionId);
  assert.match(joined.joinToken, /^[A-Za-z0-9_-]{40,}$/);

  metadata = service.snapshotMetadata();
  serialized = JSON.stringify(metadata);
  assert.equal(serialized.includes(joined.joinToken), false);
  assert.match(metadata[0].joinTokenHash, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(metadata[0].state, "awaiting_approval");

  const creatorStatus = await service.getStatus({
    sessionId: created.sessionId,
    token: created.creatorToken
  });
  assert.deepEqual(creatorStatus.receiver, {
    ...receiver,
    deviceLabel: "Mobile Chrome"
  });
  assert.equal(creatorStatus.sender, undefined);

  const receiverStatus = await service.getStatus({
    sessionId: created.sessionId,
    token: joined.joinToken
  });
  assert.deepEqual(receiverStatus.sender, sender);
  assert.equal(receiverStatus.receiver, undefined);
});

test("approval binds the exact receiver transcript and enforces token roles", async (t) => {
  const { service } = await createHarness(t);
  const session = await createJoinedSession(service);

  await assert.rejects(
    service.approveSession({
      sessionId: session.created.sessionId,
      creatorToken: session.joined.joinToken,
      receiver: session.receiver
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID)
  );
  await assert.rejects(
    service.approveSession({
      sessionId: session.created.sessionId,
      creatorToken: session.created.creatorToken,
      receiver: changedMaterial(session.receiver)
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.APPROVAL_MISMATCH)
  );

  const waiting = await service.getStatus({
    sessionId: session.created.sessionId,
    token: session.created.creatorToken
  });
  assert.equal(waiting.state, "awaiting_approval");

  const approved = await approveSession(service, session);
  assert.equal(approved.state, "approved");

  await assert.rejects(
    service.uploadPayload({
      sessionId: session.created.sessionId,
      creatorToken: session.joined.joinToken,
      ciphertext: Buffer.from("opaque")
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID)
  );
  await assert.rejects(
    service.claimPayload({
      sessionId: session.created.sessionId,
      joinToken: session.created.creatorToken
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID)
  );
});

test("receiver-created sessions authorize operations by semantic sender and receiver roles", async (t) => {
  const { service } = await createHarness(t);
  const sender = publicMaterial(1);
  const receiver = publicMaterial(2);
  const created = await service.createSession({
    creatorRole: "receiver",
    receiver,
    deviceLabel: "Desktop receiver"
  });
  assert.equal(created.creatorRole, "receiver");
  assert.equal(service.snapshotMetadata()[0].creatorRole, "receiver");

  const joined = await service.joinSession({
    code: created.code,
    joinRole: "sender",
    sender,
    deviceLabel: "Phone sender",
    ip: "203.0.113.11"
  });
  assert.equal(joined.joinRole, "sender");
  assert.deepEqual(joined.receiver, { ...receiver, deviceLabel: "Desktop receiver" });

  const desktopStatus = await service.getStatus({
    sessionId: created.sessionId,
    token: created.creatorToken
  });
  assert.deepEqual(desktopStatus.sender, { ...sender, deviceLabel: "Phone sender" });
  assert.equal(desktopStatus.receiver, undefined);

  const phoneStatus = await service.getStatus({
    sessionId: created.sessionId,
    token: joined.joinToken
  });
  assert.deepEqual(phoneStatus.receiver, { ...receiver, deviceLabel: "Desktop receiver" });
  assert.equal(phoneStatus.sender, undefined);

  await assert.rejects(
    service.approveSession({
      sessionId: created.sessionId,
      token: created.creatorToken,
      receiver
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID)
  );
  await assert.rejects(
    service.uploadPayload({
      sessionId: created.sessionId,
      token: created.creatorToken,
      ciphertext: Buffer.from("opaque")
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID)
  );
  await assert.rejects(
    service.claimPayload({
      sessionId: created.sessionId,
      token: joined.joinToken
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID)
  );

  const approved = await service.approveSession({
    sessionId: created.sessionId,
    token: joined.joinToken,
    receiver
  });
  assert.equal(approved.state, "approved");
  const ciphertext = Buffer.from("reverse-direction-opaque-payload");
  assert.equal((await service.uploadPayload({
    sessionId: created.sessionId,
    token: joined.joinToken,
    ciphertext
  })).state, "payload_ready");
  const claimed = await service.claimPayload({
    sessionId: created.sessionId,
    token: created.creatorToken
  });
  assert.deepEqual(claimed.ciphertext, ciphertext);
});

test("receiver-created sessions reject a same-role join without changing state", async (t) => {
  const { service } = await createHarness(t);
  const created = await service.createSession({
    creatorRole: "receiver",
    receiver: publicMaterial(2)
  });
  await assert.rejects(
    service.joinSession({
      code: created.code,
      joinRole: "receiver",
      receiver: publicMaterial(3),
      ip: "203.0.113.12"
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST)
  );
  assert.equal((await service.getStatus({
    sessionId: created.sessionId,
    token: created.creatorToken
  })).state, "waiting_join");
});

test("opaque upload is bounded and exactly one concurrent claim succeeds", async (t) => {
  const { dataDir, service } = await createHarness(t);
  const session = await createJoinedSession(service);
  await approveSession(service, session);

  const ciphertext = Buffer.concat([
    Buffer.from([1, 0, 255, 128, 13, 10]),
    crypto.createHash("sha256").update("opaque bytes").digest()
  ]);
  const uploaded = await service.uploadPayload({
    sessionId: session.created.sessionId,
    creatorToken: session.created.creatorToken,
    ciphertext
  });
  assert.equal(uploaded.state, "payload_ready");
  assert.equal(uploaded.payloadBytes, ciphertext.length);

  const payloadDirectory = path.join(dataDir, "progress-sync");
  const payloadFiles = fs.readdirSync(payloadDirectory);
  assert.equal(payloadFiles.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(payloadDirectory, payloadFiles[0])), ciphertext);
  assert.equal(JSON.stringify(service.snapshotMetadata()).includes(ciphertext.toString("base64")), false);

  const claims = await Promise.allSettled([
    service.claimPayload({
      sessionId: session.created.sessionId,
      joinToken: session.joined.joinToken
    }),
    service.claimPayload({
      sessionId: session.created.sessionId,
      joinToken: session.joined.joinToken
    })
  ]);
  const fulfilled = claims.filter((claim) => claim.status === "fulfilled");
  const rejected = claims.filter((claim) => claim.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.deepEqual(fulfilled[0].value.ciphertext, ciphertext);
  assert.equal(fulfilled[0].value.state, "completed");
  assert.equal(rejected[0].reason.code, PROGRESS_SYNC_ERROR_CODES.ALREADY_CLAIMED);
  assert.deepEqual(fs.readdirSync(payloadDirectory), []);

  const status = await service.getStatus({
    sessionId: session.created.sessionId,
    token: session.created.creatorToken
  });
  assert.equal(status.state, "completed");
  assert.equal(status.sender, undefined);
  assert.equal(status.receiver, undefined);

  await assert.rejects(
    service.claimPayload({
      sessionId: session.created.sessionId,
      joinToken: session.joined.joinToken
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.ALREADY_CLAIMED)
  );
});

test("duplicate joins, rejection, and cancellation are deterministic and remove payload files", async (t) => {
  const { dataDir, service } = await createHarness(t);
  const rejectedSession = await createJoinedSession(service);

  await assert.rejects(
    service.joinSession({
      code: rejectedSession.created.code,
      receiver: publicMaterial(3),
      deviceLabel: "Second receiver",
      ip: "203.0.113.11"
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.JOIN_ALREADY_PENDING)
  );

  const rejected = await service.rejectSession({
    sessionId: rejectedSession.created.sessionId,
    creatorToken: rejectedSession.created.creatorToken
  });
  assert.equal(rejected.state, "rejected");
  const rejectedStatus = await service.getStatus({
    sessionId: rejectedSession.created.sessionId,
    token: rejectedSession.joined.joinToken
  });
  assert.equal(rejectedStatus.state, "rejected");
  await assert.rejects(
    service.claimPayload({
      sessionId: rejectedSession.created.sessionId,
      joinToken: rejectedSession.joined.joinToken
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.REJECTED)
  );

  const cancelledSession = await createJoinedSession(service);
  await approveSession(service, cancelledSession);
  await service.uploadPayload({
    sessionId: cancelledSession.created.sessionId,
    creatorToken: cancelledSession.created.creatorToken,
    ciphertext: crypto.randomBytes(64)
  });
  assert.equal(fs.readdirSync(path.join(dataDir, "progress-sync")).length, 1);

  const cancelled = await service.cancelSession({
    sessionId: cancelledSession.created.sessionId,
    token: cancelledSession.joined.joinToken
  });
  assert.equal(cancelled.state, "cancelled");
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "progress-sync")), []);
  assert.equal((await service.cancelSession({
    sessionId: cancelledSession.created.sessionId,
    token: cancelledSession.created.creatorToken
  })).state, "cancelled");
});

test("expiry cleanup removes active payloads and restart cleanup removes orphaned files", async (t) => {
  const { dataDir, service, advance } = await createHarness(t);
  const session = await createJoinedSession(service);
  await approveSession(service, session);
  await service.uploadPayload({
    sessionId: session.created.sessionId,
    creatorToken: session.created.creatorToken,
    ciphertext: crypto.randomBytes(80)
  });

  advance(10 * 60_000 + 1);
  const cleanup = await service.cleanupExpired();
  assert.equal(cleanup.expired, 1);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "progress-sync")), []);
  assert.equal((await service.getStatus({
    sessionId: session.created.sessionId,
    token: session.created.creatorToken
  })).state, "expired");
  await assert.rejects(
    service.joinSession({
      code: session.created.code,
      receiver: publicMaterial(4),
      ip: "203.0.113.12"
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.CODE_EXPIRED)
  );

  await service.close();
  const orphan = path.join(dataDir, "progress-sync", "orphan.payload");
  fs.writeFileSync(orphan, Buffer.from("opaque orphan"));
  const restarted = createProgressSyncService({
    dataDir,
    randomBytes: deterministicRandom("restart"),
    hashSecret: Buffer.alloc(32, 8),
    autoCleanup: false
  });
  await restarted.ready;
  t.after(() => restarted.close());
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "progress-sync")), []);
  assert.deepEqual(restarted.snapshotMetadata(), []);
});

test("per-IP, per-session, and authentication attempt limits are bounded", async (t) => {
  const { service } = await createHarness(t, {
    maxIpJoinAttempts: 2,
    maxSessionJoinAttempts: 1,
    maxSessionAuthAttempts: 2
  });
  const receiver = publicMaterial(2);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      service.joinSession({ code: "AAAA-AAAA", receiver, ip: "198.51.100.1" }),
      errorCode(PROGRESS_SYNC_ERROR_CODES.CODE_INVALID)
    );
  }
  await assert.rejects(
    service.joinSession({ code: "AAAA-AAAA", receiver, ip: "198.51.100.1" }),
    (error) => error?.code === PROGRESS_SYNC_ERROR_CODES.ATTEMPT_LIMIT
      && error.retryAfterSeconds > 0
  );
  await assert.rejects(
    service.joinSession({ code: "AAAA-AAAA", receiver, ip: "198.51.100.2" }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.CODE_INVALID)
  );

  const created = await service.createSession({ sender: publicMaterial(1) });
  await service.joinSession({
    code: created.code,
    receiver,
    ip: "198.51.100.3"
  });
  await assert.rejects(
    service.joinSession({
      code: created.code,
      receiver: publicMaterial(3),
      ip: "198.51.100.4"
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.ATTEMPT_LIMIT)
  );
  assert.equal((await service.getStatus({
    sessionId: created.sessionId,
    token: created.creatorToken
  })).state, "expired");

  const authSession = await service.createSession({ sender: publicMaterial(4) });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      service.getStatus({ sessionId: authSession.sessionId, token: `wrong-${attempt}` }),
      errorCode(PROGRESS_SYNC_ERROR_CODES.AUTH_INVALID)
    );
  }
  await assert.rejects(
    service.getStatus({ sessionId: authSession.sessionId, token: "wrong-final" }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.ATTEMPT_LIMIT)
  );
});

test("validation rejects malformed handshake data, traversal IDs, empty bodies, and oversized payloads", async (t) => {
  const { dataDir, service } = await createHarness(t, { maxSessions: 1 });

  await assert.rejects(
    service.createSession({
      sender: {
        publicKey: Buffer.alloc(65, 4).toString("base64url"),
        nonce: Buffer.alloc(16).toString("base64url")
      }
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST)
  );

  const session = await createJoinedSession(service);
  await approveSession(service, session);
  await assert.rejects(
    service.getStatus({ sessionId: "../../outside", token: session.created.creatorToken }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.INVALID_REQUEST)
  );
  await assert.rejects(
    service.uploadPayload({
      sessionId: session.created.sessionId,
      creatorToken: session.created.creatorToken,
      ciphertext: Buffer.alloc(0)
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.PAYLOAD_INVALID)
  );
  await assert.rejects(
    service.uploadPayload({
      sessionId: session.created.sessionId,
      creatorToken: session.created.creatorToken,
      ciphertext: Buffer.alloc(5 * MEBIBYTE + 1)
    }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.PAYLOAD_TOO_LARGE)
  );
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "progress-sync")), []);
  assert.equal((await service.getStatus({
    sessionId: session.created.sessionId,
    token: session.created.creatorToken
  })).state, "approved");

  await assert.rejects(
    service.createSession({ sender: publicMaterial(5) }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.CAPACITY_REACHED)
  );
});

test("the in-memory metadata cap evicts only scrubbed terminal tombstones", async (t) => {
  const { service } = await createHarness(t, { maxSessions: 1 });
  const first = await service.createSession({ sender: publicMaterial(1) });
  await service.cancelSession({ sessionId: first.sessionId, token: first.creatorToken });
  assert.equal(service.snapshotMetadata()[0].state, "cancelled");

  const second = await service.createSession({ sender: publicMaterial(2) });
  assert.notEqual(second.sessionId, first.sessionId);
  assert.equal(service.snapshotMetadata().length, 1);
  await assert.rejects(
    service.getStatus({ sessionId: first.sessionId, token: first.creatorToken }),
    errorCode(PROGRESS_SYNC_ERROR_CODES.SESSION_NOT_FOUND)
  );
});

test("an interrupted atomic upload leaves no partial file and exposes no storage error text", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-progress-sync-fault-"));
  const realPromises = fs.promises;
  let failRename = true;
  const fsModule = new Proxy(realPromises, {
    get(target, property) {
      if (property === "rename") {
        return async (...arguments_) => {
          if (failRename) {
            failRename = false;
            throw new Error("TOP_SECRET_PLAINTEXT_SENTINEL");
          }
          return target.rename(...arguments_);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const storage = createProgressSyncFileStore({
    dataDir,
    fsModule,
    randomBytes: deterministicRandom("storage")
  });
  const service = createProgressSyncService({
    storage,
    randomBytes: deterministicRandom("service"),
    hashSecret: Buffer.alloc(32, 9),
    maxPayloadBytes: 5 * MEBIBYTE,
    autoCleanup: false
  });
  await service.ready;
  t.after(async () => {
    await service.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const session = await createJoinedSession(service);
  await approveSession(service, session);
  const ciphertext = crypto.randomBytes(96);
  await assert.rejects(
    service.uploadPayload({
      sessionId: session.created.sessionId,
      creatorToken: session.created.creatorToken,
      ciphertext
    }),
    (error) => error?.code === PROGRESS_SYNC_ERROR_CODES.STORAGE_UNAVAILABLE
      && !error.message.includes("TOP_SECRET_PLAINTEXT_SENTINEL")
  );
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "progress-sync")), []);
  assert.equal((await service.getStatus({
    sessionId: session.created.sessionId,
    token: session.created.creatorToken
  })).state, "approved");

  await service.uploadPayload({
    sessionId: session.created.sessionId,
    creatorToken: session.created.creatorToken,
    ciphertext
  });
  assert.equal(fs.readdirSync(path.join(dataDir, "progress-sync")).length, 1);
});

test("the standalone router applies no-store and route-specific raw body limits", async (t) => {
  const { service } = await createHarness(t);
  const app = express();
  app.use("/api/progress-sync", createProgressSyncRouter({ service }));
  const server = http.createServer(app);
  const origin = await listen(server);
  t.after(() => closeServer(server));

  const created = await fetch(`${origin}/api/progress-sync/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: publicMaterial(1) })
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store, max-age=0");
  assert.match((await created.json()).code, /^\d{6}$/);

  const invalidJoin = await fetch(`${origin}/api/progress-sync/sessions/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: "AAAA-AAAA",
      receiver: publicMaterial(2),
      deviceLabel: "Browser"
    })
  });
  assert.equal(invalidJoin.status, 404);
  assert.equal(invalidJoin.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal((await invalidJoin.json()).error.code, PROGRESS_SYNC_ERROR_CODES.CODE_INVALID);

  const oversized = await fetch(`${origin}/api/progress-sync/sessions/invalid/payload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Progress-Sync-Creator-Token": "not-a-token"
    },
    body: Buffer.alloc(5 * MEBIBYTE + 1)
  });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal((await oversized.json()).error.code, PROGRESS_SYNC_ERROR_CODES.PAYLOAD_TOO_LARGE);

  const missing = await fetch(`${origin}/api/progress-sync/not-a-route`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store, max-age=0");
});

test("runtime configuration updates apply to newly created sessions", async (t) => {
  const { service } = await createHarness(t);
  const config = service.updateConfig({
    ttlSeconds: 180,
    maxPayloadMb: 12,
    maxIpJoinAttempts: 3,
    maxSessionJoinAttempts: 2
  });
  assert.deepEqual(config, {
    ttlSeconds: 180,
    maxPayloadBytes: 12 * MEBIBYTE,
    maxIpJoinAttempts: 3,
    maxSessionJoinAttempts: 2
  });
  assert.equal(service.maxPayloadBytes, 12 * MEBIBYTE);
  const created = await service.createSession({ sender: publicMaterial(1) });
  assert.equal(created.expiresAt, new Date(Date.UTC(2026, 7, 4, 0, 3, 0)).toISOString());
});
