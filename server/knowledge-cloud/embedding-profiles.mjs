import crypto from "node:crypto";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "./errors.mjs";

const profiles = [
  {
    id: "openai-text-embedding-3-small",
    vendor: "openai",
    label: "OpenAI Text Embedding 3 Small",
    actualModel: "text-embedding-3-small",
    dimensions: 1536,
    defaultBaseUrl: "https://api.openai.com/v1",
    protocol: "openai-embeddings",
    maxBatchInputs: 32,
    maxInputTokens: 8192,
    bytesPerComponent: 4,
    storageType: "vector"
  },
  {
    id: "openai-text-embedding-3-large",
    vendor: "openai",
    label: "OpenAI Text Embedding 3 Large",
    actualModel: "text-embedding-3-large",
    dimensions: 3072,
    defaultBaseUrl: "https://api.openai.com/v1",
    protocol: "openai-embeddings",
    maxBatchInputs: 32,
    maxInputTokens: 8192,
    bytesPerComponent: 2,
    storageType: "halfvec"
  },
  {
    id: "qwen-text-embedding-v4",
    vendor: "qwen",
    label: "Qwen Text Embedding V4",
    actualModel: "text-embedding-v4",
    dimensions: 1024,
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    protocol: "qwen-openai-compatible-embeddings",
    maxBatchInputs: 10,
    maxInputTokens: 8192,
    bytesPerComponent: 4,
    storageType: "vector"
  }
].map((profile) => Object.freeze({
  ...profile,
  fingerprint: crypto
    .createHash("sha256")
    .update(`${profile.vendor}\0${profile.id}\0${profile.actualModel}\0${profile.dimensions}`, "utf8")
    .digest("hex")
}));

export const APPROVED_KNOWLEDGE_EMBEDDING_PROFILES = Object.freeze(profiles);

export function publicKnowledgeEmbeddingProfiles() {
  return APPROVED_KNOWLEDGE_EMBEDDING_PROFILES.map((profile) => ({ ...profile }));
}

export function requireKnowledgeEmbeddingProfile(profileId) {
  const id = String(profileId || "").trim();
  const profile = APPROVED_KNOWLEDGE_EMBEDDING_PROFILES.find((entry) => entry.id === id);
  if (!profile) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.EMBEDDING_PROFILE_INVALID,
      "请选择受支持的 OpenAI 或 Qwen 向量模型",
      { status: 400, details: { field: "embeddingProfileId" } }
    );
  }
  return profile;
}
