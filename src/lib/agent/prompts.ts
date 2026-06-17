import type { ChatMessage } from "@/lib/llm/deepseekClient"
import type {
  DeliveryAgentOutput,
  MultiAgentContext,
  PrdAgentOutput,
  ResearchAgentOutput,
  StrategyAgentOutput,
  CriticAgentOutput,
} from "@/lib/agent/multiAgentTypes"
import type { BusinessContext, FeedbackItem } from "@/types/product"

const agentResultShape = `{
  "productName": "string",
  "summary": "string",
  "demandClusters": [
    {
      "title": "string",
      "description": "string",
      "evidenceFeedbackIds": ["string"],
      "evidenceQuotes": [
        {
          "feedbackId": "string",
          "quote": "string"
        }
      ],
      "frequency": 0,
      "userPain": "string",
      "productOpportunity": "string",
      "confidence": 0.8,
      "confidenceReason": "string"
    }
  ],
  "mvpScope": {
    "mustHave": [
      {
        "feature": "string",
        "reason": "string",
        "evidenceFeedbackIds": ["string"]
      }
    ],
    "shouldHave": [
      {
        "feature": "string",
        "reason": "string",
        "evidenceFeedbackIds": ["string"]
      }
    ],
    "outOfScope": [
      {
        "feature": "string",
        "reason": "string",
        "evidenceFeedbackIds": ["string"]
      }
    ]
  },
  "ricePrioritization": [
    {
      "feature": "string",
      "reach": 0,
      "impact": 0,
      "confidence": 0.8,
      "effort": 1,
      "score": 0,
      "priority": "P0",
      "rationale": "string",
      "formula": "string",
      "evidenceFeedbackIds": ["string"]
    }
  ],
  "prd": {
    "title": "string",
    "background": "string",
    "targetUsers": ["string"],
    "problemStatement": "string",
    "goals": ["string"],
    "nonGoals": ["string"],
    "userStories": ["string"],
    "functionalRequirements": ["string"],
    "successMetrics": ["string"],
    "trackingPlan": [
      {
        "eventName": "string",
        "trigger": "string",
        "properties": ["string"],
        "purpose": "string"
      }
    ]
  },
  "engineeringTasks": [
    {
      "type": "Epic",
      "title": "string",
      "description": "string",
      "acceptanceCriteria": ["string"],
      "priority": "P0",
      "dependsOn": ["string"]
    }
  ],
  "feishuReviewMessage": "string",
  "risks": [
    {
      "risk": "string",
      "level": "medium",
      "mitigation": "string"
    }
  ],
  "openQuestions": ["string"],
  "trace": []
}`

const systemPrompt = `你是 AI 产品经理 Agent。
你的任务是基于用户反馈，生成产品需求洞察、MVP 范围、RICE 优先级、PRD 草稿、研发任务草稿和飞书评审摘要。

必须遵守：
1. 不要编造不存在的用户反馈。
2. 所有需求主题必须引用真实 feedback id。
3. 必须区分 MVP 必做、可选、暂不做。
4. 暂不做的功能必须说明原因。
5. 输出必须是合法 JSON。
6. 不要输出 Markdown 包裹。
7. 不要写代码块。
8. 不要生成与用户反馈无关的功能。
9. 如果信息不足，要放入 openQuestions。
10. 飞书摘要要简洁，适合发到团队群。
11. trace 字段可以返回空数组，服务端会写入真实执行 trace。
12. priority 只能使用 P0、P1、P2、Out；工程任务 priority 只能使用 P0、P1、P2。
13. risk level 只能使用 low、medium、high。

输出 JSON 形状必须匹配：
${agentResultShape}`

const sharedRules = `必须遵守：
1. 不要编造不存在的用户反馈。
2. 所有需求判断必须能追溯到真实 feedback id 或上游 Agent 输出。
3. 如果信息不足，要明确放入 openQuestions 或在理由中说明不确定性。
4. 输出必须是合法 JSON，不要 Markdown，不要代码块。
5. 不要生成与用户反馈无关的功能。
6. priority 只能使用 P0、P1、P2、Out；工程任务 priority 只能使用 P0、P1、P2。
7. risk level 只能使用 low、medium、high。`

