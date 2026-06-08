import { readFile } from "node:fs/promises"
import path from "node:path"
import { runAgent, AgentRunError } from "@/lib/agent/runAgent"
import { parseFeedbackCsv, CsvParseError } from "@/lib/csv/parseFeedbackCsv"
import {
  FeishuBitableError,
  type FeishuBitableOAuthTable,
  listFeishuBitableTables,
  listFeishuBitableTablesByAppToken,
  listFeishuBitableWorkspaceTables,
  readFeedbackFromFeishuBitable,
  readFeedbackFromFeishuBitableTableName,
  readFeedbackFromFeishuBitableWithToken,
  readFeedbackFromFeishuBitableUrl,
  readFeedbackFromFeishuWorkspaceTableName,
} from "@/lib/feishu/bitableFeedback"
import {
  createFeishuOAuthAuthorizeUrl,
  FeishuOAuthError,
  getDefaultFeishuBitableBaseSearchKey,
  getFeishuOAuthStatus,
  getValidFeishuUserAccessToken,
  listFeishuBitableBases,
  searchFeishuBitableBases,
} from "@/lib/feishu/oauth"
import {
  cleanMentionText,
  routeFeishuRuleCommand,
  type FeishuIntentCommand,
} from "@/lib/feishu/intentRouter"
import { runFeishuConversationAgent } from "@/lib/feishu/conversationAgent"
import { createFeishuApprovalRecord } from "@/lib/approvals/approvalStore"
import { FeishuCardError, replyFeishuApprovalCard } from "@/lib/feishu/sendApprovalCard"
import { listAgentRunSummaries, readSavedRunById, saveAgentRun } from "@/lib/runs/runStore"
import { listTapdProjects, TapdError } from "@/lib/tapd/createTapdWorkItems"
import type { AgentRun, DemandCluster, EngineeringTask, FeedbackItem, MvpScopeItem, RiceItem, SavedAgentRun } from "@/types/product"

const feishuBaseUrl = "https://open.feishu.cn/open-apis"
const receiveMessageEventType = "im.message.receive_v1"
const maxProcessedEventIds = 200
const sampleFeedbackPath = path.join(process.cwd(), "data", "sample-feedback.csv")

type FeishuEventBotErrorCode =
  | "FEISHU_EVENT_CONFIG_MISSING"
  | "FEISHU_EVENT_TOKEN_MISMATCH"
  | "FEISHU_EVENT_ENCRYPTED"
  | "FEISHU_EVENT_TOKEN_FAILED"
  | "FEISHU_EVENT_REPLY_FAILED"
  | "FEISHU_EVENT_TIMEOUT"
  | "FEISHU_EVENT_BAD_PAYLOAD"

export class FeishuEventBotError extends Error {
  code: FeishuEventBotErrorCode
  fix: string
  status: number

  constructor(code: FeishuEventBotErrorCode, message: string, fix: string, options?: { cause?: unknown; status?: number }) {
    super(message, options)
    this.name = "FeishuEventBotError"
    this.code = code
    this.fix = fix
    this.status = options?.status ?? 500
  }
}

export type FeishuEventCallbackResult =
  | {
      kind: "challenge"
      challenge: string
    }
  | {
      kind: "ignored" | "duplicate" | "replied"
      message: string
    }
  | {
      kind: "accepted"
      message: string
    }

type FeishuEventBotConfig = {
  appId: string
  appSecret: string
}

type TenantAccessTokenResponse = {
  code?: number
  msg?: string
  tenant_access_token?: string
  expire?: number
}

type FeishuReplyResponse = {
  code?: number
  msg?: string
}

type FeishuEventPayload = {
  schema?: string
  type?: string
  challenge?: string
  token?: string
  encrypt?: string
  uuid?: string
  header?: {
    event_id?: string
    event_type?: string
    token?: string
  }
  event?: {
    type?: string
    sender?: {
      sender_type?: string
    }
    message?: {
      message_id?: string
      message_type?: string
      content?: string
      chat_type?: string
      chat_id?: string
    }
  }
}

type ParsedCommand = FeishuIntentCommand

let cachedToken:
  | {
      value: string
      expiresAt: number
    }
  | undefined

const processedEventIds: string[] = []
const processedEventIdSet = new Set<string>()

export function getFeishuEventBotRuntimeConfig() {
  return {
    configured: Boolean(process.env.FEISHU_APP_ID?.trim() && process.env.FEISHU_APP_SECRET?.trim()),
    verificationTokenConfigured: Boolean(process.env.FEISHU_EVENT_VERIFICATION_TOKEN?.trim()),
  }
}

export async function handleFeishuEventCallback(input: unknown): Promise<FeishuEventCallbackResult> {
  if (!input || typeof input !== "object") {
    throw new FeishuEventBotError(
      "FEISHU_EVENT_BAD_PAYLOAD",
      "飞书事件回调内容不是有效 JSON。",
      "请确认飞书事件订阅的请求地址指向 /api/feishu/events，并使用 POST JSON。",
      { status: 400 },
    )
  }

  const payload = input as FeishuEventPayload

  if (payload.encrypt) {
    throw new FeishuEventBotError(
      "FEISHU_EVENT_ENCRYPTED",
      "当前 Demo 暂未实现飞书事件加密解密。",
      "请在飞书事件订阅配置中先关闭 Encrypt Key；如果必须开启，需要后续实现解密逻辑。",
      { status: 400 },
    )
  }

  verifyEventToken(payload)

  if (payload.type === "url_verification" && payload.challenge) {
    return {
      kind: "challenge",
      challenge: payload.challenge,
    }
  }

  const eventType = payload.header?.event_type || payload.event?.type
  if (eventType !== receiveMessageEventType) {
    return {
      kind: "ignored",
      message: `忽略非接收消息事件：${eventType || "unknown"}。`,
    }
  }

  const eventId = payload.header?.event_id || payload.uuid || payload.event?.message?.message_id
  if (eventId && hasProcessedEvent(eventId)) {
    return {
      kind: "duplicate",
      message: "重复事件已忽略。",
    }
  }

  const message = payload.event?.message
  if (!message?.message_id) {
    throw new FeishuEventBotError(
      "FEISHU_EVENT_BAD_PAYLOAD",
      "飞书消息事件缺少 message_id。",
      "请确认订阅的是“接收消息 v2.0”事件，并检查飞书回调内容。",
      { status: 400 },
    )
  }

  if (message.message_type !== "text") {
    await replyToMessage(message.message_id, "我目前只支持文本消息。你可以直接用一句话告诉我要分析、查询或讨论什么。")
    if (eventId) {
      rememberProcessedEvent(eventId)
    }
    return {
      kind: "replied",
      message: "已回复非文本消息提示。",
    }
  }

  const text = extractTextContent(message.content)
  const cleanedText = cleanMentionText(text)

  if (!cleanedText) {
    await replyToMessage(message.message_id, "我在。你可以直接告诉我要分析哪张表，或者继续讨论上一次 PRD / TAPD 任务。")
    if (eventId) {
      rememberProcessedEvent(eventId)
    }
    return {
      kind: "replied",
      message: "已回复空消息提示。",
    }
  }

  if (eventId) {
    rememberProcessedEvent(eventId)
  }
  void runConversationCommand(message.message_id, text, {
    sessionKey: message.chat_id || message.message_id,
    highRiskOperationRequested: isHighRiskOperationRequest(cleanedText),
  })

  return {
    kind: "accepted",
    message: "已交给 conversationAgent 处理。",
  }
}

