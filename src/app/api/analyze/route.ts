import { NextResponse } from "next/server"
import { AgentRunError, runAgent } from "@/lib/agent/runAgent"
import { saveAgentRun } from "@/lib/runs/runStore"
import type { BusinessContext, FeedbackItem } from "@/types/product"

type AnalyzeRequestBody = {
  feedbackItems?: FeedbackItem[]
  productHint?: string
  businessContext?: BusinessContext
  forceMock?: boolean
  sourceLabel?: string
}

export async function POST(request: Request) {
  let body: AnalyzeRequestBody

  try {
    body = (await request.json()) as AnalyzeRequestBody
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

  try {
    const run = await runAgent({
      feedbackItems: body.feedbackItems ?? [],
      productHint: body.productHint,
      businessContext: body.businessContext,
      forceMock: body.forceMock,
    })
    const savedRun = await saveAgentRun({
      feedbackItems: body.feedbackItems ?? [],
      businessContext: body.businessContext,
      run,
      sourceLabel: body.sourceLabel,
    })

    return NextResponse.json({
      ok: true,
      result: savedRun.run.result,
      run: savedRun.run,
      savedRun,
    })
  } catch (error) {
    if (error instanceof AgentRunError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            fix: error.fix,
            trace: error.trace,
          },
        },
        { status: error.code === "INVALID_INPUT" ? 400 : 502 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ANALYZE_FAILED",
          message: "Agent 分析失败。",
          fix: "请稍后重试，或先使用 Mock 模式演示。",
        },
      },
      { status: 500 },
    )
  }
}
