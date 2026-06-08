import { NextResponse } from "next/server"
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { FeishuCardActionError, handleFeishuCardActionCallback } from "@/lib/feishu/cardActions"

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "PMOpsAgent 飞书卡片回调服务已启动。请在飞书开放平台卡片回调中使用 POST 回调。",
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
          code: "FEISHU_CARD_ACTION_BAD_PAYLOAD",
          message: "请求体不是有效 JSON。",
          fix: "请确认飞书卡片回调请求地址配置为 /api/feishu/card-actions，并使用飞书平台自动发送的 JSON 回调。",
        },
      },
      { status: 400 },
    )
  }

  try {
    const result = await handleFeishuCardActionCallback(body)

    if (result.kind === "challenge") {
      await writeFeishuCardDebug(body, { ok: true, kind: result.kind })
      return NextResponse.json({
        challenge: result.challenge,
      })
    }

    await writeFeishuCardDebug(body, {
      ok: true,
      kind: result.kind,
      action: result.action,
      runId: result.runId,
      message: result.message,
    })

    return NextResponse.json({
      toast: {
        type: "success",
        content: result.message,
      },
      card: {
        type: "raw",
        data: result.card,
      },
    })
  } catch (error) {
    if (error instanceof FeishuCardActionError) {
      await writeFeishuCardDebug(body, {
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

    await writeFeishuCardDebug(body, {
      ok: false,
      code: "FEISHU_CARD_ACTION_FAILED",
      message: "处理飞书卡片回调失败。",
      status: 500,
    })

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FEISHU_CARD_ACTION_FAILED",
          message: "处理飞书卡片回调失败。",
          fix: "请稍后重试，并检查服务端日志中的非敏感错误信息。",
        },
      },
      { status: 500 },
    )
  }
}

async function writeFeishuCardDebug(body: unknown, outcome: Record<string, unknown>) {
  try {
    const debugDir = path.join(process.cwd(), "data")
    await mkdir(debugDir, { recursive: true })
    await appendFile(
      path.join(debugDir, "feishu-card-debug.jsonl"),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: sanitizeFeishuCardEvent(body),
        outcome,
      })}\n`,
      "utf8",
    )
  } catch {
    // Debug logging must never break Feishu callback handling.
  }
}

function sanitizeFeishuCardEvent(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      shape: typeof body,
    }
  }

  const payload = body as {
    type?: string
    challenge?: string
    token?: string
    encrypt?: string
    header?: {
      token?: string
    }
    action?: {
      value?: {
        action?: string
        runId?: string
      }
    }
    event?: {
      action?: {
        value?: {
          action?: string
          runId?: string
        }
      }
      context?: {
        open_message_id?: string
      }
      message_id?: string
    }
  }

  return {
    type: payload.type,
    hasChallenge: Boolean(payload.challenge),
    hasEncrypt: Boolean(payload.encrypt),
    hasRootToken: Boolean(payload.token),
    hasHeaderToken: Boolean(payload.header?.token),
    action: payload.event?.action?.value?.action || payload.action?.value?.action,
    runId: payload.event?.action?.value?.runId || payload.action?.value?.runId,
    hasCardMessageId: Boolean(payload.event?.message_id || payload.event?.context?.open_message_id),
  }
}
