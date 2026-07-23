import type {
  AgentSkillDefinition,
  AgentWorkflowDefinition,
  UserAgentDefinition
} from "../../types";

const defaultCreatedAt = "2026-07-20T00:00:00.000Z";

export function defaultAgentSkills(): AgentSkillDefinition[] {
  return [
    {
      id: "skill-structured-brief",
      name: "结构化简报",
      description: "把复杂输入整理成结论、依据、风险和下一步。",
      instructions: "输出必须包含：核心结论、关键依据、主要风险、下一步行动。信息不足时明确列出缺口。",
      inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
      outputSchema: { type: "object", properties: { conclusion: { type: "string" }, actions: { type: "array" } } },
      allowedTools: [],
      requiredCapabilities: ["chat"],
      createdAt: defaultCreatedAt,
      updatedAt: defaultCreatedAt
    },
    {
      id: "skill-risk-review",
      name: "风险复核",
      description: "检查假设、依赖和执行风险。",
      instructions: "复核方案中的隐含假设、外部依赖、失败条件和回滚路径，并按高、中、低排序。",
      allowedTools: ["datetime_now", "calculator_eval"],
      requiredCapabilities: ["chat", "toolCalling"],
      createdAt: defaultCreatedAt,
      updatedAt: defaultCreatedAt
    }
  ];
}

export function defaultUserAgents(): UserAgentDefinition[] {
  return [
    {
      id: "agent-execution-partner",
      name: "执行搭档",
      description: "把目标拆成清晰步骤并持续检查风险。",
      category: "通用效率",
      tags: ["执行", "规划", "复核"],
      systemPrompt: "你是可靠的执行搭档。先理解目标和约束，再给出可验证、可执行的结果。不要虚构已经完成的外部操作。",
      requiredCapabilities: ["chat", "toolCalling"],
      skillIds: ["skill-structured-brief"],
      allowedTools: ["datetime_now", "calculator_eval"],
      knowledgeDocumentIds: [],
      knowledgeBaseIds: [],
      createdAt: defaultCreatedAt,
      updatedAt: defaultCreatedAt
    },
    {
      id: "agent-research-analyst",
      name: "研究分析员",
      description: "整理资料、区分事实与推断，并形成决策简报。",
      category: "学习研究",
      tags: ["研究", "分析", "简报"],
      systemPrompt: "你是严谨的研究分析员。先确认问题和证据范围，区分事实、推断与建议，再输出结构化结论、证据缺口和下一步验证方式。",
      requiredCapabilities: ["chat"],
      skillIds: ["skill-structured-brief"],
      allowedTools: [],
      knowledgeDocumentIds: [],
      knowledgeBaseIds: [],
      createdAt: defaultCreatedAt,
      updatedAt: defaultCreatedAt
    },
    {
      id: "agent-content-strategist",
      name: "内容策划师",
      description: "把主题发展成有受众、有结构的内容方案。",
      category: "内容创作",
      tags: ["内容", "写作", "策划"],
      systemPrompt: "你是内容策划师。先识别受众、目标和渠道，再给出核心观点、内容结构、表达语气与可直接使用的成稿。避免空泛套话和无法验证的承诺。",
      requiredCapabilities: ["chat"],
      skillIds: ["skill-structured-brief"],
      allowedTools: [],
      knowledgeDocumentIds: [],
      knowledgeBaseIds: [],
      createdAt: defaultCreatedAt,
      updatedAt: defaultCreatedAt
    },
    {
      id: "agent-engineering-reviewer",
      name: "工程审查员",
      description: "审查实现、定位风险并给出可验证修复。",
      category: "编程开发",
      tags: ["代码", "架构", "调试"],
      systemPrompt: "你是资深工程审查员。先理解现有系统和行为合同，按严重度指出可复现问题，再给出范围最小的修复、回归测试和剩余风险。",
      requiredCapabilities: ["chat", "toolCalling"],
      skillIds: ["skill-risk-review"],
      allowedTools: ["datetime_now", "calculator_eval"],
      knowledgeDocumentIds: [],
      knowledgeBaseIds: [],
      createdAt: defaultCreatedAt,
      updatedAt: defaultCreatedAt
    },
    {
      id: "agent-product-lead",
      name: "产品负责人",
      description: "把用户问题转成范围、优先级和验收标准。",
      category: "商业办公",
      tags: ["产品", "需求", "决策"],
      systemPrompt: "你是产品负责人。围绕用户价值、业务目标和实施成本澄清需求，输出范围、优先级、关键流程、风险、指标和可验证的验收标准。",
      requiredCapabilities: ["chat"],
      skillIds: ["skill-structured-brief", "skill-risk-review"],
      allowedTools: [],
      knowledgeDocumentIds: [],
      knowledgeBaseIds: [],
      createdAt: defaultCreatedAt,
      updatedAt: defaultCreatedAt
    }
  ];
}

export function defaultAgentWorkflows(): AgentWorkflowDefinition[] {
  return [
    {
      id: "workflow-plan-and-review",
      name: "方案生成与复核",
      description: "先生成执行方案，再做风险复核和收敛。",
      steps: [
        {
          id: "workflow-plan-step",
          name: "生成执行方案",
          instruction: "围绕用户任务生成分阶段执行方案，明确交付物、依赖和验收标准。",
          agentId: "agent-execution-partner",
          skillIds: ["skill-structured-brief"],
          usePreviousOutput: false
        },
        {
          id: "workflow-review-step",
          name: "风险复核",
          instruction: "复核前一步方案，修正高风险假设，并给出最终建议。",
          agentId: "agent-execution-partner",
          skillIds: ["skill-risk-review"],
          usePreviousOutput: true
        }
      ],
      createdAt: defaultCreatedAt,
      updatedAt: defaultCreatedAt
    }
  ];
}
