import { expect, seedReadyProvider, test, waitForPublicModule, publicDestinations } from "./support/app-fixture";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Protocol contracts run once in Chromium");
  await seedReadyProvider(page);
  await page.goto("/chat");
  await waitForPublicModule(page, publicDestinations[0]);
});

test("two browsers derive one fingerprint and authenticated payload key", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const dynamicImport = new Function("path", "return import(path)") as (path: string) => Promise<Record<string, any>>;
    const cryptoModule = await dynamicImport("/src/features/workspace/progressSyncCrypto.ts");
    const archiveModule = await dynamicImport("/src/features/workspace/workspaceArchive.ts");
    const typeModule = await dynamicImport("/src/features/workspace/progressSyncTypes.ts");
    const sender = await cryptoModule.generateProgressSyncEphemeralKeys();
    const receiver = await cryptoModule.generateProgressSyncEphemeralKeys();
    const sessionId = "progress-sync-test-session";
    const senderFingerprint = await cryptoModule.progressSyncFingerprint(sessionId, sender.material, receiver.material);
    const receiverFingerprint = await cryptoModule.progressSyncFingerprint(sessionId, sender.material, receiver.material);
    const senderKey = await cryptoModule.deriveProgressSyncKey({
      sessionId,
      ownPrivateKey: sender.keyPair.privateKey,
      sender: sender.material,
      receiver: receiver.material,
      peer: receiver.material
    });
    const receiverKey = await cryptoModule.deriveProgressSyncKey({
      sessionId,
      ownPrivateKey: receiver.keyPair.privateKey,
      sender: sender.material,
      receiver: receiver.material,
      peer: sender.material
    });
    const workspace = archiveModule.emptyWorkspaceSnapshot();
    const envelope = await archiveModule.createWorkspaceExport(workspace);
    const payload = typeModule.createProgressSyncPayload({
      workspace: envelope,
      sourceRevision: 7,
      resume: { path: "/image", moduleId: "image", lastModelId: "test-image" },
      includeApiKey: true,
      userProvider: { apiKey: "temporary-e2e-key", lastModelId: "test-image" }
    });
    const packet = await cryptoModule.encryptProgressSyncPayload(payload, senderKey, sessionId, 5 * 1024 * 1024);
    const decoded = await cryptoModule.decryptProgressSyncPayload(packet, receiverKey, sessionId, 5 * 1024 * 1024);

    const tampered = packet.slice();
    tampered[tampered.length - 1] ^= 1;
    let tamperRejected = false;
    try {
      await cryptoModule.decryptProgressSyncPayload(tampered, receiverKey, sessionId, 5 * 1024 * 1024);
    } catch {
      tamperRejected = true;
    }
    let wrongSessionRejected = false;
    try {
      await cryptoModule.decryptProgressSyncPayload(packet, receiverKey, "progress-sync-wrong-session", 5 * 1024 * 1024);
    } catch {
      wrongSessionRejected = true;
    }
    const substituted = await cryptoModule.generateProgressSyncEphemeralKeys();
    const wrongKey = await cryptoModule.deriveProgressSyncKey({
      sessionId,
      ownPrivateKey: substituted.keyPair.privateKey,
      sender: sender.material,
      receiver: substituted.material,
      peer: sender.material
    });
    let wrongKeyRejected = false;
    try {
      await cryptoModule.decryptProgressSyncPayload(packet, wrongKey, sessionId, 5 * 1024 * 1024);
    } catch {
      wrongKeyRejected = true;
    }
    const substitutedFingerprint = await cryptoModule.progressSyncFingerprint(
      sessionId,
      sender.material,
      substituted.material
    );
    return {
      senderFingerprint,
      receiverFingerprint,
      substitutedFingerprint,
      decodedRevision: decoded.sourceRevision,
      decodedPath: decoded.resume.path,
      decodedKey: decoded.session?.userProvider?.apiKey,
      privateKeyExtractable: sender.keyPair.privateKey.extractable,
      tamperRejected,
      wrongSessionRejected,
      wrongKeyRejected
    };
  });

  expect(result.senderFingerprint).toMatch(/^\d{6}$/u);
  expect(result.receiverFingerprint).toBe(result.senderFingerprint);
  expect(result.substitutedFingerprint).not.toBe(result.senderFingerprint);
  expect(result.decodedRevision).toBe(7);
  expect(result.decodedPath).toBe("/image");
  expect(result.decodedKey).toBe("temporary-e2e-key");
  expect(result.privateKeyExtractable).toBe(false);
  expect(result.tamperRejected).toBe(true);
  expect(result.wrongSessionRejected).toBe(true);
  expect(result.wrongKeyRejected).toBe(true);
});

test("receiver revision guard rejects a stale restore preview", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const dynamicImport = new Function("path", "return import(path)") as (path: string) => Promise<Record<string, any>>;
    const repository = await dynamicImport("/src/features/workspace/workspaceRepository.ts");
    const database = await dynamicImport("/src/features/workspace/workspaceDb.ts");
    const capture = await repository.captureStableWorkspaceArchive();
    await database.putWorkspaceRecord("preferences", {
      key: "theme",
      value: "dark",
      updatedAt: new Date().toISOString()
    });
    let message = "";
    try {
      await repository.restoreWorkspaceArchive(capture.envelope, "merge", capture.revision);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    return {
      message,
      revisionBefore: capture.revision,
      revisionAfter: await database.readWorkspaceRevision()
    };
  });

  expect(result.revisionAfter).toBeGreaterThan(result.revisionBefore);
  expect(result.message).toContain("预览后发生了变化");
});
