import {
  BrainCircuit,
  GitFork,
  Image,
  Images,
  LayoutGrid,
  MessageCircle,
  Sparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { GenerationModuleId, ModuleId } from "../types";

export type ModuleMeta = {
  label: string;
  title: string;
  description: string;
  highlights: string[];
  icon: LucideIcon;
  group: "core" | "creative" | "automation" | "library";
  status?: "ready" | "beta" | "planned";
};

const legacyLabels: Partial<Record<ModuleId, string>> = {
  audio: "音频",
  video: "视频",
  knowledge: "知识库",
  ppt: "PPT",
  assistants: "助手库"
};

export const moduleMeta: Record<ModuleId, ModuleMeta> = {
  chat: {
    label: "对话",
    title: "AI 对话",
    description: "选择模型和智能体，用自己的 API URL 和 Key 发起多轮对话。",
    highlights: ["模型选择", "流式回复", "多模态附件"],
    icon: MessageCircle,
    group: "core",
    status: "ready"
  },
  image: {
    label: "绘画",
    title: "AI 绘画",
    description: "左侧配置提示词、尺寸、风格和质量，右侧直接浏览已生成图片并继续复用创作。",
    highlights: ["文生图", "历史画廊", "提示词复用"],
    icon: Image,
    group: "creative",
    status: "ready"
  },
  mindmap: {
    label: "思维导图",
    title: "思维导图",
    description: "把主题、资料摘要或会议纪要整理成层级结构和 Mermaid 导图。",
    highlights: ["结构梳理", "节点拆分", "导出复用"],
    icon: GitFork,
    group: "creative",
    status: "ready"
  },
  agents: {
    label: "智能体",
    title: "智能体",
    description: "选择角色和工具，执行带有拆解、调用记录和结果沉淀的结构化任务。",
    highlights: ["工具调用", "任务拆解", "执行轨迹"],
    icon: BrainCircuit,
    group: "automation",
    status: "ready"
  },
  apps: {
    label: "应用",
    title: "AI 应用",
    description: "使用开发者维护的应用模板，把常用场景变成一键工作流。",
    highlights: ["应用市场", "场景模板", "快速运行"],
    icon: LayoutGrid,
    group: "automation",
    status: "ready"
  },
  gallery: {
    label: "画廊",
    title: "作品画廊",
    description: "集中浏览、筛选、收藏、导出和回放本地生成结果。",
    highlights: ["本地保存", "批量管理", "回到功能"],
    icon: Images,
    group: "library",
    status: "ready"
  },
  audio: {
    label: legacyLabels.audio || "音频",
    title: "音频",
    description: "历史能力已从公开菜单移除。",
    highlights: ["历史结果", "兼容显示", "不在菜单展示"],
    icon: Sparkles,
    group: "library",
    status: "planned"
  },
  video: {
    label: legacyLabels.video || "视频",
    title: "视频",
    description: "历史能力已从公开菜单移除。",
    highlights: ["历史结果", "兼容显示", "不在菜单展示"],
    icon: Sparkles,
    group: "library",
    status: "planned"
  },
  ppt: {
    label: legacyLabels.ppt || "PPT",
    title: "PPT",
    description: "历史能力已从公开菜单移除。",
    highlights: ["历史结果", "兼容显示", "不在菜单展示"],
    icon: Sparkles,
    group: "library",
    status: "planned"
  },
  knowledge: {
    label: legacyLabels.knowledge || "知识库",
    title: "知识库",
    description: "历史能力已从公开菜单移除。",
    highlights: ["历史结果", "兼容显示", "不在菜单展示"],
    icon: Sparkles,
    group: "library",
    status: "planned"
  },
  assistants: {
    label: legacyLabels.assistants || "助手库",
    title: "助手库",
    description: "历史能力已合并到智能体和后台维护。",
    highlights: ["后台维护", "智能体使用", "不在菜单展示"],
    icon: Sparkles,
    group: "library",
    status: "planned"
  }
};

export const portalModuleOrder: ModuleId[] = [
  "chat",
  "image",
  "mindmap",
  "agents",
  "apps",
  "gallery"
];

export const generationModuleIds = new Set<GenerationModuleId>(["image"]);

export const placeholderModuleIds = new Set<ModuleId>();

export const moduleGroupLabels: Record<ModuleMeta["group"], string> = {
  core: "核心入口",
  creative: "创作工作台",
  automation: "自动化",
  library: "资源沉淀"
};

export const moduleGroupOrder: ModuleMeta["group"][] = [
  "core",
  "creative",
  "automation",
  "library"
];

export function cleanMenuLabel(id: ModuleId, fallback?: string) {
  const looksCorrupted = fallback ? /[\uFFFD\u951F]/.test(fallback) : false;
  return fallback && !looksCorrupted ? fallback : moduleMeta[id].label;
}
