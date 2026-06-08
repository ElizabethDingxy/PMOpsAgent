import { NextResponse } from "next/server"
import { createPrdDocumentForResult, AgentActionError } from "@/lib/agent/agentActionExecutor"
import type { AgentResult } from "@/types/product"

type CreatePrdDocumentRequestBody = {
  result?: AgentResult
  runId?: string
}

export async function POST(request: Request) {
  let body: CreatePrdDocumentRequestBody

  try {
    body = (await request.json()) as CreatePrdDocumentRequestBody
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

  if (!body.result?.prd) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "PRD_DRAFT_MISSING",
          message: "缺少 PRD 草稿。",
          fix: "请先运行 Agent 生成 PRD 草稿，再创建飞书文档。",
        },
      },
      { status: 400 },
    )
  }

  try {
    const { document, trace } = await createPrdDocumentForResult(body.result, body.runId)

    return NextResponse.json({
      ok: true,
      document,
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
          code: "FEISHU_DOC_CREATE_FAILED",
          message: "飞书 PRD 文档创建失败。",
          fix: "请检查飞书应用配置、文档权限和网络连接。",
        },
      },
      { status: 500 },
    )
  }
}
