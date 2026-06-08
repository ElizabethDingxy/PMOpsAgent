import { createDeepSeekChatCompletion, DeepSeekClientError } from "@/lib/llm/deepseekClient"

export type FeishuIntentCommand =
  | {
      type: "help" | "self_intro" | "status" | "unknown"
    }
  | {
      type: "analyze_sample"
    }
  | {
      type: "analyze_bitable"
      url?: string
      tableName?: string
    }
  | {
      type: "list_bitable_tables"
    }
  | {
      type: "list_workspace_tables"
    }
  | {
      type: "oauth_authorize"
    }
  | {
      type: "oauth_status"
    }
  | {
      type: "search_oauth_bases"
      query?: string
    }
  | {
      type: "list_oauth_bases"
    }
  | {
      type: "list_tapd_projects"
    }
  | {
      type: "discuss_decision"
      query?: string
    }

type IntentRouterResponse = {
  intent?: string
  confidence?: number
  tableName?: string
  baseQuery?: string
  discussionQuery?: string
  url?: string
}

const allowedIntents = new Set([
  "help",
  "self_intro",
  "status",
  "oauth_authorize",
  "oauth_status",
  "list_oauth_bases",
  "search_oauth_bases",
  "list_bitable_tables",
  "list_workspace_tables",
  "list_tapd_projects",
  "discuss_decision",
  "analyze_sample",
  "analyze_bitable",
  "unknown",
])

const intentRouterSystemPrompt = `你是 PMOpsAgent 的意图路由器。
你的任务是把用户在飞书群里 @ 机器人的自然语言，转换成固定工具意图。

只允许输出合法 JSON，不要 Markdown，不要代码块。

可选 intent：
- help：用户想查看帮助、菜单、能做什么。
- self_intro：用户在问你是谁、你是干什么的、介绍一下自己。
- status：用户想查看系统状态、运行状态。
- oauth_authorize：用户想获取授权链接、重新授权飞书。
- oauth_status：用户想检查授权状态、权限、scope。
- list_oauth_bases：用户想列出所有 Base、多维表格 Base、多维表格空间下有哪些 Base、可访问的 Base。
- search_oauth_bases：用户想按关键词搜索 Base。必须提取 baseQuery。
- list_bitable_tables：用户想列出当前固定 Base 下的数据表。
- list_workspace_tables：用户想列出已配置 workspace 索引下的数据表。
- list_tapd_projects：用户想列出 TAPD 项目、TAPD workspace、当前可用的 TAPD 项目，或询问 TAPD 下有哪些项目。
- discuss_decision：用户想讨论、质疑或理解某个 PRD / MVP / RICE / TAPD 任务判断，例如“为什么是 P0”“优先级太低了”“依据是什么”“我觉得这个不该进 MVP”。必须提取 discussionQuery。
- analyze_sample：用户想用示例反馈跑分析。
- analyze_bitable：用户想分析某个飞书表格、某个数据表、某个 Base/表名、或直接给了飞书多维表格链接。尽量提取 tableName 或 url。
- unknown：无法判断，或用户要求创建 PRD、创建 TAPD、发送飞书消息等需要审批卡片确认的高影响动作。

安全要求：
1. 不要生成未列出的 intent。
2. 不要把“创建文档/创建任务/发送消息/审批通过”路由到执行工具，这些必须返回 unknown。
3. 如果用户说“所有 Base”“全部 Base”“有哪些 Base”“可访问的 Base”，返回 list_oauth_bases。
4. 如果用户说“搜索/查找 Base + 关键词”，返回 search_oauth_bases，并把关键词放入 baseQuery。
5. 如果用户说“分析 + 表名/Base名/链接”，返回 analyze_bitable。
6. 如果用户询问 TAPD 有哪些项目、列出 TAPD 项目、当前能用哪些 TAPD workspace，返回 list_tapd_projects。
7. 如果用户在质疑或追问已有分析结论、任务优先级、MVP 范围、PRD 内容或 TAPD 任务依据，返回 discuss_decision。不要路由到修改或创建工具。

输出形状：
{
  "intent": "list_oauth_bases",
  "confidence": 0.9,
  "tableName": "可选",
  "baseQuery": "可选",
  "discussionQuery": "可选",
  "url": "可选"
}`

export async function routeFeishuNaturalLanguageCommand(text: string): Promise<FeishuIntentCommand | undefined> {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) return undefined

  try {
    const response = await createDeepSeekChatCompletion({
      messages: [
        {
          role: "system",
          content: intentRouterSystemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              text: cleanMentionText(text),
            },
            null,
            2,
          ),
        },
      ],
      temperature: 0,
      timeoutMs: getIntentRouterTimeoutMs(),
    })

    return normalizeIntentRouterResponse(JSON.parse(response) as IntentRouterResponse)
  } catch (error) {
    if (error instanceof DeepSeekClientError) {
      return undefined
    }

    return undefined
  }
}

