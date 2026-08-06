import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import {
  Check,
  Clipboard,
  KeyRound,
  Link2,
  LoaderCircle,
  QrCode,
  Send,
  ShieldCheck,
  X
} from "lucide-react";
import type { UserProviderConfig } from "../../types";
import { publicModuleFromPath } from "../../app/publicRoutes";
import { maskUserProviderKey, saveUserProviderConfig } from "../settings/userProviderConfig";
import { progressSyncClient } from "./progressSyncClient";
import {
  decryptProgressSyncPayload,
  deriveProgressSyncKey,
  encryptProgressSyncPayload,
  generateProgressSyncEphemeralKeys,
  progressSyncFingerprint,
  type ProgressSyncEphemeralKeys
} from "./progressSyncCrypto";
import {
  compactProgressSyncCode,
  createProgressSyncPayload,
  formatProgressSyncCode,
  progressSyncDefaultMaxBytes,
  type ProgressSyncPayload,
  type ProgressSyncPeerMaterial,
  type ProgressSyncPreview,
  type ProgressSyncStatus
} from "./progressSyncTypes";
import {
  captureStableWorkspaceArchive,
  restoreWorkspaceArchive
} from "./workspaceRepository";
import { readWorkspaceRevision } from "./workspaceDb";

type ProgressSyncPanelProps = {
  userProvider: UserProviderConfig;
  initialMode?: "send" | "receive";
  initialCode?: string;
  includeApiKey: boolean;
  onRequestApiKeyInclusion: () => void;
  onDisableApiKeyInclusion: () => void;
  restoreMode: "merge" | "replace";
  onRestoreModeChange: (mode: "merge" | "replace") => void;
  onRequestReplace: (restore: () => void) => void;
};

type SenderState = {
  phase: "idle" | "capturing" | "waiting" | "approval" | "uploading" | "complete" | "error";
  sessionId: string;
  code: string;
  token: string;
  expiresAt: string;
  keys?: ProgressSyncEphemeralKeys;
  payload?: ProgressSyncPayload;
  receiver?: ProgressSyncPeerMaterial;
  fingerprint: string;
  deviceLabel: string;
  error: string;
};

type ReceiverState = {
  phase: "idle" | "inviting" | "joining" | "waiting" | "claiming" | "preview" | "restoring" | "complete" | "error";
  sessionId: string;
  code: string;
  token: string;
  expiresAt: string;
  keys?: ProgressSyncEphemeralKeys;
  sender?: ProgressSyncPeerMaterial;
  fingerprint: string;
  preview?: ProgressSyncPreview;
  error: string;
};

const emptySender: SenderState = {
  phase: "idle",
  sessionId: "",
  code: "",
  token: "",
  expiresAt: "",
  fingerprint: "",
  deviceLabel: "",
  error: ""
};

const emptyReceiver: ReceiverState = {
  phase: "idle",
  sessionId: "",
  code: "",
  token: "",
  expiresAt: "",
  fingerprint: "",
  error: ""
};

const progressCountLabels: Record<string, string> = {
  conversations: "对话",
  galleryItems: "画廊",
  imageGenerationHistory: "生图记录",
  knowledgeDocuments: "知识文档",
  mediaJobs: "媒体任务",
  userAgents: "智能体",
  agentSkills: "Skills",
  workflows: "工作流",
  agentMemories: "记忆",
  preferences: "偏好",
  backupRuns: "备份记录"
};

function currentDeviceLabel() {
  if (typeof navigator === "undefined") return "浏览器设备";
  const mobile = /Android|iPhone|iPad|Mobile/iu.test(navigator.userAgent);
  return mobile ? "移动设备浏览器" : "桌面浏览器";
}

function statusError(status: ProgressSyncStatus) {
  if (status.state === "rejected") return "发送端已拒绝本次同步请求。";
  if (status.state === "cancelled") return "本次临时同步已取消。";
  if (status.state === "expired") return "临时同步码已过期，请重新创建。";
  return "";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function createProgressSyncShareUrl(
  origin: string,
  code: string,
  scannedRole: "receiver" | "sender" = "receiver"
) {
  const compact = compactProgressSyncCode(code);
  if (compact.length !== 6) return "";
  const url = new URL("/chat", origin);
  url.hash = scannedRole === "sender" ? `sync-send=${compact}` : `sync=${compact}`;
  return url.toString();
}

async function copyPlainText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Continue with the HTTP/restricted-browser compatibility path.
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("当前浏览器无法复制同步码。");
}