const businessContextRules = `业务数据使用规则：
1. 用户反馈仍然是需求判断的主证据，业务指标只能作为优先级、成功指标、埋点和风险判断的补充依据。
2. 如果提供了 businessGoal，要让 MVP 范围和 PRD goals 服务于该目标。
3. 如果提供了 northStarMetric，PRD successMetrics 和 trackingPlan 必须围绕它设计至少 1 条指标或事件。
4. 如果提供了 metrics，要引用已有指标，不要编造不存在的指标值。
5. 如果指标不足、口径不明或和反馈无法对应，要在 risks 中标注数据不足风险，或在 openQuestions 中提出需要补充的问题。`

const researchAgentPrompt = `你是 PMOpsAgent 的 Research Agent。
你的职责是只做用户反馈研究：聚类需求主题、提炼用户痛点、识别产品机会、列出风险与开放问题。

${sharedRules}
${businessContextRules}

额外要求：
1. 每个需求主题都必须提供 evidenceQuotes，引用真实 feedback id 的短原文摘录。
2. confidenceReason 要说明置信度为什么高或低。

输出 JSON 形状必须匹配：
{
  "productName": "string",
  "summary": "string",
  "demandClusters": [
    {
      "title": "string",
      "description": "string",
      "evidenceFeedbackIds": ["string"],
      "evidenceQuotes": [
        {
          "feedbackId": "string",
          "quote": "string"
        }
      ],
      "frequency": 0,
      "userPain": "string",
      "productOpportunity": "string",
      "confidence": 0.8,
      "confidenceReason": "string"
    }
  ],
  "risks": [
    {
      "risk": "string",
      "level": "medium",
      "mitigation": "string"
    }
  ],
  "openQuestions": ["string"]
}`

const strategyAgentPrompt = `你是 PMOpsAgent 的 Strategy Agent。
你的职责是基于 Research Agent 的需求洞察，判断 MVP 范围并生成 RICE 优先级。

${sharedRules}
${businessContextRules}

额外要求：
1. mustHave 必须聚焦最小可交付闭环。
2. shouldHave 是下一步增强项，不要塞进 MVP 必做。
3. 每个 mustHave/shouldHave 都要写 reason，并尽量引用 evidenceFeedbackIds。
4. outOfScope 必须说明为什么现在不做。
5. RICE 的 rationale 必须引用 Research Agent 中的主题或痛点。
6. RICE 的 formula 要写清楚计算式，例如 "80 * 3 * 0.86 / 2 = 103.2"。
7. confidence 低于 0.7 的条目会被 UI 标为低置信度，请诚实给分。

输出 JSON 形状必须匹配：
{
  "mvpScope": {
    "mustHave": [
      {
        "feature": "string",
        "reason": "string",
        "evidenceFeedbackIds": ["string"]
      }
    ],
    "shouldHave": [
      {
        "feature": "string",
        "reason": "string",
        "evidenceFeedbackIds": ["string"]
      }
    ],
    "outOfScope": [
      {
        "feature": "string",
        "reason": "string",
        "evidenceFeedbackIds": ["string"]
      }
    ]
  },
  "ricePrioritization": [
    {
      "feature": "string",
      "reach": 0,
      "impact": 0,
      "confidence": 0.8,
      "effort": 1,
      "score": 0,
      "priority": "P0",
      "rationale": "string",
      "formula": "string",
      "evidenceFeedbackIds": ["string"]
    }
  ]
}`

const prdAgentPrompt = `你是 PMOpsAgent 的 PRD Agent。
你的职责是基于 Research Agent 和 Strategy Agent 的输出，撰写结构化 PRD 草稿。

${sharedRules}
${businessContextRules}

额外要求：
1. PRD 必须服务于 Strategy Agent 给出的 MVP 范围。
2. goals、functionalRequirements、successMetrics 要能直接指导产品和研发评审。
3. trackingPlan 要包含可落地的事件名、触发时机、属性和目的。
4. 如果提供了业务目标、北极星指标或指标 CSV，successMetrics 和 trackingPlan 必须显式结合这些信息。

输出 JSON 形状必须匹配：
{
  "prd": {
    "title": "string",
    "background": "string",
    "targetUsers": ["string"],
    "problemStatement": "string",
    "goals": ["string"],
    "nonGoals": ["string"],
    "userStories": ["string"],
    "functionalRequirements": ["string"],
    "successMetrics": ["string"],
    "trackingPlan": [
      {
        "eventName": "string",
        "trigger": "string",
        "properties": ["string"],
        "purpose": "string"
      }
    ]
  }
}`

