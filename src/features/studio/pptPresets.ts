import type {
  PptContentDensity,
  PptNarrative,
  PptPresentationType,
  PptThemeId
} from "../../types";

type PptPresetDefaults = {
  audience: string;
  duration: string;
  slideCount: number;
  narrative: PptNarrative;
  contentDensity: PptContentDensity;
  visualTone: string;
  themeId: PptThemeId;
};

export type PptPresentationPreset = {
  id: PptPresentationType;
  label: string;
  purpose: string;
  sequence: readonly string[];
  promptIdeas: readonly string[];
  defaults: PptPresetDefaults;
};

export const pptPresentationPresets = [
  {
    id: "business-report",
    label: "商业汇报",
    purpose: "用结论、指标与行动建议支持管理决策。",
    sequence: ["结论", "现状", "指标", "问题", "方案", "行动"],
    promptIdeas: ["季度经营复盘", "区域增长策略", "降本增效方案"],
    defaults: {
      audience: "企业管理层",
      duration: "8-10 分钟",
      slideCount: 8,
      narrative: "pyramid",
      contentDensity: "balanced",
      visualTone: "专业简洁",
      themeId: "red-note"
    }
  },
  {
    id: "product-launch",
    label: "产品发布",
    purpose: "从用户痛点出发，清晰传达产品价值与发布节奏。",
    sequence: ["痛点", "承诺", "亮点", "场景", "差异", "发布"],
    promptIdeas: ["AI 办公助手新品发布", "智能硬件春季发布会", "SaaS 产品升级发布"],
    defaults: {
      audience: "客户与合作伙伴",
      duration: "15 分钟",
      slideCount: 10,
      narrative: "story",
      contentDensity: "balanced",
      visualTone: "明快创意",
      themeId: "red-note"
    }
  },
  {
    id: "pitch-deck",
    label: "融资路演",
    purpose: "围绕机会、验证与回报建立可信的投资叙事。",
    sequence: ["问题", "方案", "市场", "进展", "模式", "团队", "融资"],
    promptIdeas: ["AI 原生协作产品融资路演", "消费品牌 A 轮融资", "机器人项目种子轮路演"],
    defaults: {
      audience: "潜在投资人",
      duration: "15 分钟",
      slideCount: 10,
      narrative: "problem-solution",
      contentDensity: "concise",
      visualTone: "极简科技",
      themeId: "midnight"
    }
  },
  {
    id: "project-plan",
    label: "项目方案",
    purpose: "明确目标、范围、里程碑、资源与交付标准。",
    sequence: ["背景", "目标", "范围", "路径", "排期", "风险", "验收"],
    promptIdeas: ["数字化转型项目方案", "新品上市项目计划", "客户成功体系建设"],
    defaults: {
      audience: "内部团队",
      duration: "15 分钟",
      slideCount: 10,
      narrative: "timeline",
      contentDensity: "detailed",
      visualTone: "稳重商务",
      themeId: "business-blue"
    }
  },
  {
    id: "course",
    label: "教学课件",
    purpose: "用目标、示例、练习和回顾形成完整学习闭环。",
    sequence: ["目标", "概念", "示例", "步骤", "练习", "测验", "回顾"],
    promptIdeas: ["生成式 AI 入门课程", "产品经理数据分析课", "新员工信息安全培训"],
    defaults: {
      audience: "学生与学员",
      duration: "20 分钟",
      slideCount: 12,
      narrative: "story",
      contentDensity: "detailed",
      visualTone: "教学清晰",
      themeId: "red-note"
    }
  },
  {
    id: "annual-review",
    label: "年度总结",
    purpose: "用目标、成果、复盘与下一年重点呈现年度价值。",
    sequence: ["总览", "目标", "成果", "指标", "复盘", "规划"],
    promptIdeas: ["年度经营总结", "产品团队年度复盘", "个人年度述职"],
    defaults: {
      audience: "企业管理层",
      duration: "15 分钟",
      slideCount: 10,
      narrative: "data-first",
      contentDensity: "balanced",
      visualTone: "稳重商务",
      themeId: "business-blue"
    }
  },
  {
    id: "data-analysis",
    label: "数据分析",
    purpose: "从问题和数据出发，解释趋势、驱动因素与行动建议。",
    sequence: ["问题", "口径", "指标", "趋势", "归因", "洞察", "行动"],
    promptIdeas: ["用户留存数据分析", "电商大促效果复盘", "销售漏斗诊断"],
    defaults: {
      audience: "企业管理层",
      duration: "15 分钟",
      slideCount: 10,
      narrative: "data-first",
      contentDensity: "detailed",
      visualTone: "极简科技",
      themeId: "business-blue"
    }
  },
  {
    id: "industry-research",
    label: "行业研究",
    purpose: "系统呈现市场边界、趋势、格局、风险与判断。",
    sequence: ["范围", "市场", "趋势", "产业链", "竞争", "风险", "展望"],
    promptIdeas: ["具身智能行业研究", "企业级 AI 市场洞察", "新能源储能趋势分析"],
    defaults: {
      audience: "企业管理层",
      duration: "20 分钟",
      slideCount: 12,
      narrative: "pyramid",
      contentDensity: "detailed",
      visualTone: "专业简洁",
      themeId: "midnight"
    }
  }
] as const satisfies readonly PptPresentationPreset[];

export function getPptPresentationPreset(value: string): PptPresentationPreset {
  return pptPresentationPresets.find((preset) => preset.id === value) || pptPresentationPresets[0];
}
