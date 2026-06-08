import type { AgentResult, EngineeringTask, PrdDraft, RiskItem } from "@/types/product"

const feishuBaseUrl = "https://open.feishu.cn/open-apis"
const maxBlocksPerRequest = 40

type FeishuDocumentErrorCode =
  | "FEISHU_DOC_CONFIG_MISSING"
  | "FEISHU_DOC_TOKEN_FAILED"
  | "FEISHU_DOC_CREATE_FAILED"
  | "FEISHU_DOC_WRITE_FAILED"
  | "FEISHU_DOC_TIMEOUT"

export class FeishuDocumentError extends Error {
  code: FeishuDocumentErrorCode
  fix: string

  constructor(code: FeishuDocumentErrorCode, message: string, fix: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "FeishuDocumentError"
    this.code = code
    this.fix = fix
  }
}

type TenantAccessTokenResponse = {
  code?: number
  msg?: string
  tenant_access_token?: string
  expire?: number
}

type CreateDocumentResponse = {
  code?: number
  msg?: string
  data?: {
    document?: {
      document_id?: string
      revision_id?: number
      title?: string
      url?: string
    }
    document_id?: string
    url?: string
  }
}

type CreateBlockResponse = {
  code?: number
  msg?: string
}

type FeishuApiErrorPayload = {
  code?: number
  msg?: string
  error?: string
  message?: string
}

type FeishuDocumentConfig = {
  appId: string
  appSecret: string
  folderToken?: string
  docBaseUrl?: string
}

type FeishuBlock = {
  block_type: number
  text?: TextBlockContent
  heading1?: TextBlockContent
  heading2?: TextBlockContent
  heading3?: TextBlockContent
  bullet?: TextBlockContent
}

type TextBlockContent = {
  elements: Array<{
    text_run: {
      content: string
      text_element_style?: {
        bold?: boolean
      }
    }
  }>
  style?: Record<string, unknown>
}

let cachedToken:
  | {
      value: string
      expiresAt: number
    }
  | undefined

export type CreatedPrdDocument = {
  documentId: string
  title: string
  url?: string
}

export async function createFeishuPrdDocument(result: AgentResult): Promise<CreatedPrdDocument> {
  const config = getFeishuDocumentConfig()
  const token = await getTenantAccessToken(config)
  const createdDocument = await createDocument(result.prd.title, config, token)
  const blocks = agentResultToBlocks(result)

  await appendBlocks(createdDocument.documentId, blocks, token)

  return createdDocument
}

export function getFeishuDocumentRuntimeConfig() {
  return {
    configured: Boolean(process.env.FEISHU_APP_ID?.trim() && process.env.FEISHU_APP_SECRET?.trim()),
    folderTokenConfigured: Boolean(process.env.FEISHU_DOC_FOLDER_TOKEN?.trim()),
    baseUrlConfigured: Boolean(process.env.FEISHU_DOC_BASE_URL?.trim()),
  }
}

function getFeishuDocumentConfig(): FeishuDocumentConfig {
  const appId = process.env.FEISHU_APP_ID?.trim()
  const appSecret = process.env.FEISHU_APP_SECRET?.trim()

  if (!appId || !appSecret) {
    throw new FeishuDocumentError(
      "FEISHU_DOC_CONFIG_MISSING",
      "飞书文档配置不完整。",
      "请在 .env.local 中配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET，并重启 npm run dev。",
    )
  }

  return {
    appId,
    appSecret,
    folderToken: process.env.FEISHU_DOC_FOLDER_TOKEN?.trim() || undefined,
    docBaseUrl: normalizeDocBaseUrl(process.env.FEISHU_DOC_BASE_URL),
  }
}

