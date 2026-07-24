import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CloudUpload,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  KeyRound,
  LoaderCircle,
  LogOut,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings2,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { ApiError, api } from "../../api";
import { Dialog } from "../../components/ui";
import { createClientId } from "../../utils/clientId";
import type {
  KnowledgeAccount,
  KnowledgeBase,
  KnowledgeCloudDocument,
  KnowledgeCloudDocumentStatus,
  KnowledgeDocument,
  KnowledgeEmbeddingConnection,
  KnowledgeEmbeddingProfile
} from "../../types";
import {
  clearKnowledgeEmbeddingConnections,
  isKnowledgeEmbeddingConnectionReady,
  loadKnowledgeEmbeddingConnections,
  saveKnowledgeEmbeddingConnections,
  type KnowledgeEmbeddingConnectionMap
} from "./embeddingConnections";
import {
  knowledgeUploadAccept,
  uploadKnowledgeFile
} from "./knowledgeUpload";
import {
  cloudStatusMigrationStage,
  createKnowledgeMigrationSnapshot,
  createLocalMigrationFile,
  loadKnowledgeMigrationSnapshot,
  loadLocalKnowledgeDocuments,
  removeLocalKnowledgeDocuments,
  saveKnowledgeMigrationSnapshot,
  updateKnowledgeMigrationItem,
  type KnowledgeMigrationSnapshot
} from "./localMigration";

type EmbeddingVendor = KnowledgeEmbeddingConnection["vendor"];

type KnowledgeCloudWorkspaceProps = {
  account: KnowledgeAccount;
  csrfToken: string;
  onAccountChange: (account: KnowledgeAccount) => void;
  onLogout: () => Promise<void>;
  onRotateRecoveryCode: () => Promise<void>;
};

type UploadStage = "queued" | "grant" | "upload" | "finalize" | "done" | "failed";

type UploadQueueItem = {
  id: string;
  name: string;
  size: number;
  stage: UploadStage;
  error?: string;
};

type WorkspaceDialog =
  | { kind: "create-base" }
  | { kind: "edit-base"; baseId: string }
  | { kind: "delete-base"; baseId: string }
  | { kind: "delete-document"; documentId: string }
  | { kind: "reindex"; baseId: string }
  | { kind: "migration" }
  | null;

type BaseDraft = {
  name: string;
  description: string;
  profileId: string;
};

const emptyBaseDraft: BaseDraft = { name: "", description: "", profileId: "" };

const embeddingVendorLabels: Record<EmbeddingVendor, string> = {
  openai: "OpenAI",
  qwen: "通义千问"
};

const documentStatus: Record<KnowledgeCloudDocumentStatus, {
  label: string;
  tone: "neutral" | "working" | "warning" | "ready" | "danger";
}> = {
  pending_upload: { label: "等待上传", tone: "neutral" },
  uploaded: { label: "等待解析", tone: "working" },
  parsing: { label: "解析中", tone: "working" },
  awaiting_embedding: { label: "等待向量连接", tone: "warning" },
  embedding: { label: "向量化中", tone: "working" },
  ready: { label: "可检索", tone: "ready" },
  needs_ocr: { label: "需要 OCR", tone: "warning" },
  failed: { label: "处理失败", tone: "danger" },
  deleting: { label: "删除中", tone: "neutral" }
};

const uploadStageLabels: Record<UploadStage, string> = {
  queued: "排队中",
  grant: "申请授权",
  upload: "上传中",
  finalize: "校验中",
  done: "已进入解析",
  failed: "上传失败"
};

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "知识库操作失败";
}

function formatBytes(value: number | string | undefined) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value: string | null) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function progressPercent(ready: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((ready / total) * 100)));
}

function StatusBadge({ status }: { status: KnowledgeCloudDocumentStatus }) {
  const metadata = documentStatus[status];
  return <span className={`knowledge-document-status ${metadata.tone}`}>{metadata.label}</span>;
}

