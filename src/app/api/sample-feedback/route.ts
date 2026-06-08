import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "sample-feedback.csv")
    const csvText = await readFile(filePath, "utf8")

    return new NextResponse(csvText, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
      },
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SAMPLE_FEEDBACK_NOT_FOUND",
          message: "示例反馈文件不存在，请确认 data/sample-feedback.csv 已创建。",
        },
      },
      { status: 500 },
    )
  }
}
