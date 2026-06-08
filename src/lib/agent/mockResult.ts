import { assertAgentResult } from "@/lib/agent/schemas"
import type { AgentResult, AgentRun } from "@/types/product"

export const mockAgentResult: AgentResult = {
  productName: "简历岗位匹配助手",
  summary:
    "8 条反馈集中指向同一个机会：求职者希望先理解岗位要求与简历差距，再获得可控的修改建议，而不是让 AI 自动代改。",
  demandClusters: [
    {
      title: "简历与岗位差距诊断",
      description: "用户想知道为什么投递没有回应，以及自己的简历和岗位要求之间差在哪里。",
      evidenceFeedbackIds: ["F001", "F004", "F005"],
      evidenceQuotes: [
        { feedbackId: "F001", quote: "我不知道为什么简历投出去没有回应" },
        { feedbackId: "F004", quote: "希望知道我的简历和岗位差在哪里" },
      ],
      frequency: 3,
      userPain: "求职者无法判断失败原因，投递行为缺少反馈闭环。",
      productOpportunity: "提供岗位匹配评分、差距说明和可执行建议，降低用户决策成本。",
      confidence: 0.88,
      confidenceReason: "多条反馈直接表达同一类诊断诉求，且覆盖访谈、客服等来源。",
    },
    {
      title: "JD 重点提炼与关键词建议",
      description: "用户看不懂 JD 重点，也不知道不同岗位应该调整哪些关键词。",
      evidenceFeedbackIds: ["F003", "F006"],
      evidenceQuotes: [
        { feedbackId: "F003", quote: "我看不懂岗位 JD 里哪些要求最重要" },
        { feedbackId: "F006", quote: "不同岗位的关键词不一样，我不知道怎么调整简历" },
      ],
      frequency: 2,
      userPain: "岗位描述信息密集，用户难以区分核心要求与次要要求。",
      productOpportunity: "把 JD 解析为关键能力、关键词和简历调整方向。",
      confidence: 0.82,
      confidenceReason: "反馈数量不算最多，但痛点描述明确且与核心场景强相关。",
    },
    {
      title: "用户可控的修改建议",
      description: "用户希望 AI 提供建议和导出内容，但不希望 AI 自动乱改简历。",
      evidenceFeedbackIds: ["F002", "F007", "F008"],
      evidenceQuotes: [
        { feedbackId: "F007", quote: "我不想让 AI 自动乱改我的简历，只想给建议" },
        { feedbackId: "F008", quote: "我希望能导出一份修改建议给自己慢慢改" },
      ],
      frequency: 3,
      userPain: "自动改写会破坏信任，用户需要保留最终编辑权。",
      productOpportunity: "用建议清单和导出能力替代自动覆盖式改写。",
      confidence: 0.9,
      confidenceReason: "用户明确说出边界条件，能直接指导 MVP 的产品安全边界。",
    },
  ],
  mvpScope: {
    mustHave: [
      {
        feature: "上传简历与 JD",
        reason: "这是完成岗位匹配和差距诊断的输入闭环。",
        evidenceFeedbackIds: ["F003", "F004", "F006"],
      },
      {
        feature: "岗位匹配评分",
        reason: "用户需要快速判断是否值得投递。",
        evidenceFeedbackIds: ["F005"],
      },
      {
        feature: "差距诊断说明",
        reason: "用户核心问题是“不知道为什么没回应”和“不知道差在哪里”。",
        evidenceFeedbackIds: ["F001", "F004"],
      },
      {
        feature: "修改建议清单",
        reason: "建议清单满足用户可控修改诉求，避免自动覆盖简历。",
        evidenceFeedbackIds: ["F007", "F008"],
      },
    ],
    shouldHave: [
      {
        feature: "建议导出",
        reason: "用户希望把建议带走慢慢改，但不影响第一版核心分析闭环。",
        evidenceFeedbackIds: ["F008"],
      },
      {
        feature: "关键词高亮",
        reason: "能增强 JD 理解体验，但可在基础差距诊断后迭代。",
        evidenceFeedbackIds: ["F003", "F006"],
      },
      {
        feature: "多岗位对比",
        reason: "有助于多岗位投递，但反馈证据较弱，暂不进入 MVP 必做。",
        evidenceFeedbackIds: ["F002"],
      },
    ],
    outOfScope: [
      {
        feature: "AI 自动改写并覆盖简历",
        reason: "用户明确表达不希望 AI 自动乱改，应先建立可控建议体验。",
        evidenceFeedbackIds: ["F007"],
      },
      {
        feature: "投递平台自动化",
        reason: "反馈未体现自动投递诉求，且会扩大合规与平台接入范围。",
        evidenceFeedbackIds: [],
      },
    ],
  },
  ricePrioritization: [
    {
      feature: "岗位匹配评分",
      reach: 80,
      impact: 3,
      confidence: 0.86,
      effort: 2,
      score: 103.2,
      priority: "P0",
      rationale: "多条反馈直接提到需要判断是否值得投递，适合作为 MVP 核心结果。",
      formula: "80 * 3 * 0.86 / 2 = 103.2",
      evidenceFeedbackIds: ["F005", "F001", "F004"],
    },
    {
      feature: "差距诊断说明",
      reach: 75,
      impact: 3,
      confidence: 0.88,
      effort: 2,
      score: 99,
      priority: "P0",
      rationale: "解释为什么不匹配能帮助用户理解下一步行动。",
      formula: "75 * 3 * 0.88 / 2 = 99",
      evidenceFeedbackIds: ["F001", "F004"],
    },
    {
      feature: "修改建议清单",
      reach: 70,
      impact: 2,
      confidence: 0.9,
      effort: 2,
      score: 63,
      priority: "P1",
      rationale: "满足用户可控修改诉求，但可在诊断能力之后迭代精细化。",
      formula: "70 * 2 * 0.9 / 2 = 63",
      evidenceFeedbackIds: ["F002", "F007", "F008"],
    },
  ],
  prd: {
    title: "简历岗位匹配助手 MVP PRD",
    background:
      "求职者在投递前缺少对岗位要求、简历差距和修改方向的结构化判断，导致重复修改成本高、投递信心不足。",
    targetUsers: ["应届生", "转行求职者", "社招求职者", "海外求职者"],
    problemStatement:
      "用户无法快速判断简历是否匹配目标岗位，也不知道应该优先调整哪些内容。",
    goals: ["让用户理解岗位核心要求", "给出匹配评分和差距说明", "提供可控的修改建议"],
    nonGoals: ["不自动覆盖用户简历", "不做自动投递", "不接入招聘平台"],
    userStories: [
      "作为应届生，我希望看到岗位匹配评分，以判断是否值得投递。",
      "作为转行求职者，我希望知道简历缺少哪些关键词和经历表达。",
      "作为社招用户，我希望拿到建议清单后自己决定怎么修改。",
    ],
    functionalRequirements: [
      "用户可以输入或上传岗位 JD 与简历文本。",
      "系统输出匹配评分、关键差距和证据说明。",
      "系统生成按优先级排序的修改建议清单。",
      "用户可以复制或导出建议内容。",
    ],
    successMetrics: ["分析完成率 >= 80%", "建议复制率 >= 30%", "用户对评分解释满意度 >= 4/5"],
    trackingPlan: [
      {
        eventName: "resume_match_analyzed",
        trigger: "用户完成一次简历与 JD 分析",
        properties: ["user_type", "score_range", "jd_length"],
        purpose: "评估核心分析流程是否被使用。",
      },
      {
        eventName: "suggestion_copied",
        trigger: "用户复制修改建议",
        properties: ["suggestion_count", "score_range"],
        purpose: "衡量建议是否具备行动价值。",
      },
    ],
  },
  engineeringTasks: [
    {
      type: "Epic",
      title: "简历岗位匹配 MVP",
      description: "完成从输入 JD/简历到输出评分、差距和建议的核心闭环。",
      acceptanceCriteria: ["用户可以完成一次分析", "结果包含评分、差距、建议三类信息"],
      priority: "P0",
    },
    {
      type: "Story",
      title: "岗位 JD 与简历输入",
      description: "支持用户粘贴 JD 与简历文本，并进行基础校验。",
      acceptanceCriteria: ["空内容不可提交", "输入内容保留在分析前预览区"],
      priority: "P0",
    },
    {
      type: "Task",
      title: "实现匹配结果展示组件",
      description: "展示匹配评分、差距标签、修改建议和证据说明。",
      acceptanceCriteria: ["评分醒目可见", "建议可复制", "移动端不重叠"],
      priority: "P1",
      dependsOn: ["岗位 JD 与简历输入"],
    },
  ],
  feishuReviewMessage:
    "【PMOpsAgent 评审摘要】\n本次基于 8 条用户反馈，建议 MVP 聚焦“简历岗位匹配助手”：P0 包括岗位匹配评分、差距诊断说明；P1 包括可控修改建议和建议导出。暂不做自动改写、自动投递和招聘平台接入，以降低信任风险和交付范围。",
  risks: [
    {
      risk: "评分解释不清会降低用户信任",
      level: "medium",
      mitigation: "每个评分维度都展示来自 JD 与简历的证据。",
    },
    {
      risk: "自动改写可能引发用户反感",
      level: "high",
      mitigation: "MVP 只提供建议清单，不自动覆盖原文。",
    },
  ],
  openQuestions: ["是否需要支持 PDF/Word 简历上传？", "目标用户更偏应届生还是社招人群？"],
  trace: [
    {
      id: "feedback_loaded",
      step: "读取反馈",
      status: "success",
      message: "已加载 8 条用户反馈。",
      timestamp: "21:30:02",
    },
    {
      id: "insights_generated",
      step: "分析需求",
      status: "success",
      message: "识别出 3 个高频需求主题。",
      timestamp: "21:30:05",
    },
    {
      id: "mvp_generated",
      step: "生成 MVP 范围",
      status: "success",
      message: "已区分必做、可选和暂不做功能。",
      timestamp: "21:30:07",
    },
    {
      id: "prd_generated",
      step: "生成 PRD",
      status: "success",
      message: "PRD 草稿已生成。",
      timestamp: "21:30:09",
    },
    {
      id: "tasks_generated",
      step: "拆解任务",
      status: "success",
      message: "已拆解 3 条研发任务草稿。",
      timestamp: "21:30:10",
    },
    {
      id: "waiting_for_approval",
      step: "等待审批",
      status: "waiting_approval",
      message: "飞书评审摘要已准备好，等待用户确认发送。",
      timestamp: "21:30:11",
    },
    {
      id: "send_feishu",
      step: "发送飞书",
      status: "pending",
      message: "用户确认后才会发送。",
      timestamp: "21:30:11",
    },
  ],
}

export function createMockAgentRun(): AgentRun {
  return {
    result: assertAgentResult(mockAgentResult),
    mode: "mock",
    isMock: true,
    message: "当前为 Mock 模式：结果用于演示界面流程，不代表真实模型分析。",
    generatedAt: new Date().toISOString(),
  }
}
