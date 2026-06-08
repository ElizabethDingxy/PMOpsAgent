import { createMockAgentRun } from "@/lib/agent/mockResult"
import {
  buildDeliveryAgentMessages,
  buildMultiAgentJsonRepairMessages,
  buildPrdAgentMessages,
  buildResearchAgentMessages,
  buildStrategyAgentMessages,
  multiAgentExpectedShapes,
} from "@/lib/agent/prompts"
import {
  AgentResultValidationError,
  assertAgentResult,
  parseDeliveryAgentJson,
  parsePrdAgentJson,
  parseResearchAgentJson,
  parseStrategyAgentJson,
} from "@/lib/agent/schemas"
import type {
  DeliveryAgentOutput,
  MultiAgentContext,
  PrdAgentOutput,
  ResearchAgentOutput,
  StrategyAgentOutput,
} from "@/lib/agent/multiAgentTypes"
import { createDeepSeekChatCompletion, DeepSeekClientError, type ChatMessage } from "@/lib/llm/deepseekClient"
import { createTraceEvent } from "@/lib/trace/traceTypes"
import { createTraceRun, replaceTraceEvents } from "@/lib/trace/traceStore"
import type { TraceEvent } from "@/types/agent"
import type { AgentResult, AgentRun, BusinessContext, FeedbackItem } from "@/types/product"

export type RunAgentInput = {
  feedbackItems: FeedbackItem[]
  productHint?: string
  businessContext?: BusinessContext
  forceMock?: boolean
}

export class AgentRunError extends Error {
  code:
    | "INVALID_INPUT"
    | "LLM_REQUEST_TIMEOUT"
    | "LLM_REQUEST_FAILED"
    | "LLM_RESPONSE_INVALID"
    | "AGENT_RESULT_INVALID"

  fix: string
  trace: TraceEvent[]

  constructor(
    code: AgentRunError["code"],
    message: string,
    fix: string,
    trace: TraceEvent[],
    options?: {
      cause?: unknown
    },
  ) {
    super(message, options)
    this.name = "AgentRunError"
    this.code = code
    this.fix = fix
    this.trace = trace
  }
}

export async function runAgent({ feedbackItems, productHint, businessContext, forceMock = false }: RunAgentInput): Promise<AgentRun> {
  const runId = createTraceRun()
  const trace: TraceEvent[] = []

  validateInput(feedbackItems, trace, runId)
  trace.push(createTraceEvent("feedback_loaded", "读取反馈", "success", `已加载 ${feedbackItems.length} 条用户反馈。`, {
    feedbackCount: feedbackItems.length,
  }))

  if (forceMock || !process.env.DEEPSEEK_API_KEY?.trim()) {
    const mockRun = createMockAgentRun()
    const mockTrace = [
      ...trace,
      createTraceEvent("mock_mode_enabled", "启用 Mock", "success", "DEEPSEEK_API_KEY 未配置或用户选择 Mock，已使用示例结果。"),
      createTraceEvent("research_agent_completed", "Research Agent", "success", "Mock 需求洞察已生成。"),
      createTraceEvent("strategy_agent_completed", "Strategy Agent", "success", "Mock MVP 范围与 RICE 优先级已生成。"),
      createTraceEvent("prd_agent_completed", "PRD Agent", "success", "Mock PRD 草稿已生成。"),
      createTraceEvent("delivery_agent_completed", "Delivery Agent", "success", "Mock 研发任务草稿与飞书摘要已生成。"),
      createTraceEvent("orchestrator_completed", "Orchestrator", "success", "Mock 多 Agent 结果已汇总并校验。"),
      createTraceEvent("business_context_applied", "业务数据", "success", formatBusinessContextTraceMessage(businessContext)),
      createTraceEvent("waiting_for_approval", "等待审批", "waiting_approval", "飞书评审摘要已准备好，等待用户确认发送。"),
      createTraceEvent("send_feishu", "发送飞书", "pending", "用户点击确认后才会发送飞书。"),
    ]
    replaceTraceEvents(runId, mockTrace)

    return {
      ...mockRun,
      runId,
      result: {
        ...mockRun.result,
        trace: mockTrace,
      },
      generatedAt: new Date().toISOString(),
    }
  }

  try {
    const resultWithTrace = await runMultiAgentPipeline({
      feedbackItems,
      productHint,
      businessContext,
      trace,
      runId,
    })

    return {
      runId,
      result: resultWithTrace,
      mode: "llm",
      isMock: false,
      message: "当前为 LLM 模式：结果由多 Agent 分工基于上传反馈生成。",
      generatedAt: new Date().toISOString(),
    }
  } catch (error) {
    if (error instanceof AgentRunError) {
      throw error
    }

    const failedTrace = [
      ...trace,
      createTraceEvent("multi_agent_failed", "多 Agent 协作", "failed", toAgentRunErrorMessage(error)),
    ]

    if (error instanceof DeepSeekClientError) {
      replaceTraceEvents(runId, failedTrace)
      throw new AgentRunError(mapDeepSeekCode(error.code), error.message, fixForDeepSeekError(error.code), failedTrace, {
        cause: error,
      })
    }

    if (error instanceof AgentResultValidationError) {
      replaceTraceEvents(runId, failedTrace)
      throw new AgentRunError(
        "AGENT_RESULT_INVALID",
        error.message,
        "请重新运行分析；如果仍失败，可以暂时移除复杂或异常格式的反馈内容。",
        failedTrace,
        {
          cause: error,
        },
      )
    }

    replaceTraceEvents(runId, failedTrace)
    throw new AgentRunError("LLM_REQUEST_FAILED", "Agent 分析发生未知错误。", "请稍后重试，或进入 Mock 模式演示流程。", failedTrace, {
      cause: error,
    })
  }
}

