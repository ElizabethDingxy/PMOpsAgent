export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type DeepSeekChatOptions = {
  messages: ChatMessage[]
  temperature?: number
  timeoutMs?: number
}

export class DeepSeekClientError extends Error {
  code: "LLM_API_KEY_MISSING" | "LLM_REQUEST_TIMEOUT" | "LLM_REQUEST_FAILED" | "LLM_RESPONSE_INVALID"

  constructor(
    code: DeepSeekClientError["code"],
    message: string,
    options?: {
      cause?: unknown
    },
  ) {
    super(message, options)
    this.name = "DeepSeekClientError"
    this.code = code
  }
}

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

export async function createDeepSeekChatCompletion({
  messages,
  temperature = 0.2,
  timeoutMs = 45000,
}: DeepSeekChatOptions): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()

  if (!apiKey) {
    throw new DeepSeekClientError("LLM_API_KEY_MISSING", "DEEPSEEK_API_KEY 未配置。")
  }

  const baseUrl = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com"
  const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        response_format: {
          type: "json_object",
        },
      }),
      signal: controller.signal,
    })

    const responseText = await response.text()
    let payload: DeepSeekChatResponse

    try {
      payload = JSON.parse(responseText) as DeepSeekChatResponse
    } catch {
      throw new DeepSeekClientError("LLM_RESPONSE_INVALID", "LLM 返回了无法解析的响应。")
    }

    if (!response.ok) {
      throw new DeepSeekClientError(
        "LLM_REQUEST_FAILED",
        payload.error?.message || `LLM 请求失败，HTTP 状态码 ${response.status}。`,
      )
    }

    const content = payload.choices?.[0]?.message?.content

    if (!content) {
      throw new DeepSeekClientError("LLM_RESPONSE_INVALID", "LLM 响应中缺少 message.content。")
    }

    return content
  } catch (error) {
    if (error instanceof DeepSeekClientError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new DeepSeekClientError("LLM_REQUEST_TIMEOUT", "LLM 请求超时，请稍后重试。", {
        cause: error,
      })
    }

    throw new DeepSeekClientError("LLM_REQUEST_FAILED", "LLM 请求发生网络异常。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}