function useCountdown(expiresAt: string) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!expiresAt) {
      setSeconds(0);
      return;
    }
    const update = () => setSeconds(Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function restoreModeControls(
  mode: "merge" | "replace",
  onChange: (mode: "merge" | "replace") => void,
  disabled: boolean
) {
  return (
    <fieldset className="workspace-restore-modes progress-sync-restore-modes">
      <legend>恢复方式</legend>
      <label>
        <input type="radio" checked={mode === "merge"} onChange={() => onChange("merge")} disabled={disabled} />
        <span><strong>合并</strong><small>保留本机记录，同 ID 使用较新版本。</small></span>
      </label>
      <label>
        <input type="radio" checked={mode === "replace"} onChange={() => onChange("replace")} disabled={disabled} />
        <span><strong>替换</strong><small>清空本机工作区后恢复接收内容。</small></span>
      </label>
    </fieldset>
  );
}

type SenderApprovalProps = {
  sender: SenderState;
  reverseSenderCode: string;
  approvalButtonRef: RefObject<HTMLButtonElement | null>;
  onReject: () => void | Promise<void>;
  onApprove: () => void | Promise<void>;
};

function SenderApproval({
  sender,
  reverseSenderCode,
  approvalButtonRef,
  onReject,
  onApprove
}: SenderApprovalProps) {
  return (
    <div className="progress-sync-approval" data-sync-state="approval">
      <span aria-live="polite"><Link2 size={16} />{reverseSenderCode ? `${sender.deviceLabel} 已准备接收` : `${sender.deviceLabel} 请求接收`}</span>
      <div className="progress-sync-fingerprint"><small>安全指纹</small><strong>{sender.fingerprint}</strong></div>
      <p>确认另一台设备显示相同的 6 位数字后再发送。</p>
      <div className="progress-sync-actions">
        <button type="button" className="ui-button secondary" onClick={() => void onReject()}><X size={15} />拒绝</button>
        <button ref={approvalButtonRef} type="button" className="ui-button workspace-data-primary" onClick={() => void onApprove()}><ShieldCheck size={15} />确认并发送</button>
      </div>
    </div>
  );
}

function ProgressSyncPanel({
  userProvider,
  initialMode = "send",
  initialCode = "",
  includeApiKey,
  onRequestApiKeyInclusion,
  onDisableApiKeyInclusion,
  restoreMode,
  onRestoreModeChange,
  onRequestReplace
}: ProgressSyncPanelProps) {
  const mobileDevice = typeof window !== "undefined" && window.matchMedia("(max-width: 1023.98px)").matches;
  const [mode, setMode] = useState<"send" | "receive">(initialMode);
  const [codeInput, setCodeInput] = useState(() => initialMode === "receive" ? formatProgressSyncCode(initialCode) : "");
  const [receiveMethod, setReceiveMethod] = useState<"qr" | "code">(() => (
    mobileDevice || (initialMode === "receive" && initialCode) ? "code" : "qr"
  ));
  const [maxPayloadBytes, setMaxPayloadBytes] = useState(progressSyncDefaultMaxBytes);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [sender, setSender] = useState<SenderState>(emptySender);
  const [receiver, setReceiver] = useState<ReceiverState>(emptyReceiver);
  const senderRef = useRef(sender);
  const receiverRef = useRef(receiver);
  const senderApprovalButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousSenderPhaseRef = useRef(sender.phase);
  senderRef.current = sender;
  receiverRef.current = receiver;
  const senderCountdown = useCountdown(sender.expiresAt);
  const receiverCountdown = useCountdown(receiver.expiresAt);
  const loopbackOrigin = typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const reverseSenderCode = initialMode === "send" ? compactProgressSyncCode(initialCode) : "";
  const senderShareUrl = sender.code ? createProgressSyncShareUrl(window.location.origin, sender.code) : "";
  const receiverShareUrl = receiver.code
    ? createProgressSyncShareUrl(window.location.origin, receiver.code, "sender")
    : "";
  const qrShareUrl = mode === "send" ? senderShareUrl : receiverShareUrl;

  useEffect(() => {
    const enteredApproval = sender.phase === "approval" && previousSenderPhaseRef.current !== "approval";
    previousSenderPhaseRef.current = sender.phase;
    if (!enteredApproval) return;
    const frame = window.requestAnimationFrame(() => {
      senderApprovalButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sender.phase]);

  useEffect(() => {
    if (mobileDevice || !qrShareUrl) {
      setQrDataUrl("");
      setQrError("");
      return;
    }
    let active = true;
    void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(qrShareUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#172033", light: "#ffffff" }
    })).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (active) setQrError("二维码生成失败，请使用下方 6 位授权码连接。");
    });
    return () => {
      active = false;
    };
  }, [mobileDevice, qrShareUrl]);

  const handleModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (![
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End"
    ].includes(event.key)) return;
    event.preventDefault();
    const nextMode = event.key === "ArrowLeft" || event.key === "Home" ? "send" : "receive";
    setMode(nextMode);
    window.requestAnimationFrame(() => {
      document.getElementById(`progress-sync-tab-${nextMode}`)?.focus();
    });
  };

  const requireSyncConfig = async () => {
    const config = await progressSyncClient.config();
    if (!config.enabled) throw new Error("服务器暂未启用跨设备临时同步。");
    setMaxPayloadBytes(config.maxPayloadBytes);
    return config;
  };

  const cancelSender = useCallback(async () => {
    const current = senderRef.current;
    setSender(emptySender);
    if (current.sessionId && current.token) {
      await progressSyncClient.cancel(current.sessionId, current.token).catch(() => undefined);
    }
  }, []);

  const cancelReceiver = useCallback(async () => {
    const current = receiverRef.current;
    setReceiver(emptyReceiver);
    if (current.sessionId && current.token) {
      await progressSyncClient.cancel(current.sessionId, current.token).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    return () => {
      const currentSender = senderRef.current;
      const currentReceiver = receiverRef.current;
      if (currentSender.sessionId && currentSender.token && currentSender.phase !== "complete") {
        void progressSyncClient.cancel(currentSender.sessionId, currentSender.token).catch(() => undefined);
      }
      if (currentReceiver.sessionId && currentReceiver.token && currentReceiver.phase !== "complete") {
        void progressSyncClient.cancel(currentReceiver.sessionId, currentReceiver.token).catch(() => undefined);
      }
    };
  }, []);

  const startSending = async () => {
    setSender({ ...emptySender, phase: "capturing" });
    try {
      await requireSyncConfig();
      const [capture, keys] = await Promise.all([
        captureStableWorkspaceArchive(),
        generateProgressSyncEphemeralKeys()
      ]);
      const moduleId = publicModuleFromPath(window.location.pathname) || "chat";
      const payload = createProgressSyncPayload({
        workspace: capture.envelope,
        sourceRevision: capture.revision,
        resume: {
          path: window.location.pathname,
          moduleId,
          lastModelId: userProvider.lastModelId || ""
        },
        includeApiKey,
        userProvider
      });
      if (reverseSenderCode) {
        const joined = await progressSyncClient.join(
          reverseSenderCode,
          keys.material,
          currentDeviceLabel(),
          "sender"
        );
        if (!joined.receiver) throw new Error("电脑端接收会话缺少有效的接收材料。");
        const fingerprint = await progressSyncFingerprint(
          joined.sessionId,
          keys.material,
          joined.receiver
        );
        setSender({
          ...emptySender,
          phase: "approval",
          sessionId: joined.sessionId,
          token: joined.joinToken,
          expiresAt: joined.expiresAt,
          keys,
          payload,
          receiver: joined.receiver,
          fingerprint,
          deviceLabel: joined.receiver.deviceLabel || "电脑端浏览器"
        });
        return;
      }
      const created = await progressSyncClient.create(keys.material, currentDeviceLabel());
      setSender({
        ...emptySender,
        phase: "waiting",
        sessionId: created.sessionId,
        code: formatProgressSyncCode(created.code),
        token: created.creatorToken,
        expiresAt: created.expiresAt,
        keys,
        payload
      });
    } catch (error) {
      setSender({ ...emptySender, phase: "error", error: errorMessage(error, "无法创建临时同步。") });
    }
  };

  const createReceiverQr = async () => {
    setReceiver({ ...emptyReceiver, phase: "inviting" });
    try {
      await requireSyncConfig();
      const keys = await generateProgressSyncEphemeralKeys();
      const created = await progressSyncClient.create(
        keys.material,
        currentDeviceLabel(),
        "receiver"
      );
      setReceiver({
        ...emptyReceiver,
        phase: "waiting",
        sessionId: created.sessionId,
        code: formatProgressSyncCode(created.code),
        token: created.creatorToken,
        expiresAt: created.expiresAt,
        keys
      });
    } catch (error) {
      setReceiver({ ...emptyReceiver, phase: "error", error: errorMessage(error, "无法创建手机发送二维码。") });
    }
  };

  useEffect(() => {
    if (!sender.sessionId || !sender.token || (sender.phase !== "waiting" && sender.phase !== "approval")) return;
    const controller = new AbortController();
    let stopped = false;
    const poll = async () => {
      try {
        const status = await progressSyncClient.status(sender.sessionId, sender.token, controller.signal);
        const terminalError = statusError(status);
        if (terminalError) {
          setSender((current) => ({ ...current, phase: "error", error: terminalError }));
          return;
        }
        if (status.receiver && sender.keys) {
          const fingerprint = await progressSyncFingerprint(
            sender.sessionId,
            sender.keys.material,
            status.receiver
          );
          setSender((current) => ({
            ...current,
            phase: "approval",
            receiver: status.receiver,
            fingerprint,
            deviceLabel: status.receiver?.deviceLabel || "另一台设备"
          }));
          return;
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setSender((current) => ({ ...current, phase: "error", error: errorMessage(error, "临时同步状态读取失败。") }));
        }
        return;
      }
      if (!stopped) window.setTimeout(poll, 900);
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [sender.keys, sender.phase, sender.sessionId, sender.token]);

  const approveSender = async () => {
    if (!sender.keys || !sender.receiver || !sender.payload) return;
    setSender((current) => ({ ...current, phase: "uploading", error: "" }));
    try {
      const key = await deriveProgressSyncKey({
        sessionId: sender.sessionId,
        ownPrivateKey: sender.keys.keyPair.privateKey,
        sender: sender.keys.material,
        receiver: sender.receiver,
        peer: sender.receiver
      });
      await progressSyncClient.approve(sender.sessionId, sender.token, sender.receiver);
      const packet = await encryptProgressSyncPayload(sender.payload, key, sender.sessionId, maxPayloadBytes);
      await progressSyncClient.upload(sender.sessionId, sender.token, packet);
      setSender((current) => ({ ...current, phase: "complete" }));
    } catch (error) {
      setSender((current) => ({ ...current, phase: "error", error: errorMessage(error, "加密上传失败。") }));
    }
  };

  const rejectSender = async () => {
    if (!sender.sessionId || !sender.token) return;
    await progressSyncClient.reject(sender.sessionId, sender.token).catch(() => undefined);
    setSender({ ...emptySender, phase: "error", error: "已拒绝另一台设备，本次同步码不可继续使用。" });
  };

  const joinSync = async () => {
    const code = compactProgressSyncCode(codeInput);
    if (code.length !== 6) {
      setReceiver({ ...emptyReceiver, phase: "error", error: "请输入完整的 6 位临时同步码。" });
      return;
    }
    setReceiver({ ...emptyReceiver, phase: "joining" });
    try {
      await requireSyncConfig();
      const keys = await generateProgressSyncEphemeralKeys();
      const joined = await progressSyncClient.join(code, keys.material, currentDeviceLabel());
      if (!joined.sender) throw new Error("发送端会话缺少有效的发送材料。");
      const fingerprint = await progressSyncFingerprint(
        joined.sessionId,
        joined.sender,
        keys.material
      );
      setReceiver({
        ...emptyReceiver,
        phase: "waiting",
        sessionId: joined.sessionId,
        token: joined.joinToken,
        expiresAt: joined.expiresAt,
        keys,
        sender: joined.sender,
        fingerprint
      });
    } catch (error) {
      setReceiver({ ...emptyReceiver, phase: "error", error: errorMessage(error, "无法加入临时同步。") });
    }
  };

  useEffect(() => {
    const receiverKeys = receiver.keys;
    if (receiver.phase !== "waiting" || !receiver.sessionId || !receiver.token || !receiverKeys) return;
    const controller = new AbortController();
    let stopped = false;
    const poll = async () => {
      try {
        const status = await progressSyncClient.status(receiver.sessionId, receiver.token, controller.signal);
        const terminalError = statusError(status);
        if (terminalError) {
          setReceiver((current) => ({ ...current, phase: "error", error: terminalError }));
          return;
        }
        if (status.sender && !receiver.sender) {
          const fingerprint = await progressSyncFingerprint(
            receiver.sessionId,
            status.sender,
            receiverKeys.material
          );
          setReceiver((current) => ({
            ...current,
            sender: status.sender,
            fingerprint
          }));
          return;
        }
        if (status.state === "payload_ready") {
          if (!receiver.sender) throw new Error("发送端握手材料尚未就绪。");
          setReceiver((current) => ({ ...current, phase: "claiming" }));
          const key = await deriveProgressSyncKey({
            sessionId: receiver.sessionId,
            ownPrivateKey: receiverKeys.keyPair.privateKey,
            sender: receiver.sender!,
            receiver: receiverKeys.material,
            peer: receiver.sender!
          });
          const packet = await progressSyncClient.claim(receiver.sessionId, receiver.token);
          const [payload, receiverRevision] = await Promise.all([
            decryptProgressSyncPayload(packet, key, receiver.sessionId, maxPayloadBytes),
            readWorkspaceRevision()
          ]);
          setReceiver((current) => ({
            ...current,
            phase: "preview",
            preview: {
              payload,
              counts: payload.workspace.counts,
              receiverRevision,
              encryptedBytes: packet.byteLength
            }
          }));
          return;
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setReceiver((current) => ({ ...current, phase: "error", error: errorMessage(error, "接收同步快照失败。") }));
        }
        return;
      }
      if (!stopped) window.setTimeout(poll, 900);
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [maxPayloadBytes, receiver.keys, receiver.phase, receiver.sender, receiver.sessionId, receiver.token]);

  const applyReceivedWorkspace = async () => {
    const preview = receiver.preview;
    if (!preview) return;
    setReceiver((current) => ({ ...current, phase: "restoring", error: "" }));
    let rollback: Awaited<ReturnType<typeof captureStableWorkspaceArchive>> | null = null;
    try {
      rollback = await captureStableWorkspaceArchive();
      if (rollback.revision !== preview.receiverRevision) {
        setReceiver((current) => current.preview ? {
          ...current,
          phase: "preview",
          preview: { ...current.preview, receiverRevision: rollback!.revision },
          error: "本机工作区在预览后发生了变化，已刷新本机修订号，请重新确认恢复。"
        } : current);
        return;
      }
      await restoreWorkspaceArchive(preview.payload.workspace, restoreMode, preview.receiverRevision);
      const incomingProvider = preview.payload.session?.userProvider;
      const provider = {
        ...(incomingProvider || userProvider),
        lastModelId: preview.payload.resume.lastModelId || incomingProvider?.lastModelId || userProvider.lastModelId || ""
      };
      if (!saveUserProviderConfig(provider)) {
        await restoreWorkspaceArchive(rollback.envelope, "replace");
        throw new Error("浏览器拒绝保存会话配置，已回滚本次工作区恢复。");
      }
      setReceiver((current) => ({ ...current, phase: "complete" }));
      window.location.assign(preview.payload.resume.path);
    } catch (error) {
      setReceiver((current) => ({ ...current, phase: "error", error: errorMessage(error, "恢复同步快照失败，现有数据未更改。") }));
    }
  };

  const requestApply = () => {
    if (restoreMode === "replace") {
      onRequestReplace(() => void applyReceivedWorkspace());
      return;
    }
    void applyReceivedWorkspace();
  };

  const senderCodeRow = (
    <div className="progress-sync-code-row">
      <div><small>{mobileDevice ? "在电脑端输入此授权码" : "备用授权码"}</small><strong>{sender.code}</strong><span>{senderCountdown} 后失效</span></div>
      <button
        type="button"
        className="ui-icon-button"
        aria-label="复制临时同步码"
        title="复制临时同步码"
        onClick={() => void copyPlainText(sender.code).catch((error) => {
          setSender((current) => ({ ...current, error: errorMessage(error, "同步码复制失败。") }));
        })}
      ><Clipboard size={16} /></button>
    </div>
  );

  const receiverCodeRow = (
    <div className="progress-sync-code-row">
      <div><small>备用授权码</small><strong>{receiver.code}</strong><span>{receiverCountdown} 后失效</span></div>
      <button
        type="button"
        className="ui-icon-button"
        aria-label="复制电脑接收授权码"
        title="复制电脑接收授权码"
        onClick={() => void copyPlainText(receiver.code).catch((error) => {
          setReceiver((current) => ({ ...current, error: errorMessage(error, "授权码复制失败。") }));
        })}
      ><Clipboard size={16} /></button>
    </div>
  );

  return (
    <section className="workspace-data-section progress-sync-section" aria-label="跨设备同步操作">
      <div className="progress-sync-mode" role="tablist" aria-label="临时同步方式">
        <button
          id="progress-sync-tab-send"
          type="button"
          role="tab"
          aria-selected={mode === "send"}
          aria-controls="progress-sync-panel-send"
          tabIndex={mode === "send" ? 0 : -1}
          onKeyDown={handleModeKeyDown}
          onClick={() => setMode("send")}
        >{mobileDevice ? "同步到电脑" : "同步到手机"}</button>
        <button
          id="progress-sync-tab-receive"
          type="button"
          role="tab"
          aria-selected={mode === "receive"}
          aria-controls="progress-sync-panel-receive"
          tabIndex={mode === "receive" ? 0 : -1}
          onKeyDown={handleModeKeyDown}
          onClick={() => setMode("receive")}
        >{mobileDevice ? "接收电脑进度" : "从手机同步"}</button>
      </div>

      {mode === "send" ? (
        <div id="progress-sync-panel-send" className="progress-sync-panel" role="tabpanel" aria-labelledby="progress-sync-tab-send">
          {sender.phase === "idle" || sender.phase === "error" ? (
            <div className="progress-sync-idle-layout">
              <div className="progress-sync-idle-instruction">
                {!mobileDevice ? (
                  <div className="progress-sync-qr-prompt">
                    <span className="progress-sync-qr-prompt-icon" aria-hidden="true">
                      <QrCode size={30} />
                    </span>
                    <span>
                      <strong>使用手机扫码同步</strong>
                      <small>{loopbackOrigin
                        ? "当前是本地预览地址；请使用手机可访问的 HTTPS 部署地址打开页面后再让手机扫码。"
                        : "生成二维码后，用手机相机或浏览器扫码打开接收页面，再确认安全指纹。"}</small>
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="progress-sync-idle-secondary">
                <label className="progress-sync-key-option">
                  <input
                    type="checkbox"
                    checked={includeApiKey}
                    onChange={() => includeApiKey ? onDisableApiKeyInclusion() : onRequestApiKeyInclusion()}
                    disabled={!userProvider.apiKey}
                  />
                  <span><KeyRound size={15} /><strong>同时传输 API Key</strong><small>默认关闭；启用后仅存在于端到端加密密文中。</small></span>
                </label>
              </div>
              <div className="progress-sync-idle-primary">
                <button type="button" className="ui-button workspace-data-primary" onClick={() => void startSending()}>
                  {mobileDevice || reverseSenderCode ? <Send size={15} /> : <QrCode size={15} />}
                  {reverseSenderCode
                    ? "确认发送到电脑"
                    : mobileDevice ? "创建 6 位授权码" : "生成手机同步二维码"}
                </button>
              </div>
              {sender.error ? <p className="workspace-data-error" role="alert">{sender.error}</p> : null}
            </div>
          ) : null}

          {sender.phase === "capturing" ? (
            <div className="progress-sync-status" role="status"><LoaderCircle className="workspace-data-spin" />{mobileDevice || reverseSenderCode ? "正在捕获稳定工作区…" : "正在生成手机同步二维码…"}</div>
          ) : null}

          {sender.phase === "waiting" || sender.phase === "approval" || sender.phase === "uploading" ? (
            <div className="progress-sync-session">
              {!mobileDevice && senderShareUrl && (qrDataUrl || sender.phase === "approval") ? (
                <div className={`progress-sync-qr${sender.phase === "approval" ? " progress-sync-qr--approval" : ""}`} data-sync-url={senderShareUrl}>
                  {sender.phase === "approval" ? (
                    <SenderApproval
                      sender={sender}
                      reverseSenderCode={reverseSenderCode}
                      approvalButtonRef={senderApprovalButtonRef}
                      onReject={rejectSender}
                      onApprove={approveSender}
                    />
                  ) : (
                    <>
                      <img src={qrDataUrl} alt="同步到手机二维码" width="240" height="240" />
                      <div className="progress-sync-qr-side">
                        <strong>手机扫码接收</strong>
                        {senderCodeRow}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
              {qrError ? <p className="workspace-data-error" role="alert">{qrError}</p> : null}
              {sender.phase === "approval" && (mobileDevice || !qrDataUrl) ? (
                <SenderApproval
                  sender={sender}
                  reverseSenderCode={reverseSenderCode}
                  approvalButtonRef={senderApprovalButtonRef}
                  onReject={rejectSender}
                  onApprove={approveSender}
                />
              ) : null}
              {sender.phase !== "approval" && (mobileDevice || !qrDataUrl) ? senderCodeRow : null}
              {sender.phase === "waiting" ? <div className="progress-sync-status" role="status"><LoaderCircle className="workspace-data-spin" />{mobileDevice ? "等待电脑输入授权码…" : "等待手机扫码确认…"}</div> : null}
              {sender.phase === "uploading" ? <div className="progress-sync-status" role="status"><LoaderCircle className="workspace-data-spin" />正在加密并上传快照…</div> : null}
              <button type="button" className="progress-sync-cancel" onClick={() => void cancelSender()}>取消本次同步</button>
            </div>
          ) : null}

          {sender.phase === "complete" ? (
            <div className="progress-sync-complete" role="status"><Check size={17} />加密快照已发送，另一台设备可以完成恢复。</div>
          ) : null}
        </div>
      ) : (
        <div id="progress-sync-panel-receive" className="progress-sync-panel" role="tabpanel" aria-labelledby="progress-sync-tab-receive">
          {receiver.phase === "idle" || receiver.phase === "error" ? (
            <div className="progress-sync-idle-layout">
              <div className="progress-sync-idle-instruction">
                {!mobileDevice && receiveMethod === "qr" ? (
                  <div className="progress-sync-qr-prompt">
                    <span className="progress-sync-qr-prompt-icon" aria-hidden="true">
                      <QrCode size={30} />
                    </span>
                    <span>
                      <strong>让手机扫码发送</strong>
                      <small>{loopbackOrigin
                        ? "当前是本地预览地址；请使用手机可访问的 HTTPS 部署地址打开页面后再生成二维码。"
                        : "手机扫码后会打开发送确认，工作区不会在确认前自动上传。"}</small>
                    </span>
                  </div>
                ) : (
                  <div className="progress-sync-qr-prompt progress-sync-code-prompt">
                    <span className="progress-sync-qr-prompt-icon" aria-hidden="true">
                      <KeyRound size={28} />
                    </span>
                    <span>
                      <strong>{mobileDevice ? "输入电脑授权码" : "输入手机授权码"}</strong>
                      <small>{mobileDevice
                        ? "输入电脑端显示的 6 位授权码，确认后建立一次性安全连接。"
                        : "在手机端创建发送授权码，再在下方输入并确认连接。"}</small>
                    </span>
                  </div>
                )}
              </div>
              <div className="progress-sync-idle-secondary">
                {!mobileDevice ? (
                  <div className="progress-sync-method-selector" role="group" aria-label="接收方式">
                    <button
                      type="button"
                      aria-pressed={receiveMethod === "qr"}
                      aria-label={receiveMethod === "code" ? "改用扫码接收" : "手机扫码"}
                      onClick={() => setReceiveMethod("qr")}
                    >手机扫码</button>
                    <button
                      type="button"
                      aria-pressed={receiveMethod === "code"}
                      aria-label={receiveMethod === "qr" ? "改用手机授权码" : "手机授权码"}
                      onClick={() => setReceiveMethod("code")}
                    >授权码</button>
                  </div>
                ) : null}
              </div>
              <div className="progress-sync-idle-primary">
                {receiveMethod === "qr" && !mobileDevice ? (
                  <button type="button" className="ui-button workspace-data-primary" onClick={() => void createReceiverQr()}>
                    <QrCode size={15} />生成手机发送二维码
                  </button>
                ) : (
                  <div className="progress-sync-code-input">
                    <input
                      value={codeInput}
                      onChange={(event) => setCodeInput(formatProgressSyncCode(event.target.value))}
                      placeholder="请输入 6 位授权码"
                      aria-label="6 位同步授权码"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                    />
                    <button type="button" className="ui-button workspace-data-primary" onClick={() => void joinSync()} disabled={compactProgressSyncCode(codeInput).length !== 6}>确认连接</button>
                  </div>
                )}
              </div>
              {receiver.error ? <p className="workspace-data-error" role="alert">{receiver.error}</p> : null}
            </div>
          ) : null}

          {receiver.phase === "inviting" || receiver.phase === "joining" || receiver.phase === "claiming" ? (
            <div className="progress-sync-status" role="status"><LoaderCircle className="workspace-data-spin" />{
              receiver.phase === "inviting"
                ? "正在生成手机发送二维码…"
                : receiver.phase === "joining" ? "正在建立安全连接…" : "正在接收并校验加密快照…"
            }</div>
          ) : null}

          {receiver.phase === "waiting" && !receiver.sender ? (
            <div className="progress-sync-session">
              {!mobileDevice && qrDataUrl && receiver.code ? (
                <div className="progress-sync-qr" data-sync-url={receiverShareUrl}>
                  <img src={qrDataUrl} alt="从手机同步二维码" width="240" height="240" />
                  <div className="progress-sync-qr-side">
                    <strong>手机扫码发送</strong>
                    {receiverCodeRow}
                  </div>
                </div>
              ) : null}
              {qrError ? <p className="workspace-data-error" role="alert">{qrError}</p> : null}
              {mobileDevice || !qrDataUrl ? receiverCodeRow : null}
              <div className="progress-sync-status" role="status"><LoaderCircle className="workspace-data-spin" />等待手机扫码并确认发送…</div>
              <button type="button" className="progress-sync-cancel" onClick={() => void cancelReceiver()}>取消本次同步</button>
            </div>
          ) : null}

          {receiver.phase === "waiting" && receiver.sender ? (
            <div className="progress-sync-approval">
              <span><ShieldCheck size={16} />等待发送端确认</span>
              <div className="progress-sync-fingerprint"><small>安全指纹</small><strong>{receiver.fingerprint}</strong></div>
              <p>请在发送设备上核对相同数字并点击“确认并发送”。有效期剩余 {receiverCountdown}。</p>
              <button type="button" className="progress-sync-cancel" onClick={() => void cancelReceiver()}>取消连接</button>
            </div>
          ) : null}

          {receiver.phase === "preview" && receiver.preview ? (
            <div className="progress-sync-preview">
              <div className="progress-sync-preview-meta">
                <span>捕获于 {new Date(receiver.preview.payload.capturedAt).toLocaleString()}</span>
                <span>修订 #{receiver.preview.payload.sourceRevision}</span>
                <span>目标 {receiver.preview.payload.resume.path}</span>
                <span>模型 {receiver.preview.payload.resume.lastModelId || "沿用本机选择"}</span>
                <span>{(receiver.preview.encryptedBytes / 1024 / 1024).toFixed(2)} MB</span>
                <span>{receiver.preview.payload.inclusion.apiKey
                  ? `API Key ${maskUserProviderKey(receiver.preview.payload.session?.userProvider?.apiKey || "")}`
                  : "API Key 不传输，保留本机配置"}</span>
              </div>
              <dl className="workspace-data-counts progress-sync-counts">
                {Object.entries(receiver.preview.counts).map(([key, value]) => (
                  <div key={key}><dt>{progressCountLabels[key] || key}</dt><dd>{value}</dd></div>
                ))}
              </dl>
              {restoreModeControls(restoreMode, onRestoreModeChange, false)}
              {receiver.error ? <p className="workspace-data-error" role="alert">{receiver.error}</p> : null}
              <button type="button" className={restoreMode === "replace" ? "ui-button workspace-data-danger" : "ui-button workspace-data-primary"} onClick={requestApply}>
                {restoreMode === "replace" ? "替换并打开进度" : "合并并打开进度"}
              </button>
            </div>
          ) : null}

          {receiver.phase === "restoring" ? <div className="progress-sync-status" role="status"><LoaderCircle className="workspace-data-spin" />正在原子恢复工作区…</div> : null}
          {receiver.phase === "complete" ? <div className="progress-sync-complete" role="status"><Check size={17} />恢复完成，正在打开捕获页面…</div> : null}
        </div>
      )}
    </section>
  );
}

export default ProgressSyncPanel;
