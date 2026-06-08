import type { FeishuApprovalRecord } from "@/lib/approvals/approvalStore"
import type { AgentResult, MvpScopeItem, SavedAgentRun } from "@/types/product"

const feishuBaseUrl = "https://open.feishu.cn/open-apis"

type FeishuCardErrorCode =
  | "FEISHU_CARD_CONFIG_MISSING"
  | "FEISHU_CARD_TOKEN_FAILED"
  | "FEISHU_CARD_SEND_FAILED"
  | "FEISHU_CARD_UPDATE_FAILED"
  | "FEISHU_CARD_TIMEOUT"

export class FeishuCardError extends Error {
  code: FeishuCardErrorCode
  fix: string

  constructor(code: FeishuCardErrorCode, message: string, fix: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "FeishuCardError"
    this.code = code
    this.fix = fix
  }
}

type FeishuCardConfig = {
  appId: string
  appSecret: string
}

type TenantAccessTokenResponse = {
  code?: number
  msg?: string
  tenant_access_token?: string
  expire?: number
}

type FeishuApiResponse = {
  code?: number
  msg?: string
  data?: {
    message_id?: string
  }
}

type FeishuCardAction = "approve" | "reject" | "create_prd" | "create_tapd"

let cachedToken:
  | {
      value: string
      expiresAt: number
    }
  | undefined

export async function sendFeishuApprovalCard(input: {
  receiveId: string
  receiveIdType?: "chat_id" | "open_id" | "user_id" | "email" | "union_id"
  savedRun: SavedAgentRun
}) {
  const config = getFeishuCardConfig()
  const token = await getTenantAccessToken(config)
  const url = new URL(`${feishuBaseUrl}/im/v1/messages`)
  url.searchParams.set("receive_id_type", input.receiveIdType || "chat_id")

  const payload = await fetchJsonWithTimeout<FeishuApiResponse>(
    url.toString(),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: input.receiveId,
        msg_type: "interactive",
        content: JSON.stringify(buildApprovalCard(input.savedRun)),
      }),
    },
    "FEISHU_CARD_SEND_FAILED",
    "发送飞书审批卡片失败。",
  )

  if (payload.code !== 0 || !payload.data?.message_id) {
    throw new FeishuCardError(
      "FEISHU_CARD_SEND_FAILED",
      formatFeishuMessage("发送飞书审批卡片失败。", payload),
      "请确认应用已开启机器人能力、已加入群聊，并拥有发送消息权限。",
    )
  }

  return {
    messageId: payload.data.message_id,
  }
}

export async function replyFeishuApprovalCard(input: {
  messageId: string
  savedRun: SavedAgentRun
}) {
  const config = getFeishuCardConfig()
  const token = await getTenantAccessToken(config)
  const payload = await fetchJsonWithTimeout<FeishuApiResponse>(
    `${feishuBaseUrl}/im/v1/messages/${encodeURIComponent(input.messageId)}/reply`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        msg_type: "interactive",
        content: JSON.stringify(buildApprovalCard(input.savedRun)),
      }),
    },
    "FEISHU_CARD_SEND_FAILED",
    "回复飞书审批卡片失败。",
  )

  if (payload.code !== 0 || !payload.data?.message_id) {
    throw new FeishuCardError(
      "FEISHU_CARD_SEND_FAILED",
      formatFeishuMessage("回复飞书审批卡片失败。", payload),
      "请确认应用已开启机器人能力、已加入群聊，并拥有发送消息和回复消息权限。",
    )
  }

  return {
    messageId: payload.data.message_id,
  }
}