export function routeFeishuRuleCommand(text: string): FeishuIntentCommand {
  const cleanedText = cleanMentionText(text)
  const normalized = cleanedText.toLowerCase()

  if (!normalized || ["help", "帮助", "菜单"].includes(normalized) || normalized.endsWith(" help")) return { type: "help" }
  if (isSelfIntroPhrase(normalized)) return { type: "self_intro" }
  if (["status", "状态", "进度"].includes(normalized) || normalized.endsWith(" status")) return { type: "status" }

  if (
    ["授权", "授权链接", "飞书授权", "oauth", "oauth authorize", "authorize"].includes(normalized) ||
    normalized.endsWith(" 授权链接")
  ) {
    return { type: "oauth_authorize" }
  }

  if (
    ["授权状态", "oauth状态", "oauth 状态", "oauth status", "授权检查"].includes(normalized) ||
    normalized.endsWith(" 授权状态")
  ) {
    return { type: "oauth_status" }
  }

  if (isListBasePhrase(normalized)) {
    return { type: "list_oauth_bases" }
  }

  if (isListTapdProjectsPhrase(normalized)) {
    return { type: "list_tapd_projects" }
  }

  if (isDecisionDiscussionPhrase(normalized)) {
    return {
      type: "discuss_decision",
      query: cleanedText,
    }
  }

  if (normalized.startsWith("搜索base") || normalized.startsWith("搜索 base") || normalized.startsWith("search base")) {
    return {
      type: "search_oauth_bases",
      query: cleanedText.replace(/^(搜索\s*base|search\s*base)\s*/i, "").trim() || undefined,
    }
  }

  if (
    ["列出空间表格", "空间表格", "空间表格列表", "列出workspace表格", "workspace tables", "list workspace tables"].includes(normalized) ||
    normalized.endsWith(" 列出空间表格") ||
    normalized.endsWith(" workspace tables")
  ) {
    return { type: "list_workspace_tables" }
  }

  if (
    ["列出表格", "表格列表", "有哪些表格", "查看表格", "list tables", "tables"].includes(normalized) ||
    normalized.endsWith(" 列出表格") ||
    normalized.endsWith(" list tables")
  ) {
    return { type: "list_bitable_tables" }
  }

  const isAnalyzeCommand =
    normalized === "分析" ||
    normalized.startsWith("分析 ") ||
    normalized.includes(" 分析 ") ||
    normalized.startsWith("analyze ") ||
    normalized === "analyze"

  if (isAnalyzeCommand) {
    const url = extractFirstUrl(cleanedText)
    const targetText = extractAnalyzeTarget(cleanedText)

    if (normalized.includes("示例") || normalized.includes("样例") || normalized.includes("sample")) {
      return { type: "analyze_sample" }
    }

    if (url || normalized.includes("表格") || normalized.includes("多维") || normalized.includes("bitable")) {
      return {
        type: "analyze_bitable",
        url,
        tableName: url ? undefined : extractTableNameFromAnalyzeTarget(targetText),
      }
    }

    if (targetText) {
      return {
        type: "analyze_bitable",
        tableName: extractTableNameFromAnalyzeTarget(targetText),
      }
    }
  }

  return { type: "unknown" }
}

