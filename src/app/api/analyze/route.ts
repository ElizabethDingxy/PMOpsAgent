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

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: AnalyzeRequestBody

  try {
    body = (await request.json()) as AnalyzeRequestBody
  } catch {
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        code: "INVALID_JSON",
        message: "请求体不是合法 JSON。",
        fix: "请检查前端请求格式，确保 body 是 JSON。",
      })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
        status: 400,
      }
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: any) {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Ignore write errors if the client has already disconnected
        }
      }

      try {
        const run = await runAgent({
          feedbackItems: body.feedbackItems ?? [],
          productHint: body.productHint,
          businessContext: body.businessContext,
          forceMock: body.forceMock,
          onProgress: (event) => {
            sendEvent("progress", event)
          },
        })

        const savedRun = await saveAgentRun({
          feedbackItems: body.feedbackItems ?? [],
          businessContext: body.businessContext,
          run,
          sourceLabel: body.sourceLabel,
        })

        sendEvent("completed", {
          result: savedRun.run.result,
          run: savedRun.run,
          savedRun,
        })
        controller.close()
      } catch (error) {
        if (error instanceof AgentRunError) {
          sendEvent("error", {
            code: error.code,
            message: error.message,
            fix: error.fix,
            trace: error.trace,
          })
        } else {
          sendEvent("error", {
            code: "ANALYZE_FAILED",
            message: error instanceof Error ? error.message : "Agent 分析失败。",
            fix: "请稍后重试，或先使用 Mock 模式演示。",
          })
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  })
}