export async function updateFeishuApprovalCard(input: {
  cardMessageId?: string
  savedRun: SavedAgentRun
  approval: FeishuApprovalRecord
}) {
  if (!input.cardMessageId) return

  const config = getFeishuCardConfig()
  const token = await getTenantAccessToken(config)
  const payload = await fetchJsonWithTimeout<FeishuApiResponse>(
    `${feishuBaseUrl}/im/v1/messages/${encodeURIComponent(input.cardMessageId)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        content: JSON.stringify(buildApprovalCard(input.savedRun, input.approval)),
      }),
    },
    "FEISHU_CARD_UPDATE_FAILED",
    "更新飞书审批卡片失败。",
  )

  if (payload.code !== 0) {
    throw new FeishuCardError(
      "FEISHU_CARD_UPDATE_FAILED",
      formatFeishuMessage("更新飞书审批卡片失败。", payload),
      "请确认应用拥有更新消息卡片所需权限，或直接查看群内后续文字回复。",
    )
  }
}

export function buildApprovalCard(savedRun: SavedAgentRun, approval?: FeishuApprovalRecord) {
  const result = savedRun.run.result
  const status = approval?.status || "pending"
  const statusText = approval ? approvalStatusText(approval) : "待审批"

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      template: statusTemplate(status),
      title: {
        tag: "plain_text",
        content: `PMOpsAgent 评审：${result.productName || result.prd.title}`,
      },
    },
    elements: [
      markdown(`**状态**：${statusText}\n**来源**：${savedRun.sourceLabel || "飞书群聊"}\n**反馈数**：${savedRun.feedbackItems.length} 条\n**运行 ID**：${savedRun.id}`),
      markdown(`**摘要**\n${truncate(result.summary, 500)}`),
      markdown(`**Top 需求主题**\n${formatClusters(result)}`),
      markdown(`**MVP 必做**\n${formatList(result.mvpScope.mustHave, 5)}`),
      markdown(`**研发任务预览**\n${formatTasks(result)}`),
      ...(approval?.prdUrl ? [markdown(`**飞书 PRD**\n${approval.prdUrl}`)] : []),
      ...(approval?.tapdStoryUrl ? [markdown(`**TAPD 需求**\n${approval.tapdStoryUrl}`)] : []),
      ...(approval?.errorMessage ? [markdown(`**最近错误**\n${approval.errorMessage}`)] : []),
      actions(savedRun.id, status),
    ],
  }
}

function actions(runId: string, status: FeishuApprovalRecord["status"]) {
  const approved = status === "approved" || status === "prd_created" || status === "tapd_created"
  const disabledCreate = !approved

  return {
    tag: "action",
    actions: [
      button("通过分析", "primary", "approve", runId, status !== "pending"),
      button("驳回", "danger", "reject", runId, status !== "pending"),
      button("创建 PRD", "default", "create_prd", runId, disabledCreate),
      button("创建 TAPD", "default", "create_tapd", runId, disabledCreate),
    ],
  }
}

function button(text: string, type: "default" | "primary" | "danger", action: FeishuCardAction, runId: string, disabled: boolean) {
  void disabled

  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: text,
    },
    type,
    value: {
      action,
      runId,
    },
  }
}

function markdown(content: string) {
  return {
    tag: "markdown",
    content,
  }
}

function formatClusters(result: AgentResult) {
  return result.demandClusters
    .slice(0, 3)
    .map((cluster, index) => `${index + 1}. ${cluster.title}：${cluster.userPain}`)
    .join("\n") || "暂无"
}

function formatList(items: Array<MvpScopeItem | string>, limit: number) {
  return items.slice(0, limit).map((item, index) => `${index + 1}. ${formatScopeItem(item)}`).join("\n") || "暂无"
}

function formatScopeItem(item: MvpScopeItem | string) {
  if (typeof item === "string") return item
  return item.reason ? `${item.feature}：${item.reason}` : item.feature
}

function formatTasks(result: AgentResult) {
  return result.engineeringTasks
    .slice(0, 4)
    .map((task, index) => `${index + 1}. [${task.priority}] ${task.title}`)
    .join("\n") || "暂无"
}

function approvalStatusText(approval: FeishuApprovalRecord) {
  if (approval.status === "approved") return "已通过，可创建 PRD 或 TAPD"
  if (approval.status === "rejected") return "已驳回"
  if (approval.status === "prd_created") return "已创建飞书 PRD"
  if (approval.status === "tapd_created") return "已创建 TAPD"
  if (approval.status === "failed") return "执行失败，请查看错误"
  return "待审批"
}

function statusTemplate(status: FeishuApprovalRecord["status"]) {
  if (status === "approved" || status === "prd_created" || status === "tapd_created") return "green"
  if (status === "rejected" || status === "failed") return "red"
  return "blue"
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function getFeishuCardConfig(): FeishuCardConfig {
  const appId = process.env.FEISHU_APP_ID?.trim()
  const appSecret = process.env.FEISHU_APP_SECRET?.trim()

  if (!appId || !appSecret) {
    throw new FeishuCardError(
      "FEISHU_CARD_CONFIG_MISSING",
      "飞书卡片配置不完整。",
      "请在 .env.local 中配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET，并重启 npm run dev。",
    )
  }

  return {
    appId,
    appSecret,
  }
}

async function getTenantAccessToken(config: FeishuCardConfig) {
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
    "FEISHU_CARD_TOKEN_FAILED",
    "获取飞书 tenant_access_token 失败。",
  )

  if (payload.code !== 0 || !payload.tenant_access_token) {
    throw new FeishuCardError(
      "FEISHU_CARD_TOKEN_FAILED",
      formatFeishuMessage("获取飞书 tenant_access_token 失败。", payload),
      "请确认 FEISHU_APP_ID 和 FEISHU_APP_SECRET 正确，且应用已启用。",
    )
  }

  cachedToken = {
    value: payload.tenant_access_token,
    expiresAt: now + Math.max((payload.expire ?? 7200) - 300, 60) * 1000,
  }

  return payload.tenant_access_token
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, errorCode: FeishuCardErrorCode, message: string) {
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
      throw new FeishuCardError(errorCode, `${message} HTTP ${response.status}。${formatFeishuMessage("", payload as FeishuApiResponse)}`, "请检查飞书应用权限、发布状态和网络连接。")
    }

    return payload
  } catch (error) {
    if (error instanceof FeishuCardError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new FeishuCardError("FEISHU_CARD_TIMEOUT", `${message} 请求超时。`, "请检查网络连接，或稍后重试。", {
        cause: error,
      })
    }

    throw new FeishuCardError(errorCode, `${message} 网络异常。`, "请检查本机是否能访问 open.feishu.cn。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function parseJson<T>(text: string): T {
  if (!text.trim()) return {} as T

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new FeishuCardError("FEISHU_CARD_SEND_FAILED", "飞书接口返回了非 JSON 内容。", "请稍后重试。", {
      cause: error,
    })
  }
}

function formatFeishuMessage(prefix: string, payload: { code?: number; msg?: string; message?: string; error?: string }) {
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