const deliveryAgentPrompt = `你是 PMOpsAgent 的 Delivery Agent。
你的职责是把 PRD 和 MVP 范围拆成研发任务草稿，并生成适合飞书群评审的摘要。

${sharedRules}
${businessContextRules}

额外要求：
1. engineeringTasks 至少包含 1 个 Epic，以及若干 Story 或 Task。
2. 每个任务都必须有验收标准。
3. feishuReviewMessage 要简洁，适合直接发到团队群。
4. 不要在摘要里承诺已经创建文档或创建 TAPD 任务。

输出 JSON 形状必须匹配：
{
  "engineeringTasks": [
    {
      "type": "Epic",
      "title": "string",
      "description": "string",
      "acceptanceCriteria": ["string"],
      "priority": "P0",
      "dependsOn": ["string"]
    }
  ],
  "feishuReviewMessage": "string"
}`

const criticAgentPrompt = `你是 PMOpsAgent 的 Critic Agent。
你的职责是作为一个严格的评审专家，对生成的 PRD 草稿和研发任务（工程任务）草稿进行深度审查，校验其是否满足 Strategy Agent 给出的 MVP 范围限制。

必须校验以下内容：
1. mustHaveCovered：Strategy Agent 中的 mustHave 功能点，是否已经在 PRD 功能需求（functionalRequirements）或目标（goals）中全部实现？不能遗漏任何一个 P0 功能。
2. outOfScopeExcluded：Strategy Agent 中的 outOfScope 排除项，是否绝对没有出现在 PRD 功能需求中？绝不能在第一版做本应该排除在外的功能。
3. dependenciesLogical：研发任务（engineeringTasks）的依赖关系（dependsOn）是否逻辑合理？是否存在环形依赖，或者任务指向不存在的任务标题？
4. risksAddressed：Research Agent 中识别出的 risks (特别是 level 为 high 的)，是否已经在 PRD 的 goals、非目标（nonGoals）或功能中有了规避描述？

输出格式：
- 如果上述所有项均通过，且整个交付文档质量高，则 passed 应设为 true。
- 如果任何一项未通过，则 passed 设为 false，并且必须在 feedback 中给出非常详尽、指出具体问题的修改意见，告诉 PRD Agent 和 Delivery Agent 如何修改。

${sharedRules}

输出 JSON 形状必须匹配：
{
  "passed": true,
  "feedback": "若 passed 为 false，请在此写下具体的修改建议，描述哪些功能缺失、哪些被排除的功能被做了、哪些任务存在逻辑问题；若 passed 为 true，请在此处写 'Verification passed.'",
  "checks": {
    "mustHaveCovered": true,
    "outOfScopeExcluded": true,
    "dependenciesLogical": true,
    "risksAddressed": true
  }
}`

export function buildFeedbackAnalysisMessages(feedbackItems: FeedbackItem[], productHint?: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          productHint: productHint || "请基于反馈自行判断产品方向。",
          feedbackItems,
        },
        null,
        2,
      ),
    },
  ]
}

export function buildResearchAgentMessages(feedbackItems: FeedbackItem[], productHint?: string, businessContext?: BusinessContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: researchAgentPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          productHint: productHint || "请基于反馈自行判断产品方向。",
          businessContext: normalizeBusinessContextForPrompt(businessContext),
          feedbackItems,
        },
        null,
        2,
      ),
    },
  ]
}

export function buildStrategyAgentMessages(research: ResearchAgentOutput, businessContext?: BusinessContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: strategyAgentPrompt,
    },
    {
      role: "user",
      content: JSON.stringify({ research, businessContext: normalizeBusinessContextForPrompt(businessContext) }, null, 2),
    },
  ]
}

