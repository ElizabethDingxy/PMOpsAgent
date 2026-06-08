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

  if (!webhook) {
    throw new FeishuWebhookError("FEISHU_WEBHOOK_MISSING", "FEISHU_BOT_WEBHOOK 未配置。")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        msg_type: "text",
        content: {
          text: message,
        },
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    const payload = parseFeishuResponse(responseText)

    if (!response.ok) {
      throw new FeishuWebhookError("FEISHU_REQUEST_FAILED", `飞书 webhook 请求失败，HTTP ${response.status}。`)
    }

    const legacyCode = payload.StatusCode
    const modernCode = payload.code

    if ((typeof legacyCode === "number" && legacyCode !== 0) || (typeof modernCode === "number" && modernCode !== 0)) {
      throw new FeishuWebhookError(
        "FEISHU_REQUEST_FAILED",
        payload.StatusMessage || payload.msg || "飞书 webhook 返回错误。",
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