export function cleanMentionText(text: string) {
  return text
    .replace(/<at\b[^>]*>.*?<\/at>/gi, " ")
    .replace(/@PMOps\s*Agent/gi, " ")
    .replace(/@PMOpsAgent/gi, " ")
    .replace(/PMOps\s*Agent/gi, " ")
    .replace(/PMOpsAgent/gi, " ")
    .replace(/@_user_\d+/gi, " ")
    .replace(/@\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeIntentRouterResponse(response: IntentRouterResponse): FeishuIntentCommand | undefined {
  const intent = response.intent?.trim()
  const confidence = typeof response.confidence === "number" ? response.confidence : 0

  if (!intent || !allowedIntents.has(intent) || confidence < 0.55) return undefined

  if (intent === "search_oauth_bases") {
    return {
      type: "search_oauth_bases",
      query: normalizeOptionalString(response.baseQuery),
    }
  }

  if (intent === "analyze_bitable") {
    return {
      type: "analyze_bitable",
      url: normalizeOptionalString(response.url),
      tableName: normalizeOptionalString(response.url) ? undefined : normalizeOptionalString(response.tableName),
    }
  }

  if (intent === "help") return { type: "help" }
  if (intent === "self_intro") return { type: "self_intro" }
  if (intent === "status") return { type: "status" }
  if (intent === "oauth_authorize") return { type: "oauth_authorize" }
  if (intent === "oauth_status") return { type: "oauth_status" }
  if (intent === "list_oauth_bases") return { type: "list_oauth_bases" }
  if (intent === "list_bitable_tables") return { type: "list_bitable_tables" }
  if (intent === "list_workspace_tables") return { type: "list_workspace_tables" }
  if (intent === "list_tapd_projects") return { type: "list_tapd_projects" }
  if (intent === "discuss_decision") {
    return {
      type: "discuss_decision",
      query: normalizeOptionalString(response.discussionQuery),
    }
  }
  if (intent === "analyze_sample") return { type: "analyze_sample" }

  return { type: "unknown" }
}

function isSelfIntroPhrase(normalized: string) {
  const compact = normalized.replace(/\s+/g, "")

  return (
    ["你是谁", "你是谁?", "你是谁？", "介绍一下自己", "介绍下自己", "自我介绍", "你是干嘛的", "你是做什么的"].includes(compact) ||
    compact.includes("你能做什么") ||
    compact.includes("你可以做什么") ||
    compact.includes("你有什么能力") ||
    compact.includes("你会做什么")
  )
}

function isListTapdProjectsPhrase(normalized: string) {
  const compact = normalized.replace(/\s+/g, "")
  const mentionsTapd = compact.includes("tapd")
  const mentionsProject =
    compact.includes("项目") ||
    compact.includes("project") ||
    compact.includes("workspace") ||
    compact.includes("空间")
  const asksList =
    compact.includes("哪些") ||
    compact.includes("有哪些") ||
    compact.includes("哪几个") ||
    compact.includes("几个") ||
    compact.includes("列出") ||
    compact.includes("列表") ||
    compact.includes("可用") ||
    compact.includes("能用") ||
    compact.includes("当前") ||
    compact.includes("查看")

  return mentionsTapd && mentionsProject && asksList
}

function isListBasePhrase(normalized: string) {
  const compact = normalized.replace(/\s+/g, "")

  return (
    ["列出我的base", "我的base", "列出base", "listbases", "mybases"].includes(compact) ||
    (compact.includes("base") && compact.includes("列出")) ||
    (compact.includes("base") && compact.includes("所有")) ||
    (compact.includes("base") && compact.includes("全部")) ||
    (compact.includes("base") && compact.includes("有哪些")) ||
    (compact.includes("多维表格") && compact.includes("有哪些")) ||
    (compact.includes("多维表格") && compact.includes("所有")) ||
    compact.endsWith("listbases")
  )
}

function isDecisionDiscussionPhrase(normalized: string) {
  const compact = normalized.replace(/\s+/g, "")
  const mentionsDecisionObject =
    compact.includes("优先级") ||
    compact.includes("p0") ||
    compact.includes("p1") ||
    compact.includes("p2") ||
    compact.includes("tapd") ||
    compact.includes("任务") ||
    compact.includes("prd") ||
    compact.includes("mvp") ||
    compact.includes("rice") ||
    compact.includes("范围") ||
    compact.includes("需求")
  const asksReason =
    compact.includes("为什么") ||
    compact.includes("依据") ||
    compact.includes("理由") ||
    compact.includes("原因") ||
    compact.includes("你觉得") ||
    compact.includes("怎么看") ||
    compact.includes("是否") ||
    compact.includes("该不该") ||
    compact.includes("合理") ||
    compact.includes("太低") ||
    compact.includes("太高") ||
    compact.includes("不该") ||
    compact.includes("应该")

  return mentionsDecisionObject && asksReason
}

function extractFirstUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s<>"']+/i)
  return match?.[0]
}

function extractAnalyzeTarget(text: string) {
  return text
    .replace(/https?:\/\/[^\s<>"']+/gi, " ")
    .replace(/^(分析|analyze)\s*/i, "")
    .replace(/^(一下|下|这个|这张|表格|多维表格)\s*/i, "")
    .replace(/^(表格|多维|bitable)\s*/i, "")
    .trim()
}

function extractTableNameFromAnalyzeTarget(targetText: string) {
  return targetText.replace(/^(表格|多维表格|多维|bitable)\s*/i, "").trim() || undefined
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function getIntentRouterTimeoutMs() {
  const rawValue = process.env.DEEPSEEK_ROUTER_TIMEOUT_MS?.trim()
  if (!rawValue) return 12_000

  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || parsed < 1000) return 12_000

  return parsed
}