function verifyEventToken(payload: FeishuEventPayload) {
  const expectedToken = process.env.FEISHU_EVENT_VERIFICATION_TOKEN?.trim()
  if (!expectedToken) return

  const actualToken = payload.header?.token || payload.token
  if (actualToken !== expectedToken) {
    throw new FeishuEventBotError(
      "FEISHU_EVENT_TOKEN_MISMATCH",
      "飞书事件 Verification Token 校验失败。",
      "请确认 .env.local 中的 FEISHU_EVENT_VERIFICATION_TOKEN 与飞书开放平台事件订阅页面一致。",
      { status: 401 },
    )
  }
}

async function replyToMessage(messageId: string, text: string) {
  const config = getFeishuEventBotConfig()
  const token = await getTenantAccessToken(config)

  const payload = await fetchJsonWithTimeout<FeishuReplyResponse>(
    `${feishuBaseUrl}/im/v1/messages/${encodeURIComponent(messageId)}/reply`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        msg_type: "text",
        content: JSON.stringify({
          text,
        }),
      }),
    },
    "FEISHU_EVENT_REPLY_FAILED",
    "回复飞书消息失败。",
  )

  if (payload.code !== 0) {
    throw new FeishuEventBotError(
      "FEISHU_EVENT_REPLY_FAILED",
      formatFeishuApiMessage("回复飞书消息失败。", payload),
      "请确认应用已开启机器人能力、已加入群聊，并拥有回复消息所需权限。",
    )
  }
}

async function runAnalysisCommand(messageId: string, command: Extract<ParsedCommand, { type: "analyze_sample" | "analyze_bitable" }>) {
  try {
    await replyToMessage(messageId, "收到，PMOpsAgent 正在读取反馈并生成分析摘要。完成后会在群里发送审批卡片，复杂编辑仍可回网页历史记录。")

    const loaded = await loadFeedbackForAnalysis(command)
    const run = await runAgent({
      feedbackItems: loaded.feedbackItems,
      productHint: "由飞书群聊 @机器人触发分析，请生成适合产品评审的简洁结论。",
    })
    const savedRun = await saveAgentRun({
      feedbackItems: loaded.feedbackItems,
      run,
      sourceLabel: loaded.sourceLabel,
    })

    try {
      const card = await replyFeishuApprovalCard({
        messageId,
        savedRun,
      })
      await createFeishuApprovalRecord({
        runId: savedRun.id,
        cardMessageId: card.messageId,
        sourceLabel: loaded.sourceLabel,
      })
    } catch (cardError) {
      await replyToMessage(messageId, buildAnalysisReply(run, savedRun, loaded.feedbackItems, loaded.sourceLabel, cardError))
    }
  } catch (error) {
    try {
      await replyToMessage(messageId, buildAnalysisErrorReply(error))
    } catch {
      // If the app lacks message sending permission, the debug route will still record the original callback.
    }
  }
}

async function runTapdProjectListCommand(messageId: string) {
  try {
    const projects = await listTapdProjects()
    await replyToMessage(messageId, buildTapdProjectListReply(projects))
  } catch (error) {
    try {
      await replyToMessage(messageId, buildTapdToolErrorReply(error))
    } catch {
      // If message sending permission is missing, the callback debug file still captures the event.
    }
  }
}

async function runDecisionDiscussionCommand(messageId: string, query: string) {
  try {
    const summaries = await listAgentRunSummaries()

    if (summaries.length === 0) {
      await replyToMessage(messageId, [
        "我还没有可讨论的分析记录。",
        "请先发送：@PMOpsAgent 分析 示例反馈，或 @PMOpsAgent 分析 Base名/表名",
        "完成分析后，你可以继续追问某个 PRD、MVP 或 TAPD 任务判断的依据。",
      ].join("\n"))
      return
    }

    const savedRun = await readSavedRunById(summaries[0].id)
    await replyToMessage(messageId, buildDecisionDiscussionReply(savedRun, query))
  } catch (error) {
    try {
      await replyToMessage(messageId, buildAnalysisErrorReply(error))
    } catch {
      // If message sending permission is missing, the callback debug file still captures the event.
    }
  }
}

async function runConversationCommand(messageId: string, text: string, options?: { sessionKey?: string; highRiskOperationRequested?: boolean }) {
  try {
    const reply = await runFeishuConversationAgent(text, {
      replyMessageId: messageId,
      sessionKey: options?.sessionKey,
      highRiskOperationRequested: options?.highRiskOperationRequested,
    })
    await replyToMessage(messageId, reply)
  } catch (error) {
    try {
      await replyToMessage(messageId, buildConversationErrorReply(error))
    } catch {
      // If message sending permission is missing, the callback debug file still captures the event.
    }
  }
}

function isHighRiskOperationRequest(text: string) {
  const compact = text.replace(/\s+/g, "").toLowerCase()
  const hasWriteVerb =
    compact.includes("创建") ||
    compact.includes("新建") ||
    compact.includes("修改") ||
    compact.includes("更新") ||
    compact.includes("删除") ||
    compact.includes("通过") ||
    compact.includes("审批") ||
    compact.includes("发送") ||
    compact.includes("同步") ||
    compact.includes("写入") ||
    compact.includes("改成") ||
    compact.includes("调整为")
  const hasExternalObject =
    compact.includes("prd") ||
    compact.includes("tapd") ||
    compact.includes("飞书文档") ||
    compact.includes("文档") ||
    compact.includes("任务") ||
    compact.includes("卡片") ||
    compact.includes("群") ||
    compact.includes("多维表格")

  return hasWriteVerb && hasExternalObject
}

async function runListTablesCommand(messageId: string) {
  try {
    const tables = await listFeishuBitableTables()
    await replyToMessage(messageId, buildTableListReply(tables))
  } catch (error) {
    try {
      await replyToMessage(messageId, buildAnalysisErrorReply(error))
    } catch {
      // If message sending permission is missing, there is nothing else to do inside the callback.
    }
  }
}

