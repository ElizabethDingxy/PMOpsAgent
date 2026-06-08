import { NextResponse } from "next/server"
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { FeishuEventBotError, handleFeishuEventCallback } from "@/lib/feishu/eventBot"

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "PMOpsAgent 飞书事件回调服务已启动。请在飞书开放平台事件订阅中使用 POST 回调。",
  })
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FEISHU_EVENT_BAD_PAYLOAD",
          message: "请求体不是有效 JSON。",
          fix: "请确认飞书事件订阅请求地址配置为 /api/feishu/events，并使用飞书平台自动发送的 JSON 回调。",
        },
      },
      { status: 400 },
    )
  }

  try {
    const result = await handleFeishuEventCallback(body)

    if (result.kind === "challenge") {
      await writeFeishuEventDebug(body, { ok: true, kind: result.kind })
      return NextResponse.json({
        challenge: result.challenge,
      })
    }

    await writeFeishuEventDebug(body, { ok: true, kind: result.kind, message: result.message })

    return NextResponse.json({
      ok: true,
      result,
    })
  } catch (error) {
    if (error instanceof FeishuEventBotError) {
      await writeFeishuEventDebug(body, {
        ok: false,
        code: error.code,
        message: error.message,
        fix: error.fix,
        status: error.status,
      })

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            fix: error.fix,
          },
        },
        { status: error.status },
      )
    }

    await writeFeishuEventDebug(body, {
      ok: false,
      code: "FEISHU_EVENT_FAILED",
      message: "处理飞书事件失败。",
      status: 500,
    })

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FEISHU_EVENT_FAILED",
          message: "处理飞书事件失败。",
          fix: "请稍后重试，并检查服务端日志中的非敏感错误信息。",
        },
      },
      { status: 500 },
    )
  }
}

async function writeFeishuEventDebug(body: unknown, outcome: Record<string, unknown>) {
  try {
    const debugDir = path.join(process.cwd(), "data")
    await mkdir(debugDir, { recursive: true })
    await appendFile(
      path.join(debugDir, "feishu-event-debug.jsonl"),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: sanitizeFeishuEvent(body),
        outcome,
      })}\n`,
      "utf8",
    )
  } catch {
    // Debug logging must never break Feishu callback handling.
  }
}

function sanitizeFeishuEvent(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      shape: typeof body,
    }
  }

  const payload = body as {
    schema?: string
    type?: string
    challenge?: string
    token?: string
    encrypt?: string
    header?: {
      event_id?: string
      event_type?: string
      token?: string
    }
    event?: {
      type?: string
      message?: {
        message_id?: string
        message_type?: string
        chat_type?: string
        content?: string
      }
    }
  }

  return {
    schema: payload.schema,
    type: payload.type,
    hasChallenge: Boolean(payload.challenge),
    hasEncrypt: Boolean(payload.encrypt),
    hasRootToken: Boolean(payload.token),
    headerEventType: payload.header?.event_type,
    hasHeaderToken: Boolean(payload.header?.token),
    eventType: payload.event?.type,
    messageType: payload.event?.message?.message_type,
    chatType: payload.event?.message?.chat_type,
    hasMessageId: Boolean(payload.event?.message?.message_id),
    contentLength: payload.event?.message?.content?.length ?? 0,
  }
}