async function getTenantAccessToken(config: FeishuDocumentConfig) {
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
    "FEISHU_DOC_TOKEN_FAILED",
    "获取飞书 tenant_access_token 失败。",
  )

  if (payload.code !== 0 || !payload.tenant_access_token) {
    throw new FeishuDocumentError(
      "FEISHU_DOC_TOKEN_FAILED",
      formatFeishuApiMessage("获取飞书 tenant_access_token 失败。", payload),
      "请确认 FEISHU_APP_ID 和 FEISHU_APP_SECRET 正确，并且应用已启用。",
    )
  }

  cachedToken = {
    value: payload.tenant_access_token,
    expiresAt: now + Math.max((payload.expire ?? 7200) - 300, 60) * 1000,
  }

  return payload.tenant_access_token
}

async function createDocument(title: string, config: FeishuDocumentConfig, token: string): Promise<CreatedPrdDocument> {
  const payload = await fetchJsonWithTimeout<CreateDocumentResponse>(
    `${feishuBaseUrl}/docx/v1/documents`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        title: title || "PMOpsAgent PRD 草稿",
        ...(config.folderToken ? { folder_token: config.folderToken } : {}),
      }),
    },
    "FEISHU_DOC_CREATE_FAILED",
    "创建飞书文档失败。",
  )

  if (payload.code !== 0) {
    throw new FeishuDocumentError(
      "FEISHU_DOC_CREATE_FAILED",
      formatFeishuApiMessage("创建飞书文档失败。", payload),
      "请确认应用已申请“创建及编辑新版文档”权限并完成发布或审批。",
    )
  }

  const documentId = payload.data?.document?.document_id || payload.data?.document_id

  if (!documentId) {
    throw new FeishuDocumentError(
      "FEISHU_DOC_CREATE_FAILED",
      "飞书文档创建成功但未返回 document_id。",
      "请稍后重试；如果持续出现，请检查飞书开放平台接口返回。",
    )
  }

  return {
    documentId,
    title: payload.data?.document?.title || title || "PMOpsAgent PRD 草稿",
    url: payload.data?.document?.url || payload.data?.url || buildDocumentUrl(config.docBaseUrl, documentId),
  }
}

async function appendBlocks(documentId: string, blocks: FeishuBlock[], token: string) {
  const batches = chunk(blocks, maxBlocksPerRequest)

  for (const batch of batches) {
    const payload = await fetchJsonWithTimeout<CreateBlockResponse>(
      `${feishuBaseUrl}/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(documentId)}/children?document_revision_id=-1`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          index: -1,
          children: batch,
        }),
      },
      "FEISHU_DOC_WRITE_FAILED",
      "写入飞书文档内容失败。",
    )

    if (payload.code !== 0) {
      throw new FeishuDocumentError(
        "FEISHU_DOC_WRITE_FAILED",
        formatFeishuApiMessage("写入飞书文档内容失败。", payload),
        "请确认应用已申请“创建及编辑新版文档”权限，且文档未被删除。",
      )
    }
  }
}

function agentResultToBlocks(result: AgentResult): FeishuBlock[] {
  const prd = result.prd
  const blocks: FeishuBlock[] = [
    heading1(prd.title),
    text(result.summary),
    heading2("背景"),
    text(prd.background),
    heading2("目标用户"),
    ...bullets(prd.targetUsers),
    heading2("用户问题"),
    text(prd.problemStatement),
    heading2("目标"),
    ...bullets(prd.goals),
    heading2("非目标"),
    ...bullets(prd.nonGoals),
    heading2("用户故事"),
    ...bullets(prd.userStories),
    heading2("功能需求"),
    ...bullets(prd.functionalRequirements),
    heading2("成功指标"),
    ...bullets(prd.successMetrics),
    heading2("埋点方案"),
    ...trackingPlanBlocks(prd),
    heading2("风险与缓解"),
    ...riskBlocks(result.risks),
    heading2("开放问题"),
    ...bullets(result.openQuestions),
    heading2("研发任务草稿"),
    ...taskBlocks(result.engineeringTasks),
  ]

  return blocks.filter((block) => hasText(block))
}

function trackingPlanBlocks(prd: PrdDraft) {
  return prd.trackingPlan.flatMap((item) => [
    heading3(item.eventName),
    text(`触发时机：${item.trigger}`),
    text(`属性：${item.properties.join("、") || "暂无"}`),
    text(`目的：${item.purpose}`),
  ])
}