async function runListWorkspaceTablesCommand(messageId: string) {
  try {
    const tables = await listFeishuBitableWorkspaceTables()
    await replyToMessage(messageId, buildWorkspaceTableListReply(tables))
  } catch (error) {
    try {
      await replyToMessage(messageId, buildAnalysisErrorReply(error))
    } catch {
      // If message sending permission is missing, there is nothing else to do inside the callback.
    }
  }
}

async function runOAuthStatusCommand(messageId: string) {
  try {
    const status = await getFeishuOAuthStatus()
    await replyToMessage(messageId, buildOAuthStatusReply(status))
  } catch (error) {
    try {
      await replyToMessage(messageId, buildAnalysisErrorReply(error))
    } catch {
      // If message sending permission is missing, there is nothing else to do inside the callback.
    }
  }
}

async function runOAuthAuthorizeCommand(messageId: string) {
  try {
    const authorizeUrl = await createFeishuOAuthAuthorizeUrl()
    await replyToMessage(messageId, ["请打开下面的链接完成飞书授权：", authorizeUrl, "", "授权成功后，回到群里发送：@PMOpsAgent 列出我的 Base"].join("\n"))
  } catch (error) {
    try {
      await replyToMessage(messageId, buildAnalysisErrorReply(error))
    } catch {
      // If message sending permission is missing, there is nothing else to do inside the callback.
    }
  }
}

function buildOAuthStatusReply(status: Awaited<ReturnType<typeof getFeishuOAuthStatus>>) {
  if (!status.authorized) {
    return [
      "当前还没有保存飞书 OAuth 用户授权。",
      "请发送：@PMOpsAgent 授权链接",
      "打开链接并完成授权后，再发送：@PMOpsAgent 授权状态",
    ].join("\n")
  }

  return [
    "当前飞书 OAuth 授权状态：",
    `授权时间：${status.updatedAt || "未知"}`,
    `已获得 scope：${status.scope || "飞书未返回 scope"}`,
    status.missingScopes.length > 0 ? `缺少 scope：${status.missingScopes.join("、")}` : "必要 scope：已齐全",
    status.missingScopes.length > 0 ? "处理方式：请在飞书开放平台把缺少的权限以“用户身份权限”申请并发布审批，然后重新发送“@PMOpsAgent 授权链接”完成授权。" : "可以继续发送：@PMOpsAgent 列出我的 Base",
  ].join("\n")
}

async function runOAuthBaseSearchCommand(messageId: string, command: Extract<ParsedCommand, { type: "search_oauth_bases" | "list_oauth_bases" }>) {
  try {
    if (command.type === "list_oauth_bases") {
      const bases = await listFeishuBitableBases()
      await replyToMessage(messageId, buildOAuthBaseListReply(bases))
      return
    }

    const bases = await searchFeishuBitableBases(command.query)
    await replyToMessage(messageId, buildOAuthBaseSearchReply(bases, command.query))
  } catch (error) {
    try {
      await replyToMessage(messageId, buildAnalysisErrorReply(error))
    } catch {
      // If message sending permission is missing, there is nothing else to do inside the callback.
    }
  }
}

async function loadFeedbackForAnalysis(command: Extract<ParsedCommand, { type: "analyze_sample" | "analyze_bitable" }>) {
  if (command.type === "analyze_sample") {
    const csvText = await readFile(sampleFeedbackPath, "utf8")
    return {
      feedbackItems: parseFeedbackCsv(csvText),
      sourceLabel: "飞书群聊：示例反馈",
    }
  }

  if (command.url) {
    return readFeedbackFromFeishuBitableUrl(command.url)
  }

  if (command.tableName) {
    let oauthError: FeishuOAuthError | undefined

    try {
      return await readFeedbackFromOAuthDiscoveredTable(command.tableName)
    } catch (error) {
      if (!(error instanceof FeishuOAuthError)) {
        throw error
      }

      oauthError = error
    }

    try {
      return await readFeedbackFromFeishuWorkspaceTableName(command.tableName)
    } catch (error) {
      if (error instanceof FeishuBitableError && error.code === "FEISHU_BITABLE_WORKSPACE_INDEX_MISSING") {
        try {
          return await readFeedbackFromFeishuBitableTableName(command.tableName)
        } catch (fallbackError) {
          if (oauthError) {
            throw oauthError
          }

          throw fallbackError
        }
      }

      throw error
    }
  }

  return {
    feedbackItems: await readFeedbackFromFeishuBitable(),
    sourceLabel: "飞书群聊：已配置多维表格",
  }
}

async function readFeedbackFromOAuthDiscoveredTable(tableName: string) {
  const token = await getValidFeishuUserAccessToken()
  const shouldMatchBaseAndTable = tableName.includes("/")
  const listedBases = await listFeishuBitableBases()
  const matchedBases = shouldMatchBaseAndTable ? listedBases : matchOAuthBases(listedBases, tableName)
  const bases = matchedBases.length > 0 ? matchedBases : await searchFeishuBitableBases(extractBaseQuery(tableName))
  const tables = await listOAuthTablesFromBases(bases, token)
  const table = matchOAuthTable(tables, tableName, {
    allowSingleTableFromSingleBase: !shouldMatchBaseAndTable && matchedBases.length === 1,
  })

  return readFeedbackFromFeishuBitableWithToken({
    appToken: table.appToken,
    tableId: table.tableId,
    token,
    sourceLabel: `飞书 OAuth ${table.baseName}/${table.name}`,
  })
}

