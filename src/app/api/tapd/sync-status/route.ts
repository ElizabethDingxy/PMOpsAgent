import { NextResponse } from "next/server"
import { syncTapdStatusForRun, AgentActionError } from "@/lib/agent/agentActionExecutor"

export async function POST(request: Request) {
  let body: { runId?: string }

  try {
    body = await request.json()
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

  const { runId } = body

  if (!runId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RUN_ID_MISSING",
          message: "缺少分析运行记录的 runId。",
          fix: "请在请求体中附带 runId 字段。",
        },
      },
      { status: 400 },
    )
  }

  try {
    const result = await syncTapdStatusForRun(runId)

    return NextResponse.json({
      ok: true,
      run: result.run,
      trace: result.trace,
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
        { status: error.code === "ACTION_PAYLOAD_INVALID" ? 400 : 502 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SYNC_STATUS_FAILED",
          message: "同步 TAPD 状态失败。",
          fix: "请稍后重试，或检查 TAPD 配置。",
        },
      },
      { status: 500 },
    )
  }
}
