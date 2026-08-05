const profiles = {
  brainstorm: {
    label: "自由脑暴",
    purpose: "围绕中心主题发散互相区分的方向，再把每个方向细化为可继续探索的观点。",
    branchGuidance: ["目标与价值", "用户与场景", "机会与想法", "限制与风险", "验证与下一步"],
    instructions: [
      "优先产生明显不同的方向，不要把同义表达拆成多个一级分支。",
      "发散之后必须收敛到可验证的问题、选择或行动。"
    ]
  },
  "meeting-action": {
    label: "会议行动",
    purpose: "把会议材料整理为忠实、可追踪的结论、任务、责任边界和待确认事项。",
    branchGuidance: ["议题", "结论", "任务", "负责人", "时间点", "风险", "待确认"],
    instructions: [
      "不得补写材料中没有出现的决定、负责人或日期，缺失信息标记为待确认。",
      "任务节点优先使用动宾短语，并保留材料中明确出现的责任人与时间。"
    ]
  },
  "project-plan": {
    label: "项目计划",
    purpose: "把项目目标转化为范围明确、阶段清晰、能够验收和追踪风险的执行结构。",
    branchGuidance: ["目标", "范围", "里程碑", "任务", "资源", "风险", "验收标准"],
    instructions: [
      "目标与验收标准必须对应，里程碑描述阶段结果而不只是日期。",
      "明确区分范围内、范围外和外部依赖。"
    ]
  },
  "learning-notes": {
    label: "学习笔记",
    purpose: "把知识主题组织为从概念理解到示例、误区、练习和实际应用的学习路径。",
    branchGuidance: ["核心概念", "基本原理", "方法步骤", "示例", "常见误区", "练习", "应用"],
    instructions: [
      "概念节点尽量配套示例或反例，避免只堆术语。",
      "按先修关系组织内容，并把需要进一步确认的知识点明确标出。"
    ]
  },
  "product-planning": {
    label: "产品规划",
    purpose: "从目标用户和真实问题出发，形成价值、能力、指标、路线图和风险相互对应的产品结构。",
    branchGuidance: ["目标用户", "用户问题", "价值主张", "核心能力", "使用场景", "指标", "路线图", "风险"],
    instructions: [
      "每项功能必须连接到具体用户问题或价值，不生成脱离场景的功能清单。",
      "区分事实、假设和待验证指标，不编造用户没有提供的数据。"
    ]
  },
  "content-outline": {
    label: "内容大纲",
    purpose: "把一个内容主题组织为观点明确、论据充分、节奏连贯并带有结论的表达结构。",
    branchGuidance: ["目标受众", "核心观点", "开场", "主要章节", "论据与案例", "结论", "行动号召"],
    instructions: [
      "章节应共同服务于一个核心观点，不把相关关键词简单并列。",
      "案例和数据仅能来自用户材料，缺失时写成建议补充而不是虚构。"
    ]
  },
  "problem-analysis": {
    label: "问题分析",
    purpose: "把问题拆分为可验证的现象、事实、原因、影响、解决方案和验证路径。",
    branchGuidance: ["问题现象", "已知事实", "直接原因", "潜在根因", "影响", "方案", "验证方式"],
    instructions: [
      "明确区分相关性、推断和已证实因果，不把猜测写成事实。",
      "每个解决方案尽量对应原因，并说明如何验证是否有效。"
    ]
  },
  "decision-comparison": {
    label: "决策对比",
    purpose: "围绕目标和评价标准比较候选方案，呈现收益、成本、风险、条件与推荐依据。",
    branchGuidance: ["决策目标", "评价标准", "候选方案", "优势", "成本与限制", "风险", "建议", "验证动作"],
    instructions: [
      "使用一致的评价维度比较各方案，不为某个方案单独改变标准。",
      "推荐必须说明成立条件和主要不确定性；信息不足时保留待确认项。"
    ]
  }
};

export const MINDMAP_PRESET_IDS = Object.freeze(Object.keys(profiles));

export const MINDMAP_PRESET_PROFILES = Object.freeze(
  Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, Object.freeze({
    ...profile,
    branchGuidance: Object.freeze([...profile.branchGuidance]),
    instructions: Object.freeze([...profile.instructions])
  })]))
);

export function getMindmapPresetProfile(value) {
  return MINDMAP_PRESET_PROFILES[value] || MINDMAP_PRESET_PROFILES.brainstorm;
}

export function mindmapPresetProfilePrompt(profile) {
  return [
    `当前预设：${profile.label}`,
    `预设目的：${profile.purpose}`,
    `建议覆盖：${profile.branchGuidance.join("、")}`,
    ...profile.instructions.map((instruction) => `内容规则：${instruction}`)
  ].join("\n");
}