function buildTableListReply(tables: Awaited<ReturnType<typeof listFeishuBitableTables>>) {
  if (tables.length === 0) {
    return "当前 Base 下没有读取到数据表。请确认 FEISHU_BITABLE_APP_TOKEN 是否正确，并且应用已被添加为该 Base 的协作者或文档应用。"
  }

  return [
    "当前 Base 下可分析的数据表：",
    ...tables.slice(0, 20).map((table, index) => `${index + 1}. ${table.name}`),
    tables.length > 20 ? `还有 ${tables.length - 20} 个未展示。` : "",
    "",
    "使用方式：@PMOpsAgent 分析 表名",
    "例如：@PMOpsAgent 分析 用户反馈",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildWorkspaceTableListReply(tables: Awaited<ReturnType<typeof listFeishuBitableWorkspaceTables>>) {
  if (tables.length === 0) {
    return "当前空间索引下没有读取到数据表。请确认 FEISHU_BITABLE_WORKSPACE_BASES 中的 Base 已授权给应用。"
  }

  return [
    "当前空间索引下可分析的数据表：",
    ...tables.slice(0, 30).map((table, index) => `${index + 1}. ${table.baseName}/${table.name}`),
    tables.length > 30 ? `还有 ${tables.length - 30} 个未展示。` : "",
    "",
    "使用方式：@PMOpsAgent 分析 表名",
    "如果多个 Base 里有同名表，请使用：@PMOpsAgent 分析 Base名/表名",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildOAuthBaseSearchReply(bases: Awaited<ReturnType<typeof searchFeishuBitableBases>>, query: string | undefined) {
  const searchKey = query?.trim() || getDefaultFeishuBitableBaseSearchKey()

  if (bases.length === 0) {
    return [
      `没有搜索到名称或内容匹配“${searchKey}”的多维表格 Base。`,
      "这条指令底层使用飞书云文档搜索，不是全量枚举 workspace 下所有 Base。",
      "请换一个更接近 Base 标题的关键词，例如：@PMOpsAgent 搜索 Base 简历",
      "也请确认授权用户本人能打开目标 Base。",
    ].join("\n")
  }

  return [
    `按关键词“${searchKey}”搜索到这些 Base：`,
    ...bases.slice(0, 20).map(formatOAuthBaseLine),
    bases.length > 20 ? `还有 ${bases.length - 20} 个未展示。` : "",
    "",
    "键名说明：Base 的键名就是 app_token，可用于 API 定位这个多维表格。",
    "日常使用方式：@PMOpsAgent 分析 Base名/表名",
    "例如：@PMOpsAgent 分析 简历优化产品/用户反馈",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildOAuthBaseListReply(bases: Awaited<ReturnType<typeof listFeishuBitableBases>>) {
  if (bases.length === 0) {
    return [
      "没有在授权用户的“我的空间”里找到多维表格 Base。",
      "请确认目标 Base 位于授权用户可访问的云空间或共享空间中，并且应用已获得云空间读取权限。",
      "也可以用搜索入口试试：@PMOpsAgent 搜索 Base 关键词",
    ].join("\n")
  }

  return [
    "授权用户可访问的 Base 与键名：",
    ...bases.slice(0, 30).map(formatOAuthBaseLine),
    bases.length > 30 ? `还有 ${bases.length - 30} 个未展示。` : "",
    "",
    "键名说明：Base 的键名就是 app_token，可用于 API 定位这个多维表格。",
    "日常使用方式：@PMOpsAgent 分析 Base名/表名",
    "例如：@PMOpsAgent 分析 简历优化产品/用户反馈",
  ]
    .filter(Boolean)
    .join("\n")
}

function formatOAuthBaseLine(base: Awaited<ReturnType<typeof listFeishuBitableBases>>[number], index: number) {
  return `${index + 1}. ${base.title}\n   app_token：${base.appToken}${base.url ? `\n   链接：${base.url}` : ""}`
}

function buildAnalysisReply(run: AgentRun, savedRun: SavedAgentRun, feedbackItems: FeedbackItem[], sourceLabel: string, cardError?: unknown) {
  const result = run.result
  const topClusters = result.demandClusters
    .slice(0, 3)
    .map((cluster, index) => `${index + 1}. ${cluster.title}：${cluster.userPain}（证据：${cluster.evidenceFeedbackIds.join("、")}）`)
  const mustHave = result.mvpScope.mustHave.slice(0, 4).map((item, index) => `${index + 1}. ${formatScopeItem(item)}`)
  const topTasks = result.engineeringTasks.slice(0, 3).map((task, index) => `${index + 1}. [${task.priority}] ${task.title}`)

  return [
    `PMOpsAgent 已完成分析（${run.mode === "mock" ? "Mock 模式" : "LLM 模式"}）。`,
    `来源：${sourceLabel}`,
    `反馈数量：${feedbackItems.length} 条`,
    `历史记录 ID：${savedRun.id}`,
    "",
    `摘要：${result.summary}`,
    "",
    "Top 需求主题：",
    ...(topClusters.length ? topClusters : ["暂无"]),
    "",
    "MVP 必做：",
    ...(mustHave.length ? mustHave : ["暂无"]),
    "",
    "研发任务预览：",
    ...(topTasks.length ? topTasks : ["暂无"]),
    "",
    cardError ? `审批卡片发送失败：${cardError instanceof Error ? cardError.message : "未知错误"}` : undefined,
    cardError instanceof FeishuCardError ? `修复建议：${cardError.fix}` : undefined,
    cardError ? "" : undefined,
    "下一步：审批卡片不可用时，请回到网页 Demo 的“历史运行”里打开这条记录，确认 PRD 与任务后再创建飞书 PRD、TAPD 或发送评审摘要。",
  ].join("\n")
}

function buildTapdProjectListReply(projects: Awaited<ReturnType<typeof listTapdProjects>>) {
  if (projects.length === 0) {
    return [
      "当前 TAPD API 账号没有查询到可访问的项目。",
      "请确认 TAPD_COMPANY_ID 是公司 ID，且 TAPD_API_USER 对这个公司有项目查看权限。",
    ].join("\n")
  }

  return [
    "当前 TAPD API 账号可访问的项目：",
    ...projects.slice(0, 30).map((project, index) => {
      const details = [
        `ID：${project.id}`,
        project.status ? `状态：${project.status}` : undefined,
        typeof project.memberCount === "number" ? `成员：${project.memberCount}` : undefined,
      ]
        .filter(Boolean)
        .join("，")

      return `${index + 1}. ${project.name}${details ? `（${details}）` : ""}`
    }),
    projects.length > 30 ? `还有 ${projects.length - 30} 个未展示。` : "",
    "",
    "使用方式：在网页或飞书审批卡片创建 TAPD 时，把目标项目的 ID 填到项目 ID / workspace_id。",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildTapdToolErrorReply(error: unknown) {
  if (error instanceof TapdError) {
    return [`PMOpsAgent 查询 TAPD 项目失败：${error.message}`, `修复建议：${error.fix}`].join("\n")
  }

  if (error instanceof Error) {
    return `PMOpsAgent 查询 TAPD 项目失败：${error.message}`
  }

  return "PMOpsAgent 查询 TAPD 项目失败：发生未知错误。请检查 TAPD API 账号、公司 ID 和网络连接。"
}

function buildDecisionDiscussionReply(savedRun: SavedAgentRun, query: string) {
  const result = savedRun.run.result
  const taskMatch = findBestTaskMatch(result.engineeringTasks, query)
  const riceMatch = findBestRiceMatch(result.ricePrioritization, query)

  if (!taskMatch && !riceMatch) {
    return [
      "我理解你是在讨论上一次分析里的判断依据，但我没有稳定定位到具体任务或功能。",
      `最近一次分析：${result.productName}（${savedRun.sourceLabel || "未知来源"}）`,
      "",
      "你可以这样追问，我会基于证据讨论，而不是直接修改：",
      ...result.engineeringTasks.slice(0, 5).map((task, index) => `${index + 1}. 为什么“${task.title}”是 ${task.priority}？`),
    ].join("\n")
  }

  const task = taskMatch?.item
  const rice = pickRelatedRice(task, riceMatch?.item, result.ricePrioritization)

  if (isReevaluationRequest(query)) {
    return buildDecisionReevaluationReply(savedRun, query, task, rice)
  }

  const evidenceIds = uniqueStrings([
    ...(rice?.evidenceFeedbackIds ?? []),
    ...findRelatedClusters(query, result.demandClusters, rice).flatMap((cluster) => cluster.evidenceFeedbackIds),
  ]).slice(0, 6)
  const evidenceLines = buildEvidenceLines(savedRun.feedbackItems, result.demandClusters, evidenceIds)

  return [
    "这个问题值得看一下。我先按上一次分析里的证据解释为什么暂时放在这个优先级：",
    "",
    task ? `讨论对象：${task.type}「${task.title}」` : rice ? `讨论对象：功能「${rice.feature}」` : undefined,
    task ? `当前任务优先级：${task.priority}` : undefined,
    task?.description ? `任务描述：${task.description}` : undefined,
    "",
    rice ? "RICE / 优先级依据：" : undefined,
    rice ? `功能：${rice.feature}` : undefined,
    rice ? `当前判断：${rice.priority}，得分 ${rice.score}` : undefined,
    rice ? `计算：Reach ${rice.reach} × Impact ${rice.impact} × Confidence ${rice.confidence} / Effort ${rice.effort}` : undefined,
    rice?.rationale ? `理由：${rice.rationale}` : undefined,
    rice?.formula ? `公式：${rice.formula}` : undefined,
    "",
    evidenceLines.length ? "相关用户证据：" : "相关用户证据：这条判断在当前记录里缺少直接 feedback id，置信度应谨慎看待。",
    ...evidenceLines,
    "",
    "我的判断方式：",
    "1. 如果它阻塞核心用户完成主流程，或影响范围大、业务损失明确，才更接近 P0。",
    "2. 如果它重要但不阻塞核心闭环，通常是 P1。",
    "3. 如果只是体验优化、补充能力或证据不足，通常是 P2。",
    "",
    "如果你有更多背景，我可以重新评估。最有帮助的信息包括：影响了多少用户、是否阻塞核心流程、是否影响收入/留存、是否有客户承诺或上线依赖。信息补齐后，我会先给出调整建议和修改差异，再由你确认是否更新 PRD / TAPD。",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n")
}

function buildDecisionReevaluationReply(savedRun: SavedAgentRun, query: string, task: EngineeringTask | undefined, rice: RiceItem | undefined) {
  const requestedPriority = extractRequestedPriority(query)
  const currentPriority = task?.priority || rice?.priority
  const evidenceIds = uniqueStrings([
    ...(rice?.evidenceFeedbackIds ?? []),
    ...findRelatedClusters(query, savedRun.run.result.demandClusters, rice).flatMap((cluster) => cluster.evidenceFeedbackIds),
  ]).slice(0, 5)
  const evidenceLines = buildEvidenceLines(savedRun.feedbackItems, savedRun.run.result.demandClusters, evidenceIds)
  const impactSignals = collectImpactSignals(query)
  const shouldRaiseToP0 = requestedPriority === "P0" && hasStrongP0Signals(query)
  const targetPriority = shouldRaiseToP0 ? "P0" : currentPriority

  return [
    "这条补充会影响我的判断。原先放在 P1，主要是因为它的价值明确，但还没有证明会阻塞核心销售流程；现在你补充的信息把它从“效率优化”推向了“销售管理闭环的关键环节”。",
    "",
    task ? `讨论对象：${task.type}「${task.title}」` : rice ? `讨论对象：功能「${rice.feature}」` : undefined,
    currentPriority ? `原判断：${currentPriority}` : undefined,
    requestedPriority ? `你的建议：${requestedPriority}` : undefined,
    targetPriority && targetPriority !== currentPriority ? `我的重新评估：建议调整为 ${targetPriority}` : `我的重新评估：暂时维持 ${currentPriority || "原优先级"}，但需要继续补证据。`,
    "",
    "我采纳的新信息：",
    ...(impactSignals.length ? impactSignals.map((item) => `- ${item}`) : ["- 你补充了新的业务背景，但我还需要更明确的影响范围或业务损失。"]),
    "",
    rice ? "对 RICE 的影响：" : undefined,
    rice ? `- Reach：原来是 ${rice.reach}。如果“每天 12 个销售都受影响”是稳定日常场景，Reach 可以维持或略上调。` : undefined,
    rice ? `- Impact：原来是 ${rice.impact}。因为它影响每日复盘、高意向客户分配和成交转化，我会把 Impact 上调。` : undefined,
    rice ? `- Effort：原来是 ${rice.effort}。集成飞书消息 API 和 NLP 摘要复杂度仍然高，所以 Effort 暂时不下调。` : undefined,
    "",
    evidenceLines.length ? "原始反馈里能支撑这个调整的证据：" : "原始反馈里直接证据还不够强：",
    ...evidenceLines,
    "",
    targetPriority === "P0"
      ? "我的建议：可以把它从 P1 调整到 P0，但 PRD 里要把 P0 理由写清楚：它不是单纯省时间，而是影响每日复盘、客户优先级分配和销售转化。如果只是“节省整理时间”，它仍然更像 P1。"
      : "我的建议：先不要直接改成 P0。可以再补一条量化证据，比如当前因为没有摘要导致多少高意向客户漏跟、主管复盘耗时多久、成交转化损失是否可观察。",
    "",
    "建议修改差异：",
    task && targetPriority && targetPriority !== currentPriority ? `- TAPD 任务优先级：${currentPriority} -> ${targetPriority}` : "- TAPD 任务优先级：暂不修改",
    rice && targetPriority && targetPriority !== rice.priority ? `- RICE 优先级：${rice.priority} -> ${targetPriority}` : "- RICE 优先级：暂不修改",
    "- PRD 说明：补充“每日复盘”和“高意向客户分配”作为核心业务场景",
    "",
    "如果你确认这个判断，我下一步可以基于这次讨论生成一版 PRD/TAPD 修改草案，再让你确认是否应用。",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n")
}

function formatScopeItem(item: MvpScopeItem | string) {
  if (typeof item === "string") return item
  return item.reason ? `${item.feature}：${item.reason}` : item.feature
}

function buildAnalysisErrorReply(error: unknown) {
  if (error instanceof AgentRunError || error instanceof FeishuBitableError || error instanceof FeishuOAuthError || error instanceof CsvParseError || error instanceof TapdError) {
    const fix = "fix" in error ? error.fix : undefined
    return [`PMOpsAgent 分析失败：${error.message}`, fix ? `修复建议：${fix}` : undefined].filter(Boolean).join("\n")
  }

  if (error instanceof Error) {
    return `PMOpsAgent 分析失败：${error.message}`
  }

  return "PMOpsAgent 分析失败：发生未知错误。请回网页 Demo 使用示例反馈或 CSV 入口重试。"
}

async function listOAuthTablesFromBases(bases: Awaited<ReturnType<typeof searchFeishuBitableBases>>, token: string): Promise<FeishuBitableOAuthTable[]> {
  const allTables: FeishuBitableOAuthTable[] = []

  for (const base of bases.slice(0, 20)) {
    const tables = await listFeishuBitableTablesByAppToken(base.appToken, token)
    allTables.push(
      ...tables.map((table) => ({
        ...table,
        appToken: base.appToken,
        baseName: base.title,
        baseUrl: base.url,
      })),
    )
  }

  return allTables
}

function matchOAuthBases(bases: Awaited<ReturnType<typeof listFeishuBitableBases>>, queryText: string) {
  const query = normalizeCommandName(extractBaseQuery(queryText))
  if (!query) return []

  const exactMatches = bases.filter((base) => normalizeCommandName(base.title) === query)
  if (exactMatches.length > 0) return exactMatches

  return bases.filter((base) => {
    const baseName = normalizeCommandName(base.title)
    return baseName.includes(query) || query.includes(baseName)
  })
}

function matchOAuthTable(tables: FeishuBitableOAuthTable[], tableName: string, options?: { allowSingleTableFromSingleBase?: boolean }) {
  const query = normalizeCommandName(tableName)

  if (!query) {
    throw new FeishuBitableError("FEISHU_BITABLE_TABLE_NOT_FOUND", "没有识别到要分析的数据表名称。", "请发送“@PMOpsAgent 搜索 Base 关键词”，确认 Base 名和表名后再分析。")
  }

  const fullName = (table: FeishuBitableOAuthTable) => normalizeCommandName(`${table.baseName}/${table.name}`)
  const exactMatches = tables.filter((table) => normalizeCommandName(table.name) === query || fullName(table) === query)
  if (exactMatches.length === 1) return exactMatches[0]

  if (options?.allowSingleTableFromSingleBase && tables.length === 1) {
    return tables[0]
  }

  if (options?.allowSingleTableFromSingleBase && tables.length > 1) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS",
      `搜索“${tableName}”只命中了一个 Base，但这个 Base 下有多个数据表。`,
      `请使用“Base名/表名”重新发送。候选：${tables.map((table) => `${table.baseName}/${table.name}`).join("、")}`,
    )
  }

  const baseNameMatches = tables.filter((table) => normalizeCommandName(table.baseName) === query)
  if (baseNameMatches.length === 1) return baseNameMatches[0]

  if (baseNameMatches.length > 1) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS",
      `“${tableName}”是一个 Base 名，但这个 Base 下有多个数据表。`,
      `请使用“Base名/表名”重新发送。候选：${baseNameMatches.map((table) => `${table.baseName}/${table.name}`).join("、")}`,
    )
  }

  const fuzzyMatches = tables.filter((table) => {
    const tableOnlyName = normalizeCommandName(table.name)
    const tableFullName = fullName(table)
    return tableOnlyName.includes(query) || tableFullName.includes(query) || query.includes(tableOnlyName)
  })
  const matches = exactMatches.length > 0 ? exactMatches : fuzzyMatches

  if (matches.length === 1) return matches[0]

  if (matches.length > 1) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS",
      `找到多个名称接近“${tableName}”的数据表。`,
      `请使用“Base名/表名”重新发送。候选：${matches.map((table) => `${table.baseName}/${table.name}`).join("、")}`,
    )
  }

  throw new FeishuBitableError(
    "FEISHU_BITABLE_TABLE_NOT_FOUND",
    `没有找到名为“${tableName}”的数据表。`,
    "请先发送“@PMOpsAgent 搜索 Base 关键词”或“@PMOpsAgent 列出我的 Base”，确认 Base 名和表名。",
  )
}

function extractBaseQuery(tableName: string) {
  const [baseName] = tableName.split("/")
  return baseName?.trim() || tableName.trim()
}

function normalizeCommandName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "")
}

function findBestMatch<T>(items: T[], query: string, toText: (item: T) => string): { item: T; score: number } | undefined {
  const scored = items
    .map((item) => ({
      item,
      score: scoreTextMatch(query, toText(item)),
    }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  return best && best.score > 0 ? best : undefined
}

function findBestTaskMatch(tasks: EngineeringTask[], query: string) {
  const explicitName = extractExplicitDecisionTarget(query)
  const matchQuery = explicitName || query

  return findBestMatch(
    tasks,
    matchQuery,
    (task) => [task.title, task.description, task.priority, task.type, ...task.acceptanceCriteria, ...(task.dependsOn ?? [])].join(" "),
  )
}

function findBestRiceMatch(riceItems: RiceItem[], query: string) {
  const explicitName = extractExplicitDecisionTarget(query)
  const matchQuery = explicitName || query

  return findBestMatch(
    riceItems,
    matchQuery,
    (item) => [item.feature, item.priority, item.rationale, item.formula, ...(item.evidenceFeedbackIds ?? [])].filter(Boolean).join(" "),
  )
}

function scoreTextMatch(query: string, candidate: string) {
  const normalizedQuery = normalizeCommandName(cleanMentionText(query))
  const normalizedCandidate = normalizeCommandName(candidate)

  if (!normalizedQuery || !normalizedCandidate) return 0
  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) return normalizedQuery.length + 20

  const queryTokens = splitSearchTokens(normalizedQuery)
  const candidateTokens = splitSearchTokens(normalizedCandidate)
  const tokenScore = queryTokens.reduce((score, token) => score + (token.length > 1 && normalizedCandidate.includes(token) ? token.length * 2 : 0), 0)
  const charScore = Array.from(new Set(normalizedQuery.split(""))).reduce((score, char) => score + (normalizedCandidate.includes(char) ? 1 : 0), 0)
  const candidateTokenScore = candidateTokens.reduce((score, token) => score + (token.length > 1 && normalizedQuery.includes(token) ? token.length : 0), 0)

  return tokenScore + charScore + candidateTokenScore
}

function extractExplicitDecisionTarget(query: string) {
  const cleaned = cleanMentionText(query)
  const patterns = [
    /(?:研发任务中|任务中|任务|功能|需求|PRD中|prd中)[，,\s]*([^，。！？?]+?)(?:的优先级|为什么|为啥|依据|理由|是p[012]|只有p[012]|调整为p[012]|改成p[012])/i,
    /([^，。！？?]+?)(?:的优先级)(?:为什么|为啥|是|只有|太低|太高)/i,
    /(?:把|将)([^，。！？?]+?)(?:从p[012]|调整为p[012]|改成p[012])/i,
  ]

  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return value
  }

  return undefined
}

function splitSearchTokens(value: string) {
  return value
    .split(/[，。！？、,.!?;；:：/\\|()[\]{}<>"'`~\-_+=\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function pickRelatedRice(task: EngineeringTask | undefined, matchedRice: RiceItem | undefined, riceItems: RiceItem[]) {
  if (!task) return matchedRice

  const taskMatchedRice = findBestMatch(riceItems, `${task.title} ${task.description}`, (item) => `${item.feature} ${item.rationale}`)
  if (!matchedRice) return taskMatchedRice?.item
  if (!taskMatchedRice) return matchedRice

  return taskMatchedRice.score >= scoreTextMatch(task.title, matchedRice.feature) ? taskMatchedRice.item : matchedRice
}

function isReevaluationRequest(query: string) {
  const compact = normalizeCommandName(query)

  return (
    compact.includes("补充") ||
    compact.includes("重新评估") ||
    compact.includes("调整为") ||
    compact.includes("改成") ||
    compact.includes("升为") ||
    compact.includes("升到") ||
    compact.includes("应该从") ||
    compact.includes("我认为") ||
    compact.includes("我觉得")
  )
}

function extractRequestedPriority(query: string): EngineeringTask["priority"] | undefined {
  const match = normalizeCommandName(query).match(/(?:调整为|改成|升为|升到|应该是|认为它应该从p[012]调整为|认为它应该)(p[012])/i)
  const priority = match?.[1]?.toUpperCase()

  return priority === "P0" || priority === "P1" || priority === "P2" ? priority : undefined
}

function hasStrongP0Signals(query: string) {
  const compact = normalizeCommandName(query)
  const hasBusinessImpact = compact.includes("成交") || compact.includes("收入") || compact.includes("转化") || compact.includes("留存") || compact.includes("复盘")
  const hasWorkflowImpact = compact.includes("阻塞") || compact.includes("没有") || compact.includes("很难") || compact.includes("必须") || compact.includes("核心")
  const hasScale = /\d+个?销售/.test(compact) || /\d+人/.test(compact) || compact.includes("每天") || compact.includes("所有")

  return hasBusinessImpact && hasWorkflowImpact && hasScale
}

function collectImpactSignals(query: string) {
  const compact = normalizeCommandName(query)
  const signals: string[] = []
  const salesMatch = query.match(/每天影响\s*([^，。！？\s]+)/)
  const timeMatch = query.match(/每人每天(?:大约|约)?\s*([^，。！？\s]+)/)

  if (salesMatch?.[1]) signals.push(`影响范围：${salesMatch[1]}`)
  if (timeMatch?.[1]) signals.push(`人力成本：每人每天约 ${timeMatch[1]}`)
  if (compact.includes("每日复盘")) signals.push("流程影响：影响销售主管每日复盘")
  if (compact.includes("高意向客户分配")) signals.push("流程影响：影响高意向客户分配")
  if (compact.includes("成交") || compact.includes("转化")) signals.push("业务影响：可能影响线索跟进效率和成交转化")
  if (compact.includes("主管明确")) signals.push("组织承诺：销售主管已明确提出该能力的管理诉求")

  return uniqueStrings(signals)
}

function findRelatedClusters(query: string, clusters: DemandCluster[], rice?: RiceItem) {
  const basis = [query, rice?.feature, rice?.rationale, ...(rice?.evidenceFeedbackIds ?? [])].filter(Boolean).join(" ")

  return clusters
    .map((cluster) => ({
      cluster,
      score: scoreTextMatch(basis, `${cluster.title} ${cluster.description} ${cluster.userPain} ${cluster.productOpportunity} ${cluster.evidenceFeedbackIds.join(" ")}`),
    }))
    .filter((item) => item.score > 0 || rice?.evidenceFeedbackIds?.some((id) => clusterHasEvidence(item.cluster, id)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.cluster)
}

function clusterHasEvidence(cluster: DemandCluster, feedbackId: string) {
  return cluster.evidenceFeedbackIds.includes(feedbackId)
}

function buildEvidenceLines(feedbackItems: FeedbackItem[], clusters: DemandCluster[], evidenceIds: string[]) {
  const feedbackMap = new Map(feedbackItems.map((item) => [item.id, item]))
  const quoteMap = new Map(
    clusters.flatMap((cluster) => cluster.evidenceQuotes ?? []).map((quote) => [quote.feedbackId, quote.quote]),
  )

  return evidenceIds
    .map((id) => {
      const quote = quoteMap.get(id) || feedbackMap.get(id)?.content
      return quote ? `- ${id}：${truncateText(quote, 72)}` : undefined
    })
    .filter((line): line is string => Boolean(line))
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim()).map((value) => value.trim())))
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized
}

function getFeishuEventBotConfig(): FeishuEventBotConfig {
  const appId = process.env.FEISHU_APP_ID?.trim()
  const appSecret = process.env.FEISHU_APP_SECRET?.trim()

  if (!appId || !appSecret) {
    throw new FeishuEventBotError(
      "FEISHU_EVENT_CONFIG_MISSING",
      "飞书自建应用配置不完整。",
      "请在 .env.local 中配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET，并重启 npm run dev。",
      { status: 500 },
    )
  }

  return {
    appId,
    appSecret,
  }
}

async function getTenantAccessToken(config: FeishuEventBotConfig) {
  const now = Date.now()

  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value
  }

  const payload = await fetchJsonWithTimeout<TenantAccessTokenResponse>(
    `${feishuBaseUrl}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
    },
    "FEISHU_EVENT_TOKEN_FAILED",
    "获取飞书 tenant_access_token 失败。",
  )

  if (payload.code !== 0 || !payload.tenant_access_token) {
    throw new FeishuEventBotError(
      "FEISHU_EVENT_TOKEN_FAILED",
      formatFeishuApiMessage("获取飞书 tenant_access_token 失败。", payload),
      "请确认 FEISHU_APP_ID 和 FEISHU_APP_SECRET 正确，且应用已启用。",
    )
  }

  cachedToken = {
    value: payload.tenant_access_token,
    expiresAt: now + Math.max((payload.expire ?? 7200) - 300, 60) * 1000,
  }

  return payload.tenant_access_token
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  errorCode: Exclude<FeishuEventBotErrorCode, "FEISHU_EVENT_CONFIG_MISSING" | "FEISHU_EVENT_TOKEN_MISMATCH" | "FEISHU_EVENT_ENCRYPTED" | "FEISHU_EVENT_TIMEOUT" | "FEISHU_EVENT_BAD_PAYLOAD">,
  message: string,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    const responseText = await response.text()
    const payload = parseJson<T>(responseText)

    if (!response.ok) {
      throw new FeishuEventBotError(
        errorCode,
        `${message} HTTP ${response.status}。${formatFeishuApiMessage("", payload as FeishuReplyResponse)}`,
        fixForHttpError(response.status),
        { status: response.status },
      )
    }

    return payload
  } catch (error) {
    if (error instanceof FeishuEventBotError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new FeishuEventBotError("FEISHU_EVENT_TIMEOUT", `${message} 请求超时。`, "请检查网络连接，或稍后重试。", {
        cause: error,
        status: 504,
      })
    }

    throw new FeishuEventBotError(errorCode, `${message} 网络异常。`, "请检查本机服务是否能访问 open.feishu.cn。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function extractTextContent(content: string | undefined) {
  if (!content) return ""

  try {
    const parsed = JSON.parse(content) as { text?: string }
    return parsed.text || content
  } catch {
    return content
  }
}

async function parseCommand(text: string): Promise<ParsedCommand> {
  return routeFeishuRuleCommand(text)
}

function buildConversationErrorReply(error: unknown) {
  if (error instanceof AgentRunError || error instanceof FeishuBitableError || error instanceof FeishuOAuthError || error instanceof CsvParseError || error instanceof TapdError) {
    const fix = "fix" in error ? error.fix : undefined
    return [`我刚才尝试处理这句话时失败了：${error.message}`, fix ? `可以这样修：${fix}` : undefined].filter(Boolean).join("\n")
  }

  if (error instanceof Error) {
    return `我刚才尝试处理这句话时失败了：${error.message}`
  }

  return "我刚才尝试处理这句话时失败了。你可以换一种说法，或者先让我分析一张反馈表。"
}

function commandToReply(command: ParsedCommand) {
  if (command.type === "self_intro") {
    return [
      "我是 PMOpsAgent，一个 AI 产品经理助手。",
      "",
      "我可以帮你读取飞书多维表格里的用户反馈，分析需求主题，判断 MVP 范围，生成 PRD 草稿和研发任务摘要。分析完成后，我会在群里发审批卡片；创建飞书 PRD、创建 TAPD 任务这些高影响操作，需要你先在卡片上点击通过。",
      "",
      "你可以直接说：",
      "1. 帮我看看有哪些 Base",
      "2. 分析 demo-saas-feedback",
      "3. 检查我的飞书授权状态",
      "4. 看看有哪些 TAPD 项目",
    ].join("\n")
  }

  if (command.type === "status") {
    return [
      "PMOpsAgent 当前状态：",
      "1. 网页 Demo 已支持读取反馈、生成 PRD、拆解研发任务、审批、飞书通知、飞书 PRD 和 TAPD 创建。",
      "2. 群聊机器人支持 help/status、列出表格、列出 Base、分析示例反馈、按 Base 或表名分析。",
      "3. 群聊支持查询 TAPD 项目列表，方便复制项目 ID。",
      "4. 群聊分析完成后会发送飞书审批卡片，可在卡片上通过、驳回、创建 PRD 或创建 TAPD。",
    ].join("\n")
  }

  if (command.type === "unknown") {
    return "我还不认识这个指令。当前可用：@PMOpsAgent help、@PMOpsAgent status、@PMOpsAgent 列出空间表格、@PMOpsAgent 有哪些 TAPD 项目、@PMOpsAgent 分析 示例反馈，或 @PMOpsAgent 分析 表名"
  }

  return [
    "你好，我是 PMOpsAgent。",
    "当前群聊可用指令：",
    "1. @PMOpsAgent help：查看使用说明。",
    "2. @PMOpsAgent status：查看当前 Demo 能力状态。",
    "3. @PMOpsAgent 列出表格：查看当前 Base 下有哪些数据表。",
    "4. @PMOpsAgent 列出空间表格：查看空间索引下所有 Base 的数据表。",
    "5. @PMOpsAgent 分析 示例反馈：用本地 sample-feedback.csv 跑一次分析。",
    "6. @PMOpsAgent 分析 用户反馈：按表名搜索空间索引并分析。",
    "7. @PMOpsAgent 分析 Base名/用户反馈：同名表较多时精确指定。",
    "8. @PMOpsAgent 分析 飞书表格链接：读取该多维表格并回复分析摘要。",
    "9. @PMOpsAgent 授权状态：检查当前 OAuth token 拿到了哪些权限。",
    "10. @PMOpsAgent 有哪些 TAPD 项目：列出 TAPD 公司下可访问的项目 ID。",
    "分析完成后会发送审批卡片；可以直接在飞书里通过、驳回、创建 PRD 或创建 TAPD。网页 Demo 主要用于历史回放和复杂编辑。",
  ].join("\n")
}

function hasProcessedEvent(eventId: string) {
  return processedEventIdSet.has(eventId)
}

function rememberProcessedEvent(eventId: string) {
  processedEventIds.push(eventId)
  processedEventIdSet.add(eventId)

  while (processedEventIds.length > maxProcessedEventIds) {
    const oldest = processedEventIds.shift()
    if (oldest) {
      processedEventIdSet.delete(oldest)
    }
  }
}

function formatFeishuApiMessage(prefix: string, payload: { code?: number; msg?: string; message?: string; error?: string }) {
  const parts = [prefix.trim()]

  if (typeof payload.code === "number") {
    parts.push(`飞书错误码：${payload.code}。`)
  }

  const message = payload.msg || payload.message || payload.error
  if (message) {
    parts.push(`飞书返回：${message}`)
  }

  return parts.filter(Boolean).join(" ")
}

function fixForHttpError(status: number) {
  if (status === 401 || status === 403) {
    return "请检查 FEISHU_APP_ID、FEISHU_APP_SECRET、应用发布状态、机器人能力和消息权限。"
  }

  return "请检查飞书应用权限、发布状态、机器人是否在群里，以及网络连接。"
}

function parseJson<T>(text: string): T {
  if (!text.trim()) {
    return {} as T
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new FeishuEventBotError("FEISHU_EVENT_BAD_PAYLOAD", "飞书接口返回了非 JSON 内容。", "请稍后重试。", {
      cause: error,
      status: 502,
    })
  }
}
