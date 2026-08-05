import type { MindmapPresetId } from "../../types";

export type MindmapPreset = {
  id: MindmapPresetId;
  label: string;
  description: string;
  example: string;
};

export const mindmapPresets: readonly MindmapPreset[] = [
  {
    id: "brainstorm",
    label: "自由脑暴",
    description: "发散方向，再收敛到可验证行动",
    example: "围绕一个新产品机会进行脑暴，整理用户、场景、创意、限制和验证方式"
  },
  {
    id: "meeting-action",
    label: "会议行动",
    description: "结论、任务、负责人和时间点",
    example: "把下面的会议记录整理为结论、待办、负责人、时间点、风险和待确认事项"
  },
  {
    id: "project-plan",
    label: "项目计划",
    description: "目标、范围、里程碑和验收",
    example: "制定一个网站改版项目计划，包含目标、范围、里程碑、资源、风险和验收标准"
  },
  {
    id: "learning-notes",
    label: "学习笔记",
    description: "概念、原理、示例、误区和练习",
    example: "整理这个知识主题的核心概念、基本原理、方法、示例、常见误区和练习路径"
  },
  {
    id: "product-planning",
    label: "产品规划",
    description: "用户问题、价值、能力、指标和路线图",
    example: "规划一个 AI 效率产品，梳理目标用户、真实问题、价值主张、核心能力、指标和路线图"
  },
  {
    id: "content-outline",
    label: "内容大纲",
    description: "观点、章节、论据、案例和结论",
    example: "为这个主题设计完整内容大纲，包含受众、核心观点、章节、论据、案例和结论"
  },
  {
    id: "problem-analysis",
    label: "问题分析",
    description: "现象、事实、原因、方案和验证",
    example: "分析这个问题的现象、已知事实、直接原因、潜在根因、影响、方案和验证方式"
  },
  {
    id: "decision-comparison",
    label: "决策对比",
    description: "标准、方案、成本、风险和建议",
    example: "比较多个候选方案，整理决策目标、评价标准、优势、成本、限制、风险和推荐依据"
  }
] as const;

export function mindmapPresetById(value: MindmapPresetId) {
  return mindmapPresets.find((preset) => preset.id === value) || mindmapPresets[0];
}
