import { NextResponse } from "next/server"
import { createTapdWorkItemsForResult, AgentActionError } from "@/lib/agent/agentActionExecutor"
import type { TapdWorkItemsConfigInput } from "@/lib/tapd/createTapdWorkItems"
import type { AgentResult } from "@/types/product"

type CreateTapdWorkItemsRequestBody = {
  result?: AgentResult
  selectedTaskIndexes?: number[]
  runId?: string
  tapdConfig?: TapdWorkItemsConfigInput
}

export async function POST(request: Request) {
  let body: CreateTapdWorkItemsRequestBody

  try {
    body = (await request.json()) as CreateTapdWorkItemsRequestBody
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

  if (!body.result?.engineeringTasks?.length) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ENGINEERING_TASKS_MISSING",
          message: "缺少研发任务草稿。",
          fix: "请先运行 Agent 生成研发任务草稿，再创建 TAPD 需求/任务。",
        },
      },
      { status: 400 },
    )
  }

  const selectedTaskIndexes = body.selectedTaskIndexes ?? body.result.engineeringTasks.map((_, index) => index)

  try {
    const { created, trace } = await createTapdWorkItemsForResult(body.result, selectedTaskIndexes, body.runId, body.tapdConfig)

    return NextResponse.json({
      ok: true,
      created,
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
          code: "TAPD_CREATE_FAILED",
          message: "TAPD 需求/任务创建失败。",
          fix: "请检查 TAPD API 账号、项目 ID 和网络连接。",
        },
      },
      { status: 500 },
    )
  }
}
