import { NextResponse } from "next/server"
import { sendFeishuReviewMessage, AgentActionError } from "@/lib/agent/agentActionExecutor"

type SendFeishuRequestBody = {
  message?: string
  runId?: string
}

export async function POST(request: Request) {
  let body: SendFeishuRequestBody

  try {
    body = (await request.json()) as SendFeishuRequestBody
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_JSON",
          message: "请求体不是合法 JSON。",
          fix: "请检查前端请求格式，确保 body 是 JSON。",
        },
      },
      { status: 400 },
    )
  }

  const message = body.message?.trim()

  if (!message) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "MESSAGE_EMPTY",
          message: "飞书消息内容为空。",
          fix: "请先运行 Agent 生成评审摘要，再点击发送。",
        },
      },
      { status: 400 },
    )
  }

  try {
    const { trace } = await sendFeishuReviewMessage(message, body.runId)

    return NextResponse.json({
      ok: true,
      trace,
    })
  } catch (error) {
    if (error instanceof AgentActionError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            fix: error.fix,
          },
        },
        { status: error.code === "ACTION_CONFIG_MISSING" || error.code === "ACTION_PAYLOAD_INVALID" ? 400 : 502 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FEISHU_SEND_FAILED",
          message: "飞书消息发送失败。",
          fix: "请检查 webhook 配置和网络连接。",
        },
      },
      { status: 500 },
    )
  }
}
