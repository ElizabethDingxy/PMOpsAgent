import { NextResponse } from "next/server"
import { exchangeFeishuOAuthCode, FeishuOAuthError } from "@/lib/feishu/oauth"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (!code) {
    return htmlResponse("飞书授权失败", "回调地址缺少 code。请回到飞书群里重新发送“@PMOpsAgent 授权链接”。", 400)
  }

  try {
    await exchangeFeishuOAuthCode(code, state ?? undefined)

    return htmlResponse("飞书授权成功", "PMOpsAgent 已保存用户授权。你可以回到飞书群里发送“@PMOpsAgent 搜索 Base”或“@PMOpsAgent 列出我的 Base”。")
  } catch (error) {
    if (error instanceof FeishuOAuthError) {
      return htmlResponse("飞书授权失败", `${error.message} ${error.fix}`, 400)
    }

    return htmlResponse("飞书授权失败", "发生未知错误。请稍后重试。", 500)
  }
}

function htmlResponse(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { max-width: 560px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 28px; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0; line-height: 1.8; color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
      </section>
    </main>
  </body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