function KnowledgeCloudWorkspace({
  account,
  csrfToken,
  onAccountChange,
  onLogout,
  onRotateRecoveryCode
}: KnowledgeCloudWorkspaceProps) {
  const [profiles, setProfiles] = useState<KnowledgeEmbeddingProfile[]>([]);
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState("");
  const [documents, setDocuments] = useState<KnowledgeCloudDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [connections, setConnections] = useState<KnowledgeEmbeddingConnectionMap>(
    () => loadKnowledgeEmbeddingConnections()
  );

  const [editingVendor, setEditingVendor] = useState<EmbeddingVendor | null>(null);
  const [connectionDraft, setConnectionDraft] = useState({ baseUrl: "", apiKey: "" });
  const [indexing, setIndexing] = useState(false);
  const [indexPaused, setIndexPaused] = useState(false);
  const [dialog, setDialog] = useState<WorkspaceDialog>(null);
  const [baseDraft, setBaseDraft] = useState<BaseDraft>(emptyBaseDraft);
  const [reindexProfileId, setReindexProfileId] = useState("");
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [recoveryRotationOpen, setRecoveryRotationOpen] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<KnowledgeDocument[]>([]);
  const [migration, setMigration] = useState<KnowledgeMigrationSnapshot | null>(null);
  const [migrationSelection, setMigrationSelection] = useState<Set<string>>(new Set());
  const [migrationTargetId, setMigrationTargetId] = useState("");
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [deleteLocalConfirmed, setDeleteLocalConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pauseIndexRef = useRef(false);
  const migrationRef = useRef<KnowledgeMigrationSnapshot | null>(null);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selectedBase = useMemo(
    () => bases.find((base) => base.id === selectedBaseId) || null,
    [bases, selectedBaseId]
  );
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );
  const pendingBases = useMemo(
    () => bases.filter((base) => base.embeddingProgress.pendingChunks > 0),
    [bases]
  );
  const requiredVendors = useMemo(() => {
    const vendors = new Set<EmbeddingVendor>();
    bases.forEach((base) => {
      if (base.embeddingProfile?.vendor) vendors.add(base.embeddingProfile.vendor);
    });
    return [...vendors];
  }, [bases]);
  const missingPendingVendors = useMemo(() => {
    const vendors = new Set(
      pendingBases
        .map((base) => base.embeddingProfile?.vendor)
        .filter((vendor): vendor is EmbeddingVendor => Boolean(vendor))
    );
    return [...vendors].filter((vendor) => !isKnowledgeEmbeddingConnectionReady(connections[vendor]));
  }, [connections, pendingBases]);
  const uploadActive = uploadQueue.some((item) => ["grant", "upload", "finalize"].includes(item.stage));
  const activeBases = bases.filter((base) => base.status !== "deleting");
  const capacityUsed = Number(account.usedBytes || 0);
  const capacityReserved = Number(account.reservedBytes || 0);
  const capacityQuota = Number(account.quotaBytes || 0);
  const capacityPercent = capacityQuota > 0
    ? Math.min(100, ((capacityUsed + capacityReserved) / capacityQuota) * 100)
    : 0;
  const readyLocalIds = useMemo(() => {
    const localIds = new Set(localDocuments.map((document) => document.id));
    return migration?.items
      .filter((item) => item.stage === "ready" && localIds.has(item.localDocumentId))
      .map((item) => item.localDocumentId) || [];
  }, [localDocuments, migration]);

  const persistMigration = useCallback(async (next: KnowledgeMigrationSnapshot) => {
    migrationRef.current = next;
    setMigration(next);
    await saveKnowledgeMigrationSnapshot(next);
  }, []);

  const refreshDocuments = useCallback(async (baseId: string, silent = false) => {
    if (!baseId) {
      setDocuments([]);
      return [];
    }
    if (!silent) setDocumentsLoading(true);
    try {
      const response = await api.knowledgeDocuments(baseId);
      setDocuments(response.items);
      const currentMigration = migrationRef.current;
      if (currentMigration?.targetBaseId === baseId) {
        const byId = new Map(response.items.map((document) => [document.id, document]));
        let changed = false;
        const next = {
          ...currentMigration,
          items: currentMigration.items.map((item) => {
            if (!item.cloudDocumentId) return item;
            const cloudDocument = byId.get(item.cloudDocumentId);
            if (!cloudDocument) return item;
            const stage = cloudStatusMigrationStage(cloudDocument.status);
            if (item.stage === "failed" && stage === "uploading") return item;
            if (stage === item.stage) return item;
            changed = true;
            return {
              ...item,
              stage,
              error: cloudDocument.errorCode || undefined,
              updatedAt: new Date().toISOString()
            };
          }),
          updatedAt: new Date().toISOString()
        };
        if (changed) await persistMigration(next);
      }
      return response.items;
    } finally {
      if (!silent) setDocumentsLoading(false);
    }
  }, [persistMigration]);

  const refreshWorkspace = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [profileResponse, baseResponse, session] = await Promise.all([
        api.knowledgeEmbeddingProfiles(),
        api.knowledgeBases(),
        api.knowledgeSession()
      ]);
      setProfiles(profileResponse.items);
      setBases(baseResponse.items);
      if (session.account) onAccountChange(session.account);
      setSelectedBaseId((current) => {
        if (baseResponse.items.some((base) => base.id === current)) return current;
        return baseResponse.items.find((base) => base.status === "active")?.id || baseResponse.items[0]?.id || "";
      });
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onAccountChange]);

  useEffect(() => {
    migrationRef.current = migration;
  }, [migration]);

  useEffect(() => {
    void refreshWorkspace();
    Promise.all([
      loadLocalKnowledgeDocuments(),
      loadKnowledgeMigrationSnapshot(account.id)
    ]).then(([local, storedMigration]) => {
      setLocalDocuments(local);
      setMigration(storedMigration);
      migrationRef.current = storedMigration;
    }).catch(() => setLocalDocuments([]));
  }, [account.id, refreshWorkspace]);

  useEffect(() => {
    if (!selectedBaseId) {
      setDocuments([]);
      return;
    }
    void refreshDocuments(selectedBaseId);
  }, [refreshDocuments, selectedBaseId]);

  useEffect(() => {
    const processing = documents.some((document) =>
      ["uploaded", "parsing", "embedding", "deleting"].includes(document.status)
    );
    if (!processing || !selectedBaseId) return;
    const timer = window.setInterval(() => {
      void Promise.all([
        refreshDocuments(selectedBaseId, true),
        refreshWorkspace(true)
      ]);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [documents, refreshDocuments, refreshWorkspace, selectedBaseId]);

  useEffect(() => {
    if (!indexing && !uploadActive && !migrationRunning) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "上传会中断，向量化可稍后继续";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [indexing, migrationRunning, uploadActive]);

  const selectBase = (baseId: string) => {
    setSelectedBaseId(baseId);
    setError("");
    setNotice("");
  };

  const editEmbeddingConnection = (vendor: EmbeddingVendor) => {
    const current = connections[vendor];
    const defaultUrl = profiles.find((profile) => profile.vendor === vendor)?.defaultBaseUrl || "";
    setEditingVendor(vendor);
    setConnectionDraft({ baseUrl: current?.baseUrl || defaultUrl, apiKey: current?.apiKey || "" });
    setError("");
  };

  const saveEmbeddingConnection = () => {
    if (!editingVendor) return;
    const baseUrl = connectionDraft.baseUrl.trim().replace(/\/+$/u, "");
    const apiKey = connectionDraft.apiKey.trim();
    if (!/^https?:\/\//iu.test(baseUrl) || !apiKey) {
      setError("请填写有效的 API URL 和 Key");
      return;
    }
    const next: KnowledgeEmbeddingConnectionMap = {
      ...connections,
      [editingVendor]: { vendor: editingVendor, baseUrl, apiKey }
    };
    setConnections(next);
    saveKnowledgeEmbeddingConnections(next);
    setNotice(`${embeddingVendorLabels[editingVendor]} 向量连接已保存到当前会话`);
    setEditingVendor(null);
    setConnectionDraft({ baseUrl: "", apiKey: "" });
    setError("");
  };

  const removeEmbeddingConnection = (vendor: EmbeddingVendor) => {
    const next = { ...connections };
    delete next[vendor];
    setConnections(next);
    saveKnowledgeEmbeddingConnections(next);
    if (editingVendor === vendor) setEditingVendor(null);
    setNotice(`${embeddingVendorLabels[vendor]} 向量连接已清除`);
  };

  const continueIndexing = async () => {
    if (indexing || missingPendingVendors.length) return;
    pauseIndexRef.current = false;
    setIndexPaused(false);
    setIndexing(true);
    setError("");
    setNotice("正在继续未完成的向量化任务");
    try {
      let completedBatches = 0;
      let waitingForAnotherSession = false;
      for (const base of pendingBases) {
        if (pauseIndexRef.current) break;
        const profile = base.embeddingProfile?.id
          ? profileById.get(base.embeddingProfile.id)
          : undefined;
        const connection = profile ? connections[profile.vendor] : undefined;
        if (!profile || !connection) throw new Error(`知识库“${base.name}”缺少兼容的向量连接`);
        const response = await api.knowledgeDocuments(base.id);
        const candidates = response.items.filter((document) =>
          document.status === "awaiting_embedding" ||
          document.status === "embedding" ||
          (base.pendingIndexVersion !== null && base.activeIndexVersion !== null && document.status === "ready")
        );
        for (const document of candidates) {
          for (let batchIndex = 0; batchIndex < 10_000; batchIndex += 1) {
            if (pauseIndexRef.current) break;
            const result = await api.nextKnowledgeEmbeddingBatch(csrfToken, document.id, {
              embeddingProfileId: profile.id,
              idempotencyKey: createClientId(),
              connection
            });
            if (result.providerCall) completedBatches += 1;
            setNotice(`已完成 ${completedBatches} 个向量批次`);
            if (result.done) break;
            if (!result.providerCall) {
              waitingForAnotherSession = true;
              break;
            }
          }
        }
      }
      await refreshWorkspace(true);
      if (selectedBaseId) await refreshDocuments(selectedBaseId, true);
      if (pauseIndexRef.current) {
        setIndexPaused(true);
        setNotice("向量化已暂停，已完成批次不会重复");
      } else {
        setNotice(
          waitingForAnotherSession
            ? "其他设备正在处理部分批次，稍后可继续"
            : completedBatches
              ? `向量化已推进 ${completedBatches} 个批次`
              : "当前没有可领取的向量批次"
        );
      }
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      setIndexing(false);
    }
  };

  const pauseIndexing = () => {
    pauseIndexRef.current = true;
    setNotice("当前批次完成后暂停");
  };

  const openCreateBase = () => {
    setBaseDraft({ ...emptyBaseDraft, profileId: profiles[0]?.id || "" });
    setDialog({ kind: "create-base" });
  };

  const openEditBase = (base: KnowledgeBase) => {
    setBaseDraft({
      name: base.name,
      description: base.description,
      profileId: base.embeddingProfile?.id || profiles[0]?.id || ""
    });
    setDialog({ kind: "edit-base", baseId: base.id });
  };

  const saveBase = async (event: FormEvent) => {
    event.preventDefault();
    if (!dialog || (dialog.kind !== "create-base" && dialog.kind !== "edit-base")) return;
    const name = baseDraft.name.trim();
    if (!name || !baseDraft.profileId) {
      setError("请填写知识库名称并选择向量模型");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (dialog.kind === "create-base") {
        const created = await api.createKnowledgeBase(csrfToken, {
          name,
          description: baseDraft.description.trim(),
          embeddingProfileId: baseDraft.profileId
        });
        setSelectedBaseId(created.base.id);
        setNotice(`知识库“${created.base.name}”已创建`);
      } else {
        const base = bases.find((item) => item.id === dialog.baseId);
        if (!base) throw new Error("知识库已不存在");
        await api.updateKnowledgeBase(csrfToken, base.id, {
          expectedVersion: base.version,
          name,
          description: baseDraft.description.trim()
        });
        setNotice("知识库信息已更新");
      }
      setDialog(null);
      await refreshWorkspace(true);
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async (base: KnowledgeBase) => {
    setBusy(true);
    setError("");
    try {
      await api.updateKnowledgeBase(csrfToken, base.id, {
        expectedVersion: base.version,
        status: base.status === "archived" ? "active" : "archived"
      });
      setNotice(base.status === "archived" ? "知识库已恢复" : "知识库已归档");
      await refreshWorkspace(true);
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteBase = async () => {
    if (dialog?.kind !== "delete-base") return;
    const base = bases.find((item) => item.id === dialog.baseId);
    if (!base) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteKnowledgeBase(csrfToken, base.id, base.version);
      setDialog(null);
      setNotice("知识库已进入清理队列，容量将在清理完成后返还");
      await refreshWorkspace(true);
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteDocument = async () => {
    if (dialog?.kind !== "delete-document") return;
    const document = documents.find((item) => item.id === dialog.documentId);
    if (!document) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteKnowledgeDocument(csrfToken, document.id, document.version);
      setDialog(null);
      setNotice("文档已进入清理队列");
      if (selectedBaseId) await refreshDocuments(selectedBaseId, true);
      await refreshWorkspace(true);
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const openReindex = (base: KnowledgeBase) => {
    setReindexProfileId(base.embeddingProfile?.id || profiles[0]?.id || "");
    setDialog({ kind: "reindex", baseId: base.id });
  };

  const confirmReindex = async () => {
    if (dialog?.kind !== "reindex" || !reindexProfileId) return;
    const base = bases.find((item) => item.id === dialog.baseId);
    if (!base) return;
    if (base.embeddingProfile?.id === reindexProfileId) {
      setError("请选择不同的向量模型");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (base.documentCount > 0) {
        await api.reindexKnowledgeBase(csrfToken, base.id, {
          expectedVersion: base.version,
          embeddingProfileId: reindexProfileId
        });
        setNotice("影子索引已创建，请配置对应连接后继续索引");
      } else {
        await api.updateKnowledgeBase(csrfToken, base.id, {
          expectedVersion: base.version,
          embeddingProfileId: reindexProfileId
        });
        setNotice("向量模型已更新");
      }
      setDialog(null);
      await refreshWorkspace(true);
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const updateUploadQueue = (id: string, patch: Partial<UploadQueueItem>) => {
    setUploadQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selectedBase || selectedBase.status !== "active" || !files.length) return;
    const queue = files.map((file) => ({
      id: createClientId("knowledge-upload"),
      name: file.name,
      size: file.size,
      stage: "queued" as const
    }));
    setUploadQueue((current) => [...queue, ...current].slice(0, 30));
    setError("");
    setNotice("原文件将直传对象存储；解析可离线继续，向量化需要保持页面在线");
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const queueItem = queue[index];
      try {
        await uploadKnowledgeFile(csrfToken, selectedBase.id, file, {
          onStage: (stage) => updateUploadQueue(queueItem.id, { stage })
        });
        updateUploadQueue(queueItem.id, { stage: "done" });
      } catch (nextError: unknown) {
        updateUploadQueue(queueItem.id, {
          stage: "failed",
          error: errorMessage(nextError)
        });
      }
    }
    await Promise.all([
      refreshDocuments(selectedBase.id, true),
      refreshWorkspace(true)
    ]);
  };

  const openMigration = () => {
    const target = selectedBase?.status === "active"
      ? selectedBase.id
      : activeBases.find((base) => base.status === "active")?.id || "";
    setMigrationTargetId(target);
    setMigrationSelection(new Set(localDocuments.map((document) => document.id)));
    setDeleteLocalConfirmed(false);
    setDialog({ kind: "migration" });
  };

  const runMigration = async () => {
    const selected = localDocuments.filter((document) => migrationSelection.has(document.id));
    if (!migrationTargetId || !selected.length) {
      setError("请选择目标知识库和至少一份本地资料");
      return;
    }
    setMigrationRunning(true);
    setError("");
    setNotice("正在迁移本地资料；本地副本会继续保留");
    let snapshot = createKnowledgeMigrationSnapshot(
      account.id,
      migrationTargetId,
      selected,
      migrationRef.current
    );
    await persistMigration(snapshot);
    try {
      let remoteDocuments = (await api.knowledgeDocuments(migrationTargetId)).items;
      for (const localDocument of selected) {
        let item = snapshot.items.find((current) => current.localDocumentId === localDocument.id);
        if (!item || item.stage === "ready") continue;
        if (item.cloudDocumentId) {
          const remote = remoteDocuments.find((document) => document.id === item?.cloudDocumentId);
          if (remote) {
            const stage = cloudStatusMigrationStage(remote.status);
            const retryStalledUpload = item.stage === "failed" && stage === "uploading";
            if (retryStalledUpload) {
              snapshot = updateKnowledgeMigrationItem(snapshot, localDocument.id, {
                cloudDocumentId: undefined,
                stage: "pending",
                error: undefined
              });
              await persistMigration(snapshot);
            } else {
              snapshot = updateKnowledgeMigrationItem(snapshot, localDocument.id, {
                stage,
                error: remote.errorCode || undefined
              });
              await persistMigration(snapshot);
              if (stage !== "failed") continue;
            }
          } else {
            snapshot = updateKnowledgeMigrationItem(snapshot, localDocument.id, {
              cloudDocumentId: undefined,
              stage: "pending",
              error: undefined
            });
            await persistMigration(snapshot);
          }
        }
        try {
          const file = createLocalMigrationFile(localDocument);
          snapshot = updateKnowledgeMigrationItem(snapshot, localDocument.id, {
            stage: "uploading",
            error: undefined
          });
          await persistMigration(snapshot);
          const uploaded = await uploadKnowledgeFile(csrfToken, migrationTargetId, file, {
            onGrant: async (pendingDocument) => {
              snapshot = updateKnowledgeMigrationItem(snapshot, localDocument.id, {
                cloudDocumentId: pendingDocument.id,
                stage: "uploading"
              });
              await persistMigration(snapshot);
            }
          });
          snapshot = updateKnowledgeMigrationItem(snapshot, localDocument.id, {
            cloudDocumentId: uploaded.document.id,
            stage: cloudStatusMigrationStage(uploaded.document.status),
            error: undefined
          });
          await persistMigration(snapshot);
          remoteDocuments = [...remoteDocuments.filter((document) => document.id !== uploaded.document.id), uploaded.document];
        } catch (nextError: unknown) {
          snapshot = updateKnowledgeMigrationItem(snapshot, localDocument.id, {
            stage: "failed",
            error: errorMessage(nextError)
          });
          await persistMigration(snapshot);
        }
      }
      setSelectedBaseId(migrationTargetId);
      await Promise.all([
        refreshDocuments(migrationTargetId, true),
        refreshWorkspace(true)
      ]);
      setNotice("迁移上传已完成；文档变为“可检索”后可手动删除本地副本");
    } finally {
      setMigrationRunning(false);
    }
  };

  const deleteReadyLocalCopies = async () => {
    if (!deleteLocalConfirmed || !readyLocalIds.length) return;
    setBusy(true);
    try {
      const next = await removeLocalKnowledgeDocuments(readyLocalIds);
      setLocalDocuments(next);
      setDeleteLocalConfirmed(false);
      setNotice(`已删除 ${readyLocalIds.length} 份确认迁移完成的本地副本`);
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const rotateRecoveryCode = async () => {
    setBusy(true);
    try {
      await onRotateRecoveryCode();
      setRecoveryRotationOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    clearKnowledgeEmbeddingConnections();
    setConnections({});
    await onLogout();
  };

  const dialogBase = dialog && "baseId" in dialog
    ? bases.find((base) => base.id === dialog.baseId) || null
    : null;
  const dialogDocument = dialog?.kind === "delete-document"
    ? documents.find((document) => document.id === dialog.documentId) || null
    : null;
  const dialogTitle = dialog?.kind === "create-base"
    ? "创建知识库"
    : dialog?.kind === "edit-base"
      ? "编辑知识库"
      : dialog?.kind === "delete-base"
        ? "删除知识库"
        : dialog?.kind === "delete-document"
          ? "删除文档"
          : dialog?.kind === "reindex"
            ? "切换向量模型"
            : "迁移本地资料";

  return (
    <section className="knowledge-cloud-workspace" data-scroll-owner="knowledge-workspace">
      <div className="knowledge-workspace-inner">
        <header className="knowledge-workspace-heading">
          <div>
            <span className="knowledge-cloud-kicker">KNOWLEDGE WORKSPACE</span>
            <div className="knowledge-workspace-title-row">
              <h1>{account.username} 的知识空间</h1>
              <span className="knowledge-account-chip">{account.username}</span>
            </div>
          </div>
          <div className="knowledge-workspace-heading-actions">
            {localDocuments.length ? (
              <button type="button" className="knowledge-workspace-button" onClick={openMigration}>
                <HardDrive size={16} />迁移本地资料<span>{localDocuments.length}</span>
              </button>
            ) : null}
            <button type="button" className="knowledge-workspace-button primary" onClick={openCreateBase} disabled={!profiles.length}>
              <Plus size={16} />新建知识库
            </button>
          </div>
        </header>

        <section className="knowledge-capacity" aria-label="知识库总容量">
          <div className="knowledge-capacity-copy">
            <span><Database size={16} />总容量</span>
            <strong>{formatBytes(capacityUsed)} / {formatBytes(capacityQuota)}</strong>
            {capacityReserved > 0 ? <small>另有 {formatBytes(capacityReserved)} 正在预留</small> : <small>所有知识库共用</small>}
          </div>
          <div className="knowledge-capacity-track" aria-hidden="true">
            <span style={{ width: `${capacityPercent}%` }} />
          </div>
        </section>

        <div className="knowledge-workspace-grid">
          <aside className="knowledge-catalog" aria-label="知识库目录">
            <div className="knowledge-catalog-heading">
              <div><FolderOpen size={17} /><strong>知识库</strong><span>{bases.length}</span></div>
              <button type="button" className="knowledge-icon-button" onClick={() => void refreshWorkspace()} aria-label="刷新知识库" title="刷新知识库">
                <RefreshCw size={15} className={loading ? "knowledge-cloud-spin" : ""} />
              </button>
            </div>
            <div className="knowledge-catalog-list">
              {bases.map((base) => {
                const percent = progressPercent(base.embeddingProgress.readyChunks, base.embeddingProgress.totalChunks);
                return (
                  <button
                    type="button"
                    key={base.id}
                    className={`knowledge-base-item ${selectedBaseId === base.id ? "active" : ""}`}
                    aria-pressed={selectedBaseId === base.id}
                    onClick={() => selectBase(base.id)}
                  >
                    <span className="knowledge-base-item-icon"><Database size={17} /></span>
                    <span className="knowledge-base-item-copy">
                      <strong>{base.name}</strong>
                      <small>{base.documentCount} 份文档 · {base.embeddingProfile?.actualModel || "未配置"}</small>
                      <span className="knowledge-base-mini-progress"><i style={{ width: `${percent}%` }} /></span>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                );
              })}
              {!loading && !bases.length ? (
                <div className="knowledge-catalog-empty">
                  <Database size={20} />
                  <strong>还没有知识库</strong>
                  <button type="button" onClick={openCreateBase} disabled={!profiles.length}>创建第一个</button>
                </div>
              ) : null}
            </div>

            <section className="knowledge-connections" aria-label="向量连接">
              <div className="knowledge-connections-heading"><Server size={16} /><div><strong>向量连接</strong><small>仅当前浏览器会话</small></div></div>
              {(["openai", "qwen"] as const).map((vendor) => {
                const connected = isKnowledgeEmbeddingConnectionReady(connections[vendor]);
                const required = requiredVendors.includes(vendor);
                return (
                  <div className="knowledge-connection-row" key={vendor}>
                    <i className={connected ? "ready" : ""} />
                    <span><strong>{embeddingVendorLabels[vendor]}</strong><small>{connected ? "当前会话已连接" : required ? "待配置" : "未使用"}</small></span>
                    <button type="button" onClick={() => editEmbeddingConnection(vendor)}>{connected ? "修改" : "配置"}</button>
                    {connected ? <button type="button" className="danger" onClick={() => removeEmbeddingConnection(vendor)} aria-label={`清除 ${embeddingVendorLabels[vendor]} 连接`}><X size={13} /></button> : null}
                  </div>
                );
              })}
              {editingVendor ? (
                <div className="knowledge-cloud-connection-form">
                  <label><span>API URL</span><input value={connectionDraft.baseUrl} onChange={(event) => setConnectionDraft((current) => ({ ...current, baseUrl: event.target.value }))} autoComplete="url" /></label>
                  <label><span>API Key</span><input type="password" value={connectionDraft.apiKey} onChange={(event) => setConnectionDraft((current) => ({ ...current, apiKey: event.target.value }))} autoComplete="off" /></label>
                  <div className="knowledge-cloud-connection-actions">
                    <button type="button" className="knowledge-cloud-compact-button" onClick={() => setEditingVendor(null)}>取消</button>
                    <button type="button" className="knowledge-cloud-compact-button primary" onClick={saveEmbeddingConnection}><Save size={14} />保存到本次会话</button>
                  </div>
                </div>
              ) : null}
              <div className="knowledge-index-actions">
                <button
                  type="button"
                  className="knowledge-workspace-button primary full"
                  onClick={() => void continueIndexing()}
                  disabled={indexing || !pendingBases.length || missingPendingVendors.length > 0}
                >
                  {indexing ? <LoaderCircle className="knowledge-cloud-spin" size={16} /> : indexPaused ? <RotateCcw size={16} /> : <Play size={16} />}
                  {indexing ? "正在向量化" : pendingBases.length ? "继续索引" : "索引已就绪"}
                </button>
                {indexing ? <button type="button" className="knowledge-workspace-button full" onClick={pauseIndexing}><Pause size={15} />暂停</button> : null}
              </div>
            </section>
          </aside>

          <main className="knowledge-detail">
            {selectedBase ? (
              <>
                <header className="knowledge-detail-heading">
                  <div className="knowledge-detail-title">
                    <span className="knowledge-detail-icon"><Database size={20} /></span>
                    <div><h2>{selectedBase.name}</h2><p>{selectedBase.description || "暂无描述"}</p></div>
                  </div>
                  <div className="knowledge-detail-actions">
                    <button type="button" className="knowledge-icon-button" onClick={() => openEditBase(selectedBase)} aria-label="编辑知识库" title="编辑知识库"><Pencil size={15} /></button>
                    <button type="button" className="knowledge-icon-button" onClick={() => openReindex(selectedBase)} aria-label="切换向量模型" title="切换向量模型"><Settings2 size={15} /></button>
                    <button type="button" className="knowledge-icon-button" onClick={() => void toggleArchive(selectedBase)} aria-label={selectedBase.status === "archived" ? "恢复知识库" : "归档知识库"} title={selectedBase.status === "archived" ? "恢复知识库" : "归档知识库"}>{selectedBase.status === "archived" ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                    <button type="button" className="knowledge-icon-button danger" onClick={() => setDialog({ kind: "delete-base", baseId: selectedBase.id })} aria-label="删除知识库" title="删除知识库"><Trash2 size={15} /></button>
                  </div>
                </header>

                <div className="knowledge-detail-stats">
                  <span><strong>{selectedBase.documentCount}</strong><small>文档</small></span>
                  <span><strong>{selectedBase.readyDocumentCount}</strong><small>可检索</small></span>
                  <span><strong>{selectedBase.embeddingProgress.readyChunks}/{selectedBase.embeddingProgress.totalChunks}</strong><small>向量分块</small></span>
                  <span><strong>{formatBytes(selectedBase.logicalBytes)}</strong><small>逻辑占用</small></span>
                </div>

                {selectedBase.pendingIndexVersion !== null && selectedBase.activeIndexVersion !== null ? (
                  <div className="knowledge-reindex-banner"><RefreshCw size={16} /><span><strong>新索引构建中</strong><small>旧索引仍可用，完成后自动切换。</small></span></div>
                ) : null}
                {missingPendingVendors.length ? (
                  <div className="knowledge-inline-alert"><KeyRound size={16} /><span>请先配置 {missingPendingVendors.map((vendor) => embeddingVendorLabels[vendor]).join("、")} URL 和 Key，再继续向量化。</span></div>
                ) : null}

                <section className="knowledge-documents">
                  <div className="knowledge-documents-heading">
                    <div><h3>文档</h3><span>{documents.length}</span></div>
                    <div>
                      <input ref={fileInputRef} className="knowledge-file-input" type="file" multiple accept={knowledgeUploadAccept} onChange={(event) => void handleFiles(event)} />
                      <button type="button" className="knowledge-workspace-button" onClick={() => fileInputRef.current?.click()} disabled={selectedBase.status !== "active" || uploadActive}><Upload size={15} />上传文档</button>
                    </div>
                  </div>

                  {uploadQueue.length ? (
                    <div className="knowledge-upload-queue" aria-label="上传队列">
                      {uploadQueue.map((item) => (
                        <div className={`knowledge-upload-item ${item.stage}`} key={item.id}>
                          <span>{item.stage === "done" ? <CheckCircle2 size={16} /> : item.stage === "failed" ? <CircleAlert size={16} /> : <CloudUpload size={16} />}</span>
                          <div><strong>{item.name}</strong><small>{item.error || `${formatBytes(item.size)} · ${uploadStageLabels[item.stage]}`}</small></div>
                          {item.stage === "failed" || item.stage === "done" ? <button type="button" onClick={() => setUploadQueue((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`移除 ${item.name}`}><X size={14} /></button> : <LoaderCircle className="knowledge-cloud-spin" size={15} />}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="knowledge-document-list">
                    {documents.map((document) => (
                      <article className="knowledge-document-row" key={document.id}>
                        <span className="knowledge-document-icon"><FileText size={17} /></span>
                        <div className="knowledge-document-copy">
                          <strong>{document.displayName}</strong>
                          <small>{formatBytes(document.verifiedBytes || document.declaredBytes || 0)} · {formatDate(document.updatedAt)}</small>
                          {document.errorCode ? <em>{document.errorCode}</em> : null}
                        </div>
                        <StatusBadge status={document.status} />
                        <button type="button" className="knowledge-icon-button danger" onClick={() => setDialog({ kind: "delete-document", documentId: document.id })} aria-label={`删除 ${document.displayName}`} title="删除文档" disabled={document.status === "deleting"}><Trash2 size={14} /></button>
                      </article>
                    ))}
                    {!documentsLoading && !documents.length ? (
                      <div className="knowledge-document-empty"><FileText size={22} /><strong>暂无文档</strong><span>支持 PDF、Office、文本、Markdown、CSV、JSON 和 HTML。</span></div>
                    ) : null}
                    {documentsLoading ? <div className="knowledge-document-loading"><LoaderCircle className="knowledge-cloud-spin" size={18} />正在读取文档</div> : null}
                  </div>
                </section>

                {migration?.items.length ? (
                  <section className="knowledge-migration-progress">
                    <div className="knowledge-migration-heading">
                      <div><HardDrive size={17} /><span><strong>本地迁移</strong><small>{migration.items.filter((item) => item.stage === "ready").length}/{migration.items.length} 已可检索</small></span></div>
                      <button type="button" className="knowledge-workspace-button" onClick={openMigration}>查看</button>
                    </div>
                    <div className="knowledge-migration-items">
                      {migration.items.slice(0, 4).map((item) => (
                        <span key={item.localDocumentId} className={item.stage}><strong>{item.name}</strong><small>{item.stage === "ready" ? "已就绪" : item.stage === "failed" ? item.error || "迁移失败" : "处理中"}</small></span>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="knowledge-detail-empty"><Database size={26} /><h2>创建一个知识库</h2><button type="button" className="knowledge-workspace-button primary" onClick={openCreateBase} disabled={!profiles.length}><Plus size={16} />新建知识库</button></div>
            )}
          </main>
        </div>

        <footer className="knowledge-workspace-footer">
          <div className="knowledge-cloud-account-security">
            {recoveryRotationOpen ? (
              <>
                <p>重新生成后旧恢复码立即失效，新恢复码仍只显示一次。</p>
                <div className="knowledge-cloud-account-actions">
                  <button type="button" className="knowledge-cloud-secondary" onClick={() => setRecoveryRotationOpen(false)} disabled={busy}>取消</button>
                  <button type="button" className="knowledge-cloud-primary" onClick={() => void rotateRecoveryCode()} disabled={busy}><KeyRound size={16} />确认重新生成</button>
                </div>
              </>
            ) : (
              <button type="button" className="knowledge-cloud-secondary" onClick={() => setRecoveryRotationOpen(true)}><KeyRound size={16} />重新生成恢复码</button>
            )}
          </div>
          <button type="button" className="knowledge-cloud-logout" onClick={() => void logout()} disabled={busy}><LogOut size={16} />退出知识库账号</button>
        </footer>

        {error ? <p className="knowledge-workspace-message error" role="alert">{error}</p> : null}
        {notice ? <p className="knowledge-workspace-message is-notice" role="status">{notice}</p> : null}
      </div>

      <Dialog
        open={Boolean(dialog)}
        labelledBy="knowledge-workspace-dialog-title"
        onClose={() => !busy && !migrationRunning && setDialog(null)}
        canClose={!busy && !migrationRunning}
        className="knowledge-workspace-dialog"
      >
        <header className="knowledge-dialog-heading">
          <div><span className="knowledge-detail-icon">{dialog?.kind === "migration" ? <HardDrive size={18} /> : <Database size={18} />}</span><h2 id="knowledge-workspace-dialog-title">{dialogTitle}</h2></div>
          <button type="button" className="knowledge-icon-button" onClick={() => setDialog(null)} aria-label="关闭" disabled={busy || migrationRunning}><X size={16} /></button>
        </header>

        {dialog?.kind === "create-base" || dialog?.kind === "edit-base" ? (
          <form className="knowledge-dialog-form" onSubmit={(event) => void saveBase(event)}>
            <label><span>名称</span><input value={baseDraft.name} onChange={(event) => setBaseDraft((current) => ({ ...current, name: event.target.value }))} maxLength={120} autoFocus required /></label>
            <label><span>描述</span><textarea value={baseDraft.description} onChange={(event) => setBaseDraft((current) => ({ ...current, description: event.target.value }))} maxLength={500} rows={3} /></label>
            {dialog.kind === "create-base" ? (
              <label><span>向量模型</span><select value={baseDraft.profileId} onChange={(event) => setBaseDraft((current) => ({ ...current, profileId: event.target.value }))} required>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.label || profile.actualModel} · {profile.dimensions} 维</option>)}</select></label>
            ) : null}
            <div className="knowledge-dialog-actions"><button type="button" className="knowledge-workspace-button" onClick={() => setDialog(null)}>取消</button><button type="submit" className="knowledge-workspace-button primary" disabled={busy}><Save size={15} />保存</button></div>
          </form>
        ) : null}

        {dialog?.kind === "delete-base" ? (
          <div className="knowledge-dialog-confirm"><CircleAlert size={22} /><p>将删除“{dialogBase?.name}”及其文档、分块和向量。对象清理完成后才返还容量。</p><div className="knowledge-dialog-actions"><button type="button" className="knowledge-workspace-button" onClick={() => setDialog(null)}>取消</button><button type="button" className="knowledge-workspace-button danger" onClick={() => void confirmDeleteBase()} disabled={busy}><Trash2 size={15} />确认删除</button></div></div>
        ) : null}

        {dialog?.kind === "delete-document" ? (
          <div className="knowledge-dialog-confirm"><CircleAlert size={22} /><p>删除“{dialogDocument?.displayName}”后将清理原文件、分块和向量，操作不可撤销。</p><div className="knowledge-dialog-actions"><button type="button" className="knowledge-workspace-button" onClick={() => setDialog(null)}>取消</button><button type="button" className="knowledge-workspace-button danger" onClick={() => void confirmDeleteDocument()} disabled={busy}><Trash2 size={15} />确认删除</button></div></div>
        ) : null}

        {dialog?.kind === "reindex" ? (
          <div className="knowledge-dialog-form">
            <label><span>新向量模型</span><select value={reindexProfileId} onChange={(event) => setReindexProfileId(event.target.value)}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.label || profile.actualModel} · {profile.dimensions} 维</option>)}</select></label>
            {dialogBase?.documentCount ? <div className="knowledge-dialog-note"><RefreshCw size={16} /><span>重建期间新旧索引会同时占用容量，旧索引保持可用；容量不足时服务端会拒绝开始。</span></div> : null}
            <div className="knowledge-dialog-actions"><button type="button" className="knowledge-workspace-button" onClick={() => setDialog(null)}>取消</button><button type="button" className="knowledge-workspace-button primary" onClick={() => void confirmReindex()} disabled={busy}><RotateCcw size={15} />{dialogBase?.documentCount ? "开始重建" : "切换模型"}</button></div>
          </div>
        ) : null}

        {dialog?.kind === "migration" ? (
          <div className="knowledge-migration-dialog">
            <label className="knowledge-dialog-field"><span>目标知识库</span><select value={migrationTargetId} onChange={(event) => setMigrationTargetId(event.target.value)} disabled={migrationRunning}>{activeBases.filter((base) => base.status === "active").map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}</select></label>
            <div className="knowledge-migration-selection">
              {localDocuments.map((document) => (
                <label key={document.id}>
                  <input type="checkbox" checked={migrationSelection.has(document.id)} disabled={migrationRunning} onChange={(event) => setMigrationSelection((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(document.id); else next.delete(document.id);
                    return next;
                  })} />
                  <span><strong>{document.name}</strong><small>{formatBytes(new Blob([document.text]).size)} · 本地原文</small></span>
                  {migration?.items.find((item) => item.localDocumentId === document.id) ? <em>{migration.items.find((item) => item.localDocumentId === document.id)?.stage === "ready" ? "已就绪" : migration.items.find((item) => item.localDocumentId === document.id)?.stage === "failed" ? "失败" : "已记录"}</em> : null}
                </label>
              ))}
              {!localDocuments.length ? <div className="knowledge-document-empty"><Check size={20} /><strong>没有待迁移的本地资料</strong></div> : null}
            </div>
            <p className="knowledge-migration-warning">迁移失败不会删除 IndexedDB 原数据；云端文档显示“可检索”后，才允许手动删除对应本地副本。</p>
            {readyLocalIds.length ? (
              <div className="knowledge-local-delete">
                <label><input type="checkbox" checked={deleteLocalConfirmed} onChange={(event) => setDeleteLocalConfirmed(event.target.checked)} /><span>我已确认 {readyLocalIds.length} 份云端文档可检索</span></label>
                <button type="button" className="knowledge-workspace-button danger" onClick={() => void deleteReadyLocalCopies()} disabled={!deleteLocalConfirmed || busy}><Trash2 size={15} />删除已迁移本地副本</button>
              </div>
            ) : null}
            <div className="knowledge-dialog-actions"><button type="button" className="knowledge-workspace-button" onClick={() => setDialog(null)} disabled={migrationRunning}>关闭</button><button type="button" className="knowledge-workspace-button primary" onClick={() => void runMigration()} disabled={migrationRunning || !localDocuments.length}>{migrationRunning ? <LoaderCircle className="knowledge-cloud-spin" size={15} /> : <CloudUpload size={15} />}{migrationRunning ? "迁移中" : migration ? "继续迁移" : "开始迁移"}</button></div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

export default KnowledgeCloudWorkspace;
