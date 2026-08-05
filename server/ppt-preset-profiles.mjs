const profiles = {
  "business-report": {
    label: "商业汇报",
    purpose: "帮助管理者快速理解结论、经营事实、关键问题与下一步行动。",
    narrativeFlow: "结论先行 → 当前状态 → 核心指标 → 关键问题 → 解决方案 → 行动计划",
    requiredSections: ["结论或决策请求", "核心指标与变化", "关键问题", "行动建议", "总结"],
    optionalSections: ["背景", "方案对比", "风险与资源"],
    layoutCycle: ["data", "two-column", "timeline", "content"],
    layoutGuidance: "优先使用 data 展示指标，two-column 展示问题与方案，timeline 展示行动计划，最后使用 summary。",
    instructions: [
      "开场后的第一页必须给出可执行结论，不要先铺陈长背景。",
      "每个关键判断尽量对应证据、影响和负责人或下一步动作。",
      "若用户没有提供数据，只描述需要验证的指标和数据来源，不得虚构具体数值。"
    ]
  },
  "product-launch": {
    label: "产品发布",
    purpose: "让听众从用户问题自然过渡到产品价值、差异化和发布行动。",
    narrativeFlow: "用户痛点 → 产品承诺 → 核心能力 → 使用场景 → 差异化 → 发布节奏 → 行动号召",
    requiredSections: ["用户痛点", "产品价值承诺", "核心能力", "典型场景", "差异化", "发布与行动号召"],
    optionalSections: ["客户证言", "定价", "路线图"],
    layoutCycle: ["two-column", "timeline", "content", "data"],
    layoutGuidance: "可用 quote 强调用户原话或价值主张，two-column 对比前后体验或竞品差异，timeline 展示发布节奏，最后使用 summary。",
    instructions: [
      "不要把发布稿写成功能清单，每项能力都要连接到具体用户收益。",
      "场景页应描述角色、任务、使用过程和结果。",
      "行动号召必须明确听众接下来应该做什么。"
    ]
  },
  "pitch-deck": {
    label: "融资路演",
    purpose: "用问题、解决方案、市场验证与团队能力建立可信的投资逻辑。",
    narrativeFlow: "使命 → 问题 → 解决方案 → 市场 → 进展 → 商业模式 → 竞争 → 团队 → 融资需求与愿景",
    requiredSections: ["问题", "解决方案", "市场机会", "验证或进展", "商业模式", "竞争优势", "团队", "融资需求"],
    optionalSections: ["产品演示", "增长策略", "财务假设"],
    layoutCycle: ["data", "two-column", "content", "timeline"],
    layoutGuidance: "优先使用 data 呈现市场与进展，two-column 呈现竞争或商业模式，quote 呈现使命或客户证言，最后使用 summary 表达融资需求。",
    instructions: [
      "路演应保持高信息密度但文字精简，每页只回答一个投资问题。",
      "不得编造市场规模、收入、客户数或增长率；缺失信息应写成待补充指标。",
      "融资需求要说明资金用途、阶段目标和希望获得的资源。"
    ]
  },
  "project-plan": {
    label: "项目方案",
    purpose: "把目标、范围、实施路径、资源、风险和验收标准转化为可执行计划。",
    narrativeFlow: "背景 → 目标与范围 → 方案路径 → 里程碑 → 资源与分工 → 风险 → 验收标准",
    requiredSections: ["目标", "范围", "实施方案", "里程碑", "资源与分工", "风险", "验收标准"],
    optionalSections: ["现状诊断", "方案对比", "预算"],
    layoutCycle: ["timeline", "two-column", "data", "content"],
    layoutGuidance: "必须使用 timeline 展示里程碑，two-column 展示范围内外或方案对比，data 展示资源、预算或验收指标，最后使用 summary。",
    instructions: [
      "目标必须可验证，并与最后的验收标准形成对应关系。",
      "里程碑应包含阶段结果，不要只罗列日期。",
      "风险页应说明触发条件、影响和应对动作。"
    ]
  },
  course: {
    label: "教学课件",
    purpose: "通过目标、讲解、示例、练习、测验和回顾形成完整学习闭环。",
    narrativeFlow: "学习目标 → 核心概念 → 示例 → 操作步骤 → 练习 → 测验 → 回顾",
    requiredSections: ["学习目标", "核心概念", "示例", "练习或互动", "知识检查", "总结"],
    optionalSections: ["先修知识", "常见误区", "延伸阅读"],
    layoutCycle: ["two-column", "timeline", "content", "data"],
    layoutGuidance: "使用 section 划分教学单元，two-column 对照概念与示例，timeline 展示步骤，quote 强调关键原则，最后使用 summary。",
    instructions: [
      "每个概念都应配一个具体示例或应用场景。",
      "练习页必须给出明确任务，演讲备注中可提供答案思路。",
      "控制单页认知负荷，详细解释放入 speakerNotes。"
    ]
  },
  "annual-review": {
    label: "年度总结",
    purpose: "围绕年度目标、成果、关键指标、经验教训与下一年重点完成复盘。",
    narrativeFlow: "年度总览 → 目标与结果 → 关键成果 → KPI 趋势 → 经验教训 → 下一年重点",
    requiredSections: ["年度总览", "目标与结果", "关键成果", "指标趋势", "经验教训", "下一年重点"],
    optionalSections: ["团队成长", "代表案例", "致谢"],
    layoutCycle: ["data", "two-column", "timeline", "content"],
    layoutGuidance: "优先使用 data 展示目标与结果，timeline 展示年度节奏，two-column 展示成果与不足，最后使用 summary。",
    instructions: [
      "区分完成事项和产生的实际结果。",
      "指标页需要说明对比基准和趋势，不得只堆数字。",
      "下一年重点要收敛为可执行的少数优先级。"
    ]
  },
  "data-analysis": {
    label: "数据分析",
    purpose: "从业务问题和数据口径出发，解释趋势、差异、驱动因素和行动建议。",
    narrativeFlow: "分析问题与数据 → 核心指标 → 趋势与对比 → 驱动因素 → 洞察 → 行动与局限",
    requiredSections: ["问题与数据口径", "核心指标", "趋势或对比", "驱动因素", "关键洞察", "行动建议与局限"],
    optionalSections: ["分群", "异常点", "方法说明"],
    layoutCycle: ["data", "two-column", "content", "timeline"],
    layoutGuidance: "多使用 data 展示指标，two-column 展示对比或分群，timeline 仅用于有时间演变的数据，最后使用 summary。",
    instructions: [
      "明确区分事实、推断和建议，不把相关性写成因果关系。",
      "每个指标都应说明口径、比较对象或时间范围。",
      "结论必须回到最初的业务问题，并标出数据限制。"
    ]
  },
  "industry-research": {
    label: "行业研究",
    purpose: "系统呈现研究边界、市场结构、趋势、产业链、竞争格局、风险与展望。",
    narrativeFlow: "研究范围 → 市场概览 → 关键趋势 → 产业链 → 细分市场 → 竞争格局 → 风险 → 展望",
    requiredSections: ["研究范围", "市场概览", "关键趋势", "产业链或细分市场", "竞争格局", "风险", "展望"],
    optionalSections: ["政策环境", "技术路线", "标杆案例"],
    layoutCycle: ["data", "two-column", "timeline", "content"],
    layoutGuidance: "使用 data 展示市场事实，timeline 展示趋势演进，two-column 展示细分或竞争对比，quote 可呈现核心判断，最后使用 summary。",
    instructions: [
      "先定义行业边界、地区和时间范围，再给出判断。",
      "事实性结论应在 visualDescription 或 speakerNotes 中提示建议来源与数据日期。",
      "展望页应区分高确定性趋势、关键变量和主要风险。"
    ]
  }
};

export const PPT_PRESENTATION_TYPE_IDS = Object.freeze(Object.keys(profiles));

export const PPT_PRESENTATION_PROFILES = Object.freeze(
  Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, Object.freeze(profile)]))
);

export function getPptPresentationProfile(value) {
  return PPT_PRESENTATION_PROFILES[value] || PPT_PRESENTATION_PROFILES["business-report"];
}

export function pptPresentationProfilePrompt(profile) {
  return [
    `当前预设：${profile.label}`,
    `预设目的：${profile.purpose}`,
    `推荐叙事：${profile.narrativeFlow}`,
    `必需内容：${profile.requiredSections.join("、")}`,
    `可选内容：${profile.optionalSections.join("、")}`,
    `版式建议：${profile.layoutGuidance}`,
    "版式硬性规则：封面只用于第一页，最后一页使用 summary；连续三页不得使用相同 type；应根据语义穿插 data、timeline、two-column 或 quote，而不是机械轮换。",
    ...profile.instructions.map((instruction) => `内容规则：${instruction}`)
  ].join("\n");
}