type RunMultiAgentPipelineInput = {
  feedbackItems: FeedbackItem[]
  productHint?: string
  businessContext?: BusinessContext
  trace: TraceEvent[]
  runId: string
}

async function runMultiAgentPipeline({
  feedbackItems,
  productHint,
  businessContext,
  trace,
  runId,
}: RunMultiAgentPipelineInput): Promise<AgentResult> {
  if (hasBusinessContext(businessContext)) {
    replaceTraceEvent(trace, createTraceEvent("business_context_applied", "业务数据", "success", formatBusinessContextTraceMessage(businessContext), {
      businessGoalConfigured: Boolean(businessContext?.businessGoal?.trim()),
      northStarMetricConfigured: Boolean(businessContext?.northStarMetric?.trim()),
      metricCount: businessContext?.metrics?.length ?? 0,
    }))
    replaceTraceEvents(runId, trace)
  }

  const research = await runJsonAgent<ResearchAgentOutput>({
    agentName: "Research Agent",
    traceId: "research_agent",
    step: "Research Agent",
    runningMessage: "正在聚类用户反馈并提炼需求洞察。",
    successMessage: (output) => `识别出 ${output.demandClusters.length} 个需求主题。`,
    messages: buildResearchAgentMessages(feedbackItems, productHint, businessContext),
    parser: parseResearchAgentJson,
    expectedShape: multiAgentExpectedShapes.research,
    timeoutEnvName: "DEEPSEEK_RESEARCH_TIMEOUT_MS",
    fallbackTimeoutMs: 75_000,
    trace,
    runId,
  })

  const strategy = await runJsonAgent<StrategyAgentOutput>({
    agentName: "Strategy Agent",
    traceId: "strategy_agent",
    step: "Strategy Agent",
    runningMessage: "正在判断 MVP 范围并计算 RICE 优先级。",
    successMessage: (output) => `已生成 ${output.mvpScope.mustHave.length} 个 MVP 必做项和 ${output.ricePrioritization.length} 条 RICE 排序。`,
    messages: buildStrategyAgentMessages(research, businessContext),
    parser: parseStrategyAgentJson,
    expectedShape: multiAgentExpectedShapes.strategy,
    timeoutEnvName: "DEEPSEEK_STRATEGY_TIMEOUT_MS",
    fallbackTimeoutMs: 75_000,
    trace,
    runId,
  })

  const prd = await runJsonAgent<PrdAgentOutput>({
    agentName: "PRD Agent",
    traceId: "prd_agent",
    step: "PRD Agent",
    runningMessage: "正在把需求洞察和 MVP 范围写成 PRD 草稿。",
    successMessage: (output) => `PRD 草稿《${output.prd.title}》已生成。`,
    messages: buildPrdAgentMessages({ research, strategy }, businessContext),
    parser: parsePrdAgentJson,
    expectedShape: multiAgentExpectedShapes.prd,
    timeoutEnvName: "DEEPSEEK_PRD_TIMEOUT_MS",
    fallbackTimeoutMs: 75_000,
    trace,
    runId,
  })

  const delivery = await runJsonAgent<DeliveryAgentOutput>({
    agentName: "Delivery Agent",
    traceId: "delivery_agent",
    step: "Delivery Agent",
    runningMessage: "正在拆解研发任务并生成飞书评审摘要。",
    successMessage: (output) => `已拆解 ${output.engineeringTasks.length} 条研发任务草稿。`,
    messages: buildDeliveryAgentMessages({ research, strategy, prd }, businessContext),
    parser: parseDeliveryAgentJson,
    expectedShape: multiAgentExpectedShapes.delivery,
    timeoutEnvName: "DEEPSEEK_DELIVERY_TIMEOUT_MS",
    fallbackTimeoutMs: 75_000,
    trace,
    runId,
  })

  const context: MultiAgentContext = {
    research,
    strategy,
    prd,
    delivery,
  }
  const resultWithTrace = attachTrace(composeAgentResult(context), trace)
  replaceTraceEvents(runId, resultWithTrace.trace)

  return resultWithTrace
}

