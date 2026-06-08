import { NextResponse } from "next/server"
import { createFeishuOAuthAuthorizeUrl, FeishuOAuthError } from "@/lib/feishu/oauth"

export async function GET() {
  try {
    const url = await createFeishuOAuthAuthorizeUrl()

    return NextResponse.redirect(url)
  } catch (error) {
    if (error instanceof FeishuOAuthError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            fix: error.fix,
          },
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FEISHU_OAUTH_START_FAILED",
          message: "生成飞书 OAuth 授权链接失败。",
          fix: "请检查飞书应用配置和本地环境变量。",
        },
      },
      { status: 500 },
    )
  }
}