function riskBlocks(risks: RiskItem[]) {
  return risks.flatMap((item) => [heading3(`${item.level.toUpperCase()}：${item.risk}`), text(`缓解方案：${item.mitigation}`)])
}

function taskBlocks(tasks: EngineeringTask[]) {
  return tasks.flatMap((task) => [
    heading3(`[${task.type}] ${task.title}`),
    text(`优先级：${task.priority}`),
    text(task.description),
    ...bullets(task.acceptanceCriteria.map((criteria) => `验收标准：${criteria}`)),
  ])
}

function heading1(content: string): FeishuBlock {
  return textLikeBlock(3, "heading1", content, true)
}

function heading2(content: string): FeishuBlock {
  return textLikeBlock(4, "heading2", content, true)
}

function heading3(content: string): FeishuBlock {
  return textLikeBlock(5, "heading3", content, true)
}

function text(content: string): FeishuBlock {
  return textLikeBlock(2, "text", content)
}

function bullets(items: string[]) {
  return items.map((item) => textLikeBlock(12, "bullet", item))
}

function textLikeBlock(blockType: number, field: "text" | "heading1" | "heading2" | "heading3" | "bullet", content: string, bold = false): FeishuBlock {
  return {
    block_type: blockType,
    [field]: {
      elements: [
        {
          text_run: {
            content,
            text_element_style: bold ? { bold: true } : {},
          },
        },
      ],
      style: {},
    },
  }
}

function hasText(block: FeishuBlock) {
  const content = block.text || block.heading1 || block.heading2 || block.heading3 || block.bullet
  return Boolean(content?.elements.some((element) => element.text_run.content.trim()))
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  errorCode: Exclude<FeishuDocumentErrorCode, "FEISHU_DOC_CONFIG_MISSING" | "FEISHU_DOC_TIMEOUT">,
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
      throw new FeishuDocumentError(
        errorCode,
        `${message} HTTP ${response.status}。${formatFeishuApiMessage("", payload as FeishuApiErrorPayload)}`,
        fixForHttpError(response.status, errorCode),
      )
    }

    return payload
  } catch (error) {
    if (error instanceof FeishuDocumentError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new FeishuDocumentError("FEISHU_DOC_TIMEOUT", `${message} 请求超时。`, "请检查网络连接，或稍后重试。", {
        cause: error,
      })
    }

    throw new FeishuDocumentError(errorCode, `${message} 网络异常。`, "请检查本机是否能访问 open.feishu.cn。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function formatFeishuApiMessage(prefix: string, payload: FeishuApiErrorPayload) {
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

function fixForHttpError(status: number, errorCode: FeishuDocumentErrorCode) {
  if (status === 400 && errorCode === "FEISHU_DOC_CREATE_FAILED") {
    return "请重点检查：应用是否申请并发布“创建及编辑新版文档”权限；如果配置了 FEISHU_DOC_FOLDER_TOKEN，请确认该文件夹是应用可访问的文件夹。"
  }

  if (status === 400 && errorCode === "FEISHU_DOC_WRITE_FAILED") {
    return "请重点检查：应用是否申请“创建及编辑新版文档”权限，而不是只申请“创建新版文档”。"
  }

  if (status === 401 || status === 403) {
    return "请检查 FEISHU_APP_ID、FEISHU_APP_SECRET、应用发布状态和权限审批状态。"
  }

  return "请检查飞书应用权限、发布状态和网络连接。"
}

function parseJson<T>(text: string): T {
  if (!text.trim()) {
    return {} as T
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new FeishuDocumentError("FEISHU_DOC_WRITE_FAILED", "飞书接口返回了非 JSON 内容。", "请稍后重试。", {
      cause: error,
    })
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function normalizeDocBaseUrl(value: string | undefined) {
  const baseUrl = value?.trim()
  if (!baseUrl) return undefined
  return baseUrl.replace(/\/$/, "")
}

function buildDocumentUrl(baseUrl: string | undefined, documentId: string) {
  if (!baseUrl) return undefined
  return `${baseUrl}/docx/${documentId}`
}