type RunJsonAgentInput<T> = {
  agentName: "Research Agent" | "Strategy Agent" | "PRD Agent" | "Delivery Agent"
  traceId: string
  step: string
  runningMessage: string
  successMessage: (output: T) => string
  messages: ChatMessage[]
  parser: (rawResponse: string) => T
  expectedShape: string
  timeoutEnvName: string
  fallbackTimeoutMs: number
  trace: TraceEvent[]
  runId: string
}

async function runJsonAgent<T>({
  agentName,
  traceId,
  step,
  runningMessage,
  successMessage,
  messages,
  parser,
  expectedShape,
  timeoutEnvName,
  fallbackTimeoutMs,
  trace,
  runId,
}: RunJsonAgentInput<T>): Promise<T> {
  replaceTraceEvent(trace, createTraceEvent(`${traceId}_running`, step, "running", runningMessage))
  replaceTraceEvents(runId, trace)

  try {
    const rawResponse = await createDeepSeekChatCompletion({
      messages,
      timeoutMs: getLlmTimeoutMs(timeoutEnvName, fallbackTimeoutMs),
    })
    const output = await parseWithSingleRetry(rawResponse, parser, agentName, expectedShape)

    replaceTraceEvent(trace, createTraceEvent(`${traceId}_completed`, step, "success", successMessage(output)))
    replaceTraceEvents(runId, trace)

    return output
  } catch (error) {
    replaceTraceEvent(trace, createTraceEvent(`${traceId}_failed`, step, "failed", toAgentRunErrorMessage(error)))
    replaceTraceEvents(runId, trace)

    if (error instanceof DeepSeekClientError) {
      throw new AgentRunError(mapDeepSeekCode(error.code), `${agentName} 执行失败：${error.message}`, fixForDeepSeekError(error.code), [...trace], {
        cause: error,
      })
    }

    if (error instanceof AgentResultValidationError) {
      throw new AgentRunError(
        "AGENT_RESULT_INVALID",
        `${agentName} 输出结构不合法：${error.message}`,
        "请重新运行分析；如果仍失败，可以暂时减少复杂反馈，或切换 Mock 模式演示。",
        [...trace],
        {
          cause: error,
        },
      )
    }

    throw new AgentRunError("LLM_REQUEST_FAILED", `${agentName} 执行发生未知错误。`, "请稍后重试，或进入 Mock 模式演示流程。", [...trace], {
      cause: error,
    })
  }
}

async function parseWithSingleRetry<T>(
  rawResponse: string,
  parser: (rawResponse: string) => T,
  agentName: "Research Agent" | "Strategy Agent" | "PRD Agent" | "Delivery Agent",
  expectedShape: string,
): Promise<T> {
  try {
    return parser(rawResponse)
  } catch (error) {
    if (!(error instanceof AgentResultValidationError)) {
      throw error
    }

    const repairedResponse = await createDeepSeekChatCompletion({
      messages: buildMultiAgentJsonRepairMessages(agentName, expectedShape, rawResponse, error.message),
      temperature: 0,
      timeoutMs: getLlmTimeoutMs("DEEPSEEK_REPAIR_TIMEOUT_MS", 60_000),
    })

    return parser(repairedResponse)
  }
}

function composeAgentResult(context: MultiAgentContext): AgentResult {
  return {
    productName: context.research.productName,
    summary: context.research.summary,
    demandClusters: context.research.demandClusters,
    mvpScope: context.strategy.mvpScope,
    ricePrioritization: context.strategy.ricePrioritization,
    prd: context.prd.prd,
    engineeringTasks: context.delivery.engineeringTasks,
    feishuReviewMessage: context.delivery.feishuReviewMessage,
    risks: context.research.risks,
    openQuestions: context.research.openQuestions,
    trace: [],
  }
}

function attachTrace(result: AgentResult, trace: TraceEvent[]): AgentResult {
  return assertAgentResult({
    ...result,
    trace: [
      ...trace.filter((event) => !event.id.endsWith("_running")),
      createTraceEvent("orchestrator_completed", "Orchestrator", "success", "多 Agent 产物已汇总为完整 AgentResult，并通过结构校验。", {
        clusterCount: result.demandClusters.length,
        taskCount: result.engineeringTasks.length,
      }),
      createTraceEvent("waiting_for_approval", "等待审批", "waiting_approval", "飞书评审摘要已准备好，等待用户确认发送。"),
      createTraceEvent("send_feishu", "发送飞书", "pending", "用户点击确认后才会发送飞书。"),
    ],
  })
}

