import { NextResponse } from "next/server"
import { FeishuBitableError, readFeedbackFromFeishuBitable } from "@/lib/feishu/bitableFeedback"

export async function GET() {
  try {
    const feedbackItems = await readFeedbackFromFeishuBitable()

    return NextResponse.json({
      ok: true,
      feedbackItems,
      sourceLabel: "飞书多维表格",
    })
  } catch (error) {
    if (error instanceof FeishuBitableError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            fix: error.fix,
          },
        },
        { status: error.code === "FEISHU_BITABLE_CONFIG_MISSING" ? 400 : 502 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FEISHU_BITABLE_READ_FAILED",
          message: "读取飞书多维表格失败。",
          fix: "请检查飞书应用配置、表格授权和网络连接。",
        },
      },
      { status: 500 },
    )
  }
}