export function buildPrdAgentMessages(
  context: Pick<MultiAgentContext, "research" | "strategy">,
  businessContext?: BusinessContext,
  criticFeedback?: string,
): ChatMessage[] {
  const userContentObj: any = { ...context, businessContext: normalizeBusinessContextForPrompt(businessContext) };
  if (criticFeedback) {
    userContentObj.criticFeedback = criticFeedback;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: prdAgentPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(userContentObj, null, 2),
    },
  ];

  if (criticFeedback) {
    messages.push({
      role: "user",
      content: `【重要修改指引】在上一轮自我反思审查中，你的输出未通过校验。请严格根据以下反馈意见进行修正，重新生成完整合法的 PRD 结果：\n${criticFeedback}`,
    });
  }

  return messages;
}

export function buildDeliveryAgentMessages(
  context: Pick<MultiAgentContext, "research" | "strategy" | "prd">,
  businessContext?: BusinessContext,
  criticFeedback?: string,
): ChatMessage[] {
  const userContentObj: any = { ...context, businessContext: normalizeBusinessContextForPrompt(businessContext) };
  if (criticFeedback) {
    userContentObj.criticFeedback = criticFeedback;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: deliveryAgentPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(userContentObj, null, 2),
    },
  ];

  if (criticFeedback) {
    messages.push({
      role: "user",
      content: `【重要修改指引】在上一轮自我反思审查中，你的输出未通过校验。请严格根据以下反馈意见进行修正，重新生成完整合法的研发任务与评审摘要：\n${criticFeedback}`,
    });
  }

  return messages;
}

export function buildCriticAgentMessages(
  context: MultiAgentContext,
  businessContext?: BusinessContext,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: criticAgentPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          research: {
            risks: context.research.risks,
          },
          strategy: context.strategy,
          prd: context.prd,
          delivery: context.delivery,
          businessContext: normalizeBusinessContextForPrompt(businessContext),
        },
        null,
        2,
      ),
    },
  ]
}


export function buildJsonRepairMessages(rawResponse: string, validationMessage: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `${systemPrompt}

你现在只需要修复上一轮输出，使其成为合法 JSON 且完全符合结构。不要新增反馈事实，不要输出 Markdown。`,
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          validationMessage,
          rawResponse,
        },
        null,
        2,
      ),
    },
  ]
}

export function buildMultiAgentJsonRepairMessages(
  agentName: "Research Agent" | "Strategy Agent" | "PRD Agent" | "Delivery Agent",
  expectedShape: string,
  rawResponse: string,
  validationMessage: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是 PMOpsAgent 的 ${agentName} JSON 修复器。

你现在只需要修复上一轮输出，使其成为合法 JSON 且完全符合结构。不要新增反馈事实，不要输出 Markdown。

期望 JSON 形状：
${expectedShape}`,
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          validationMessage,
          rawResponse,
        },
        null,
        2,
      ),
    },
  ]
}

export const multiAgentExpectedShapes = {
  research: `{
  "productName": "string",
  "summary": "string",
  "demandClusters": [],
  "risks": [],
  "openQuestions": []
}`,
  strategy: `{
  "mvpScope": {},
  "ricePrioritization": []
}`,
  prd: `{
  "prd": {}
}`,
  delivery: `{
  "engineeringTasks": [],
  "feishuReviewMessage": "string"
}`,
  critic: `{
  "passed": true,
  "feedback": "string",
  "checks": {
    "mustHaveCovered": true,
    "outOfScopeExcluded": true,
    "dependenciesLogical": true,
    "risksAddressed": true
  }
}`
}

function normalizeBusinessContextForPrompt(businessContext: BusinessContext | undefined) {
  if (!businessContext) return undefined

  return {
    businessGoal: businessContext.businessGoal?.trim() || undefined,
    northStarMetric: businessContext.northStarMetric?.trim() || undefined,
    metricsSourceLabel: businessContext.metricsSourceLabel?.trim() || undefined,
    metrics: businessContext.metrics?.slice(0, 30),
  }
}