function replaceTraceEvent(trace: TraceEvent[], event: TraceEvent) {
  const nextTrace = trace.filter((item) => item.id !== event.id && item.step !== event.step)
  nextTrace.push(event)
  trace.splice(0, trace.length, ...nextTrace)
}

function hasBusinessContext(businessContext: BusinessContext | undefined) {
  return Boolean(
    businessContext?.businessGoal?.trim() ||
      businessContext?.northStarMetric?.trim() ||
      businessContext?.metrics?.length,
  )
}

function formatBusinessContextTraceMessage(businessContext: BusinessContext | undefined) {
  if (!hasBusinessContext(businessContext)) {
    return "未提供业务目标或指标数据，本次分析仅基于用户反馈。"
  }

  const parts = [
    businessContext?.businessGoal?.trim() ? "业务目标已提供" : undefined,
    businessContext?.northStarMetric?.trim() ? "北极星指标已提供" : undefined,
    businessContext?.metrics?.length ? `已加载 ${businessContext.metrics.length} 条业务指标` : undefined,
  ].filter(Boolean)

  return `${parts.join("，")}。`
}

function validateInput(feedbackItems: FeedbackItem[], trace: TraceEvent[], runId: string) {
  if (!Array.isArray(feedbackItems) || feedbackItems.length === 0) {
    const failedTrace = [
      ...trace,
      createTraceEvent("validate_input", "校验输入", "failed", "feedbackItems 为空。"),
    ]
    replaceTraceEvents(runId, failedTrace)

    throw new AgentRunError(
      "INVALID_INPUT",
      "没有可分析的用户反馈。",
      "请先上传 CSV 或加载示例反馈。",
      failedTrace,
    )
  }

  if (feedbackItems.length < 3) {
    const failedTrace = [
      ...trace,
      createTraceEvent("validate_input", "校验输入", "failed", "反馈数量不足。"),
    ]
    replaceTraceEvents(runId, failedTrace)

    throw new AgentRunError(
      "INVALID_INPUT",
      `当前只有 ${feedbackItems.length} 条反馈，少于 3 条。`,
      "请补充更多反馈后再运行分析。",
      failedTrace,
    )
  }

  const invalidItem = feedbackItems.find((item) => !item.content?.trim())

  if (invalidItem) {
    const failedTrace = [
      ...trace,
      createTraceEvent("validate_input", "校验输入", "failed", "发现缺少 content 的反馈。"),
    ]
    replaceTraceEvents(runId, failedTrace)

    throw new AgentRunError(
      "INVALID_INPUT",
      `反馈 ${invalidItem.id || "未知 ID"} 缺少 content。`,
      "请补充反馈内容后重新上传 CSV。",
      failedTrace,
    )
  }
}

function mapDeepSeekCode(code: DeepSeekClientError["code"]): AgentRunError["code"] {
  if (code === "LLM_REQUEST_TIMEOUT") return "LLM_REQUEST_TIMEOUT"
  if (code === "LLM_RESPONSE_INVALID") return "LLM_RESPONSE_INVALID"
  return "LLM_REQUEST_FAILED"
}

function fixForDeepSeekError(code: DeepSeekClientError["code"]) {
  if (code === "LLM_API_KEY_MISSING") return "请在项目根目录创建 .env.local，并填写 DEEPSEEK_API_KEY。"
  if (code === "LLM_REQUEST_TIMEOUT") return "正式分析比意图路由更慢，请稍后重试；如果经常出现，请在 .env.local 调大 DEEPSEEK_ANALYSIS_TIMEOUT_MS，例如 180000。"
  if (code === "LLM_RESPONSE_INVALID") return "请重新运行分析；如果仍失败，可以切换到 Mock 模式演示。"
  return "请检查 DEEPSEEK_BASE_URL、DEEPSEEK_MODEL 和网络连接。"
}

function toAgentRunErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return "未知错误。"
}

function getLlmTimeoutMs(envName: string, fallback: number) {
  const rawValue = process.env[envName]?.trim()
  const compatibleRawValue =
    rawValue ||
    (envName !== "DEEPSEEK_ANALYSIS_TIMEOUT_MS" && envName !== "DEEPSEEK_REPAIR_TIMEOUT_MS"
      ? process.env.DEEPSEEK_ANALYSIS_TIMEOUT_MS?.trim()
      : undefined)
  if (!compatibleRawValue) return fallback

  const parsed = Number(compatibleRawValue)
  if (!Number.isFinite(parsed) || parsed < 1000) return fallback

  return parsed
}
