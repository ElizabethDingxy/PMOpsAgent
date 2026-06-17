import { createHmac } from "node:crypto"

export class FeishuWebhookError extends Error {
  code: "FEISHU_WEBHOOK_MISSING" | "FEISHU_REQUEST_TIMEOUT" | "FEISHU_REQUEST_FAILED"

  constructor(
    code: FeishuWebhookError["code"],
    message: string,
    options?: {
      cause?: unknown
    },
  ) {
    super(message, options)
    this.name = "FeishuWebhookError"
    this.code = code
  }
}

type FeishuWebhookResponse = {
  code?: number
  msg?: string
  StatusCode?: number
  StatusMessage?: string
}

export async function sendFeishuTextMessage(message: string): Promise<void> {
  const webhook = process.env.FEISHU_BOT_WEBHOOK?.trim()
  const secret = process.env.FEISHU_BOT_SECRET?.trim()
  const normalizedMessage = normalizeFeishuWebhookText(message)

  if (!webhook) {
    throw new FeishuWebhookError("FEISHU_WEBHOOK_MISSING", "FEISHU_BOT_WEBHOOK 未配置。")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  const payload = buildFeishuTextPayload(normalizedMessage, secret)

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const responseText = await response.text()
    const responsePayload = parseFeishuResponse(responseText)

    if (!response.ok) {
      throw new FeishuWebhookError(
        "FEISHU_REQUEST_FAILED",
        `飞书 webhook 请求失败，HTTP ${response.status}。${formatFeishuResponseMessage(responsePayload)}`,
      )
    }

    const legacyCode = responsePayload.StatusCode
    const modernCode = responsePayload.code

    if ((typeof legacyCode === "number" && legacyCode !== 0) || (typeof modernCode === "number" && modernCode !== 0)) {
      throw new FeishuWebhookError(
        "FEISHU_REQUEST_FAILED",
        responsePayload.StatusMessage || responsePayload.msg || `飞书 webhook 返回错误。${formatFeishuResponseMessage(responsePayload)}`,
      )
    }
  } catch (error) {
    if (error instanceof FeishuWebhookError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new FeishuWebhookError("FEISHU_REQUEST_TIMEOUT", "飞书 webhook 请求超时。", {
        cause: error,
      })
    }

    throw new FeishuWebhookError("FEISHU_REQUEST_FAILED", "飞书 webhook 请求发生网络异常。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export function getFeishuWebhookConfig() {
  return {
    webhookConfigured: Boolean(process.env.FEISHU_BOT_WEBHOOK?.trim()),
    secretConfigured: Boolean(process.env.FEISHU_BOT_SECRET?.trim()),
  }
}

function parseFeishuResponse(responseText: string): FeishuWebhookResponse {
  if (!responseText.trim()) {
    return {}
  }

  try {
    return JSON.parse(responseText) as FeishuWebhookResponse
  } catch {
    return {}
  }
}

function buildFeishuTextPayload(message: string, secret: string | undefined) {
  const payload: {
    msg_type: "text"
    content: {
      text: string
    }
    timestamp?: string
    sign?: string
  } = {
    msg_type: "text",
    content: {
      text: message,
    },
  }

  if (!secret) return payload

  const timestamp = Math.floor(Date.now() / 1000).toString()
  payload.timestamp = timestamp
  payload.sign = createFeishuWebhookSign(timestamp, secret)

  return payload
}

function createFeishuWebhookSign(timestamp: string, secret: string) {
  const stringToSign = `${timestamp}\n${secret}`
  return createHmac("sha256", stringToSign).digest("base64")
}

function formatFeishuResponseMessage(payload: FeishuWebhookResponse) {
  const message = payload.StatusMessage || payload.msg
  const code = typeof payload.StatusCode === "number" ? payload.StatusCode : payload.code

  if (typeof code === "number" && message) return `飞书错误码：${code}，返回：${message}`
  if (typeof code === "number") return `飞书错误码：${code}。`
  if (message) return `飞书返回：${message}`

  return ""
}

function normalizeFeishuWebhookText(message: string) {
  const trimmed = message.trim()
  if (/PMOpsAgent/i.test(trimmed)) return trimmed

  return `PMOpsAgent 评审摘要\n\n${trimmed}`
}
