import { readFile } from "node:fs/promises"
import path from "node:path"
import { executeAgentAction } from "@/lib/agent/agentActionExecutor"
import { runAgent } from "@/lib/agent/runAgent"
import { createFeishuApprovalRecord } from "@/lib/approvals/approvalStore"
import { parseFeedbackCsv } from "@/lib/csv/parseFeedbackCsv"
import { createDeepSeekChatCompletion, DeepSeekClientError } from "@/lib/llm/deepseekClient"
import {
  type FeishuBitableOAuthTable,
  FeishuBitableError,
  listFeishuBitableTables,
  listFeishuBitableTablesByAppToken,
  listFeishuBitableWorkspaceTables,
  readFeedbackFromFeishuBitable,
  readFeedbackFromFeishuBitableTableName,
  readFeedbackFromFeishuBitableUrl,
  readFeedbackFromFeishuBitableWithToken,
  readFeedbackFromFeishuWorkspaceTableName,
} from "@/lib/feishu/bitableFeedback"
import { cleanMentionText } from "@/lib/feishu/intentRouter"
import {
  createFeishuOAuthAuthorizeUrl,
  FeishuOAuthError,
  getFeishuOAuthStatus,
  getValidFeishuUserAccessToken,
  listFeishuBitableBases,
  searchFeishuBitableBases,
} from "@/lib/feishu/oauth"
import {
  clearPendingConversationAction,
  appendConversationToolObservations,
  appendConversationTurns,
  readConversationSession,
  setPendingConversationAction,
  type ConversationSession,
} from "@/lib/memory/conversationSessionStore"
import {
  compareProductMemories,
  findDuplicateProductMemories,
  type ProductMemory,
  type ProductMemoryComparison,
  listProductMemories,
  readProductMemoryByKey,
  type ProductMemoryDuplicateGroup,
  searchProductMemories,
  searchProductMemoryContext,
} from "@/lib/memory/productMemoryStore"
import { replyFeishuApprovalCard } from "@/lib/feishu/sendApprovalCard"
import { listAgentRunSummaries, readSavedRunById, saveAgentRun } from "@/lib/runs/runStore"
import { listTapdProjects } from "@/lib/tapd/createTapdWorkItems"
import type { DemandCluster, EngineeringTask, FeedbackItem, RiceItem, SavedAgentRun } from "@/types/product"

type ConversationToolName =
  | "read_latest_run"
  | "search_run_objects"
  | "list_product_memories"
  | "search_product_memories"
  | "read_product_memories"
  | "search_product_memory_context"
  | "compare_product_memories"
  | "find_duplicate_product_memories"
  | "prepare_merge_product_memories"
  | "prepare_approve_run"
  | "prepare_reject_run"
  | "prepare_create_prd_document"
  | "prepare_create_tapd_work_items"
  | "prepare_send_feishu_review"
  | "execute_pending_action"
  | "cancel_pending_action"
  | "help"
  | "status"
  | "oauth_authorize"
  | "oauth_status"
  | "list_bitable_tables"
  | "list_workspace_tables"
  | "list_oauth_bases"
  | "list_oauth_bases_with_tables"
  | "search_oauth_bases"
  | "list_tapd_projects"
  | "analyze_sample"
  | "analyze_bitable"

type ConversationPlan = {
  toolCalls?: Array<{
    name?: ConversationToolName
    arguments?: {
      query?: string
    }
  }>
  replyGuidance?: string
}

type ConversationFinalResponse = {
  reply?: string
}

type ExecutedToolResult = {
  name: ConversationToolName
  ok: boolean
  data?: unknown
  error?: string
}

type NormalizedToolCall = {
  name: ConversationToolName
  arguments: {
    query: string
  }
}

type SearchResult = {
  tasks: Array<EngineeringTask & { score: number }>
  riceItems: Array<RiceItem & { score: number }>
  clusters: Array<DemandCluster & { score: number }>
  evidence: Array<Pick<FeedbackItem, "id" | "content" | "source" | "userType">>
}

type ConversationAgentOptions = {
  replyMessageId?: string
  sessionKey?: string
  highRiskOperationRequested?: boolean
}

const sampleFeedbackPath = path.join(process.cwd(), "data", "sample-feedback.csv")

const conversationPlannerPrompt = `你是 PMOpsAgent 的 conversationAgent。
你的任务不是把用户话术映射到固定指令，而是根据用户自然语言规划一组工具调用。

可用工具：
1. read_latest_run：读取最近一次分析结果，适用于讨论 PRD、MVP、RICE、研发任务、TAPD 草稿、历史结论。
2. search_run_objects：在最近一次分析结果中搜索相关任务、RICE 条目、需求主题和用户证据。需要 query。
3. list_product_memories：列出 PMOpsAgent 已沉淀的产品项目记忆。
4. search_product_memories：按模糊名称搜索产品项目记忆。需要 query。
5. read_product_memories：读取用户指定或最近对话中提到的项目记忆详情。适用于“这几个项目”“合并 A 和 B”“读取 project_xxx”。query 可选。
6. search_product_memory_context：在项目记忆中搜索 PRD、MVP、RICE、任务、用户证据。需要 query。
7. compare_product_memories：比较最近读取/搜索/对话提到的多个项目，判断是否本质重复，并给出合并风险与推荐保留项。query 可选。
8. find_duplicate_product_memories：辅助发现可能重复的项目记忆。注意：这不是合并的前置硬门槛；用户指定项目时应优先 read_product_memories + compare_product_memories。
9. prepare_merge_product_memories：准备合并项目记忆，只写入待确认动作，不真正合并。适用于“合并这几个项目”“按刚才方案合并”“确认这个合并方案”。query 可选；必须基于 read/compare/历史对话定位到的项目。
10. prepare_approve_run：准备通过最近一次分析审批，只写入待确认动作。
11. prepare_reject_run：准备驳回最近一次分析审批，只写入待确认动作。
12. prepare_create_prd_document：准备为最近一次分析创建飞书 PRD，只写入待确认动作。
13. prepare_create_tapd_work_items：准备为最近一次分析创建 TAPD 需求与任务，只写入待确认动作。
14. prepare_send_feishu_review：准备发送最近一次分析的飞书评审摘要，只写入待确认动作。
15. execute_pending_action：执行当前待确认动作。只适用于用户明确确认，例如“确认”“确认合并”“执行吧”。
16. cancel_pending_action：取消当前待确认动作。
17. help：用户问你能做什么、帮助、菜单。
18. status：用户问当前状态、能力状态。
19. oauth_authorize：用户要飞书授权链接。
20. oauth_status：用户要检查飞书授权状态。
21. list_bitable_tables：列出当前固定 Base 的数据表。
22. list_workspace_tables：列出已配置 workspace 索引下的数据表。
23. list_oauth_bases：列出授权用户可访问的 Base。
24. list_oauth_bases_with_tables：列出授权用户可访问的 Base，并逐个读取 Base 下的数据表、table_id。适用于用户要“键名”“table_id”“各自有哪些表”“对应信息”。
25. search_oauth_bases：按关键词搜索 Base。需要 query。
26. list_tapd_projects：列出 TAPD 项目。
27. analyze_sample：用本地示例反馈运行分析。
28. analyze_bitable：分析飞书多维表格。可以从用户文本提取表名、Base名/表名或链接，query 放目标。

规划原则：
1. 用户问“为什么、依据、怎么看、是否合理、优先级、MVP、PRD、TAPD 任务”时，通常先 read_latest_run，再 search_run_objects。
2. 如果用户提到某个项目/产品/Base 名，或问“某个项目”的历史判断，优先 search_product_memory_context，而不是只看最近一次分析。
3. 用户问有哪些项目记忆、当前记住了哪些产品，用 list_product_memories。
4. 用户要切换、查找、定位某个项目，用 search_product_memories。
5. 用户要求筛选重复项目、找重复项目，可以用 find_duplicate_product_memories；但用户明确说要合并某几个项目时，不要把查重结果当硬门槛。
6. 用户要求合并项目时，优先规划 read_product_memories，再 compare_product_memories，最后 prepare_merge_product_memories。只有用户明确确认已有 pendingAction 时才 execute_pending_action。
7. 用户明确确认当前待确认动作时，用 execute_pending_action；用户取消时，用 cancel_pending_action。
8. 用户补充背景并要求重新评估时，先 search_product_memory_context 或 read_latest_run，再 search_run_objects；不要直接修改正式 PRD/TAPD。
9. 用户问有哪些 Base，用 list_oauth_bases；如果同时要求键名、表名、table_id、各自信息，用 list_oauth_bases_with_tables。
10. 用户问 TAPD 有哪些项目，用 list_tapd_projects。
11. 用户要分析示例反馈，用 analyze_sample；用户要分析某个 Base、表名或链接，用 analyze_bitable。
12. 用户要求通过/驳回审批、创建飞书 PRD、创建 TAPD、发送评审摘要时，只能规划 prepare_* 工具，不能直接 execute_pending_action，除非用户已经明确确认当前待确认动作。
13. 高影响操作，例如修改 PRD、修改 TAPD、创建文档、创建任务、发送群消息，只能先生成建议或确认请求，不能规划直接执行修改。

只输出合法 JSON，不要 Markdown，不要代码块。
输出形状：
{
  "toolCalls": [
    {
      "name": "read_latest_run",
      "arguments": {
        "query": "可选"
      }
    }
  ],
  "replyGuidance": "给最终回复模型的简短说明"
}`

const conversationResponderPrompt = `你是 PMOpsAgent，一个会和用户讨论产品判断的 AI 产品经理助手。
你会基于工具结果回复用户，而不是机械套模板。

回复要求：
1. 像产品经理在群里讨论问题，语气自然、简洁、有判断。
2. 如果用户只是问原因，要解释依据、证据和不确定性。
3. 如果用户补充了新背景，要重新评估，并明确说明这个新信息如何改变判断。
4. 不要一味迎合用户；如果证据不足，要说还缺什么。
5. 不要自动承诺已经修改 PRD 或 TAPD。
6. 如果建议修改，给出“建议修改差异”，并说明需要用户确认后才应用。
7. 如果用户查询 Base 的键名，要说明 Base 键名是 app_token；如果工具结果包含 tables，也要列出每个表的 table_id。
8. 如果工具结果包含 analysisRun，说明分析已完成；如果审批卡片已发送，告诉用户可以在卡片上审批。
9. 如果 safety.highRiskOperationRequested 为 true，明确说明正式修改、创建、发送或审批需要用户确认，当前只做解释、方案或草稿。
10. 如果工具结果包含 productMemory，要先说明你定位到了哪个项目；如果有多个候选，要给出候选并请用户确认。
11. 如果 conversation.pendingAction 存在，要把它当作上一轮对话的上下文，理解“确认”“就这个”“先处理它”这类短句。
12. 回复要直接回答用户，不要暴露内部工具调用名称。
13. 只输出合法 JSON，不要 Markdown，不要代码块。

输出形状：
{
  "reply": "要回复到飞书群的文本"
}`

export async function runFeishuConversationAgent(text: string, options: ConversationAgentOptions = {}): Promise<string> {
  const cleanedText = cleanMentionText(text)
  const session = await readConversationSession(options.sessionKey)

  if (!cleanedText) {
    return "我在。你可以直接告诉我要分析哪张表，或者继续追问上一次 PRD / TAPD 任务里的判断依据。"
  }

  const plan = await createConversationPlan(cleanedText, session)
  const toolResults = await executeConversationTools(plan, cleanedText, options, session)
  await appendConversationToolObservations(
    options.sessionKey,
    toolResults.map((result) => ({
      name: result.name,
      ok: result.ok,
      data: result.data,
      error: result.error,
    })),
  )
  const refreshedSession = await readConversationSession(options.sessionKey)
  const reply = await createConversationReply(cleanedText, plan, toolResults, options, refreshedSession)
  const finalReply = reply || fallbackConversationReply(cleanedText, toolResults)

  await appendConversationTurns(options.sessionKey, [
    { role: "user", text: cleanedText, timestamp: new Date().toISOString() },
    { role: "assistant", text: finalReply, timestamp: new Date().toISOString() },
  ])

  return finalReply
}

async function createConversationPlan(cleanedText: string, session: ConversationSession): Promise<ConversationPlan> {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    return fallbackPlan(cleanedText, session)
  }

  try {
    const response = await createDeepSeekChatCompletion({
      messages: [
        {
          role: "system",
          content: conversationPlannerPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              text: cleanedText,
              conversation: compactConversationForPlanner(session),
            },
            null,
            2,
          ),
        },
      ],
      temperature: 0,
      timeoutMs: getConversationAgentTimeoutMs(),
    })

    return normalizePlan(JSON.parse(response) as ConversationPlan, cleanedText)
  } catch {
    return fallbackPlan(cleanedText, session)
  }
}

async function executeConversationTools(plan: ConversationPlan, cleanedText: string, options: ConversationAgentOptions, session: ConversationSession): Promise<ExecutedToolResult[]> {
  const calls = normalizeToolCalls(plan, cleanedText)
  const results: ExecutedToolResult[] = []
  let latestRun: SavedAgentRun | undefined

  for (const call of calls) {
    try {
      if (call.name === "read_latest_run") {
        latestRun = await readLatestSavedRun()
        results.push({
          name: call.name,
          ok: true,
          data: compactSavedRun(latestRun),
        })
        continue
      }

      if (call.name === "search_run_objects") {
        latestRun = latestRun ?? (await readLatestSavedRun())
        results.push({
          name: call.name,
          ok: true,
          data: searchSavedRun(latestRun, call.arguments?.query || cleanedText),
        })
        continue
      }

      if (call.name === "list_product_memories") {
        const memories = await listProductMemories()
        results.push({
          name: call.name,
          ok: true,
          data: {
            productMemory: true,
            memories: memories.slice(0, 20).map((memory) => ({
              key: memory.key,
              displayName: memory.displayName,
              aliases: memory.aliases.slice(0, 6),
              sourceLabels: memory.sourceLabels.slice(0, 6),
              latestRunId: memory.latestRunId,
              summary: memory.summary,
              updatedAt: memory.updatedAt,
            })),
            totalCount: memories.length,
          },
        })
        continue
      }

      if (call.name === "search_product_memories") {
        const matches = await searchProductMemories(call.arguments?.query || cleanedText)
        results.push({
          name: call.name,
          ok: true,
          data: {
            productMemory: true,
            query: call.arguments?.query || cleanedText,
            matches: matches.map((match) => ({
              key: match.memory.key,
              displayName: match.memory.displayName,
              aliases: match.memory.aliases.slice(0, 6),
              sourceLabels: match.memory.sourceLabels.slice(0, 6),
              latestRunId: match.memory.latestRunId,
              summary: match.memory.summary,
              score: match.score,
              matchedFields: match.matchedFields,
              updatedAt: match.memory.updatedAt,
            })),
          },
        })
        continue
      }

      if (call.name === "read_product_memories") {
        const memories = await resolveProductMemoriesForTool(call.arguments?.query || cleanedText, session)
        results.push({
          name: call.name,
          ok: memories.length >= 2,
          data: {
            productMemory: true,
            query: call.arguments?.query || cleanedText,
            memories: memories.map(compactProductMemoryDetail),
          },
          error: memories.length >= 2 ? undefined : "没有定位到至少两个可比较的项目。请给出项目名或 project_xxx key。",
        })
        continue
      }

      if (call.name === "compare_product_memories") {
        const memories = await resolveProductMemoriesForTool(call.arguments?.query || cleanedText, session)
        if (memories.length < 2) {
          results.push({
            name: call.name,
            ok: false,
            error: "没有足够的项目可比较。请先说明要合并的项目名或 key。",
          })
          continue
        }

        const comparison = await compareProductMemories(memories.map((memory: ProductMemory) => memory.key))
        results.push({
          name: call.name,
          ok: true,
          data: {
            productMemory: true,
            comparison: compactProductMemoryComparison(comparison),
          },
        })
        continue
      }

      if (call.name === "search_product_memory_context") {
        const contexts = await searchProductMemoryContext({
          query: call.arguments?.query || cleanedText,
          projectQuery: inferProjectQuery(cleanedText),
        })
        results.push({
          name: call.name,
          ok: true,
          data: {
            productMemory: true,
            query: call.arguments?.query || cleanedText,
            contexts,
          },
        })
        continue
      }

      if (call.name === "find_duplicate_product_memories") {
        const groups = await findDuplicateProductMemories(extractDuplicateQuery(call.arguments?.query || cleanedText))
        results.push({
          name: call.name,
          ok: true,
          data: {
            productMemory: true,
            duplicateGroups: groups.slice(0, 10),
          },
        })
        continue
      }

      if (call.name === "prepare_merge_product_memories") {
        const group = await resolveDuplicateGroupForMerge(call.arguments?.query || cleanedText, session, results)
        if (!group) {
          results.push({
            name: call.name,
            ok: false,
            error: "没有找到可准备合并的重复项目组。",
          })
          continue
        }

        const [target, ...sources] = group.memories
        if (!target || sources.length === 0) {
          results.push({
            name: call.name,
            ok: false,
            error: "找到的重复项目组不足以合并。",
          })
          continue
        }

        const pendingAction = await setPendingConversationAction(options.sessionKey, {
          type: "merge_product_memories",
          summary: `合并「${group.title}」重复项目，保留 ${target.key}，合入 ${sources.map((item: ProductMemoryDuplicateGroup["memories"][number]) => item.key).join("、")}`,
          payload: {
            targetKey: target.key,
            sourceKeys: sources.map((item: ProductMemoryDuplicateGroup["memories"][number]) => item.key),
          },
        })

        results.push({
          name: call.name,
          ok: true,
          data: {
            pendingAction,
            duplicateGroup: group,
            target,
            sources,
          },
        })
        continue
      }

      if (
        call.name === "prepare_approve_run" ||
        call.name === "prepare_reject_run" ||
        call.name === "prepare_create_prd_document" ||
        call.name === "prepare_create_tapd_work_items" ||
        call.name === "prepare_send_feishu_review"
      ) {
        const savedRun = await resolveRunForPendingAction(call.arguments?.query || cleanedText)
        const pendingAction = await setPendingConversationAction(options.sessionKey, buildRunPendingAction(call.name, savedRun))
        results.push({
          name: call.name,
          ok: true,
          data: {
            pendingAction,
            run: {
              id: savedRun.id,
              productName: savedRun.run.result.productName,
              summary: savedRun.run.result.summary,
              sourceLabel: savedRun.sourceLabel,
              taskCount: savedRun.run.result.engineeringTasks.length,
            },
          },
        })
        continue
      }

      if (call.name === "execute_pending_action") {
        if (!session.pendingAction) {
          const recoveredMergeGroup = await resolveDuplicateGroupForMerge(call.arguments?.query || cleanedText, session, results)
          if (recoveredMergeGroup) {
            const [target, ...sources] = recoveredMergeGroup.memories
            if (target && sources.length > 0) {
              const executedAction = {
                type: "merge_product_memories" as const,
                summary: `合并「${recoveredMergeGroup.title}」重复项目，保留 ${target.key}，合入 ${sources.map((item) => item.key).join("、")}`,
                payload: {
                  targetKey: target.key,
                  sourceKeys: sources.map((item) => item.key),
                },
              }
              const executed = await executeAgentAction(executedAction)
              results.push({
                name: call.name,
                ok: true,
                data: {
                  executedAction,
                  recoveredFromConversation: true,
                  duplicateGroup: recoveredMergeGroup,
                  result: executed,
                },
              })
              continue
            }
          }

          results.push({
            name: call.name,
            ok: false,
            error: "当前没有待确认动作。",
          })
          continue
        }

        const executed = await executeAgentAction(session.pendingAction)
        await clearPendingConversationAction(options.sessionKey)
        results.push({
          name: call.name,
          ok: true,
          data: {
            executedAction: session.pendingAction,
            result: executed,
          },
        })
        continue
      }

      if (call.name === "cancel_pending_action") {
        const cancelledAction = session.pendingAction
        await clearPendingConversationAction(options.sessionKey)
        results.push({
          name: call.name,
          ok: true,
          data: {
            cancelledAction,
          },
        })
        continue
      }

      if (call.name === "help") {
        results.push({
          name: call.name,
          ok: true,
          data: {
            capabilities: [
              "读取飞书多维表格里的用户反馈并生成分析",
              "解释 PRD、MVP、RICE 和 TAPD 任务判断依据",
              "根据补充背景重新评估优先级并生成修改建议",
              "列出 Base、app_token、表名和 table_id",
              "查询 TAPD 项目",
              "分析完成后发送审批卡片",
              "按项目隔离记忆，并能模糊搜索历史 PRD、任务、RICE 和用户证据",
            ],
          },
        })
        continue
      }

      if (call.name === "status") {
        results.push({
          name: call.name,
          ok: true,
          data: {
            mode: process.env.DEEPSEEK_API_KEY?.trim() ? "LLM 模式" : "Mock/降级模式",
            eventBot: "飞书事件机器人已接入 conversationAgent",
            safety: "正式修改、创建、发送和审批需要确认",
          },
        })
        continue
      }

      if (call.name === "oauth_authorize") {
        const authorizeUrl = await createFeishuOAuthAuthorizeUrl()
        results.push({
          name: call.name,
          ok: true,
          data: {
            authorizeUrl,
          },
        })
        continue
      }

      if (call.name === "oauth_status") {
        results.push({
          name: call.name,
          ok: true,
          data: await getFeishuOAuthStatus(),
        })
        continue
      }

      if (call.name === "list_bitable_tables") {
        const tables = await listFeishuBitableTables()
        results.push({
          name: call.name,
          ok: true,
          data: tables,
        })
        continue
      }

      if (call.name === "list_workspace_tables") {
        const tables = await listFeishuBitableWorkspaceTables()
        results.push({
          name: call.name,
          ok: true,
          data: tables,
        })
        continue
      }

      if (call.name === "list_oauth_bases") {
        const bases = await listFeishuBitableBases()
        results.push({
          name: call.name,
          ok: true,
          data: bases.slice(0, 30).map((base) => ({
            title: base.title,
            appToken: base.appToken,
            url: base.url,
          })),
        })
        continue
      }

      if (call.name === "list_oauth_bases_with_tables") {
        const bases = await listFeishuBitableBases()
        const token = await getValidFeishuUserAccessToken()
        const baseDetails = []

        for (const base of bases.slice(0, 20)) {
          try {
            const tables = await listFeishuBitableTablesByAppToken(base.appToken, token)
            baseDetails.push({
              title: base.title,
              appToken: base.appToken,
              url: base.url,
              tables: tables.map((table) => ({
                name: table.name,
                tableId: table.tableId,
              })),
            })
          } catch (error) {
            baseDetails.push({
              title: base.title,
              appToken: base.appToken,
              url: base.url,
              tables: [],
              tableReadError: error instanceof Error ? error.message : "读取表格失败。",
            })
          }
        }

        results.push({
          name: call.name,
          ok: true,
          data: {
            bases: baseDetails,
            truncated: bases.length > 20,
            totalBaseCount: bases.length,
          },
        })
        continue
      }

      if (call.name === "search_oauth_bases") {
        const bases = await searchFeishuBitableBases(call.arguments?.query || cleanedText)
        results.push({
          name: call.name,
          ok: true,
          data: bases.slice(0, 20).map((base) => ({
            title: base.title,
            appToken: base.appToken,
            url: base.url,
          })),
        })
        continue
      }

      if (call.name === "list_tapd_projects") {
        const projects = await listTapdProjects()
        results.push({
          name: call.name,
          ok: true,
          data: projects.slice(0, 30).map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
            url: project.url,
          })),
        })
        continue
      }

      if (call.name === "analyze_sample" || call.name === "analyze_bitable") {
        const loaded = await loadFeedbackForAnalysisTool(call.name, call.arguments?.query || cleanedText)
        const run = await runAgent({
          feedbackItems: loaded.feedbackItems,
          productHint: "由飞书群聊 @机器人触发分析，请生成适合产品评审的简洁结论。",
        })
        const savedRun = await saveAgentRun({
          feedbackItems: loaded.feedbackItems,
          run,
          sourceLabel: loaded.sourceLabel,
        })
        let approvalCard:
          | {
              sent: boolean
              messageId?: string
              error?: string
            }
          | undefined

        if (options.replyMessageId) {
          try {
            const card = await replyFeishuApprovalCard({
              messageId: options.replyMessageId,
              savedRun,
            })
            await createFeishuApprovalRecord({
              runId: savedRun.id,
              cardMessageId: card.messageId,
              sourceLabel: loaded.sourceLabel,
            })
            approvalCard = {
              sent: true,
              messageId: card.messageId,
            }
          } catch (error) {
            approvalCard = {
              sent: false,
              error: error instanceof Error ? error.message : "审批卡片发送失败。",
            }
          }
        }

        results.push({
          name: call.name,
          ok: true,
          data: {
            analysisRun: {
              id: savedRun.id,
              sourceLabel: loaded.sourceLabel,
              mode: run.mode,
              summary: run.result.summary,
              productName: run.result.productName,
              clusterCount: run.result.demandClusters.length,
              taskCount: run.result.engineeringTasks.length,
              topClusters: run.result.demandClusters.slice(0, 3),
              topTasks: run.result.engineeringTasks.slice(0, 5),
            },
            approvalCard,
          },
        })
      }
    } catch (error) {
      results.push({
        name: call.name || "read_latest_run",
        ok: false,
        error: error instanceof Error ? error.message : "工具执行失败。",
      })
    }
  }

  return results
}

async function createConversationReply(
  cleanedText: string,
  plan: ConversationPlan,
  toolResults: ExecutedToolResult[],
  options: ConversationAgentOptions,
  session: ConversationSession,
) {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    return undefined
  }

  try {
    const response = await createDeepSeekChatCompletion({
      messages: [
        {
          role: "system",
          content: conversationResponderPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              userMessage: cleanedText,
              safety: {
                highRiskOperationRequested: Boolean(options.highRiskOperationRequested),
              },
              conversation: {
                recentTurns: session.recentTurns.slice(-6),
                recentToolObservations: compactToolObservations(session).slice(-4),
                pendingAction: session.pendingAction,
              },
              plan,
              toolResults,
            },
            null,
            2,
          ),
        },
      ],
      temperature: 0.25,
      timeoutMs: getConversationAgentTimeoutMs(),
    })
    const parsed = JSON.parse(response) as ConversationFinalResponse

    return typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : undefined
  } catch (error) {
    if (error instanceof DeepSeekClientError) return undefined
    return undefined
  }
}

async function readLatestSavedRun() {
  const summaries = await listAgentRunSummaries()

  if (summaries.length === 0) {
    throw new Error("还没有历史分析记录。请先让 PMOpsAgent 分析一张反馈表。")
  }

  return readSavedRunById(summaries[0].id)
}

async function resolveRunForPendingAction(_query: string) {
  return readLatestSavedRun()
}

function buildRunPendingAction(
  toolName:
    | "prepare_approve_run"
    | "prepare_reject_run"
    | "prepare_create_prd_document"
    | "prepare_create_tapd_work_items"
    | "prepare_send_feishu_review",
  savedRun: SavedAgentRun,
) {
  if (toolName === "prepare_approve_run") {
    return {
      type: "approve_run" as const,
      summary: `通过「${savedRun.run.result.productName}」这次分析`,
      payload: {
        runId: savedRun.id,
      },
    }
  }

  if (toolName === "prepare_reject_run") {
    return {
      type: "reject_run" as const,
      summary: `驳回「${savedRun.run.result.productName}」这次分析`,
      payload: {
        runId: savedRun.id,
      },
    }
  }

  if (toolName === "prepare_create_prd_document") {
    return {
      type: "create_feishu_prd_document" as const,
      summary: `为「${savedRun.run.result.productName}」创建飞书 PRD 文档`,
      payload: {
        runId: savedRun.id,
      },
    }
  }

  if (toolName === "prepare_create_tapd_work_items") {
    return {
      type: "create_tapd_work_items" as const,
      summary: `为「${savedRun.run.result.productName}」创建 TAPD 需求与任务`,
      payload: {
        runId: savedRun.id,
        selectedTaskIndexes: savedRun.run.result.engineeringTasks.map((_, index) => index),
      },
    }
  }

  return {
    type: "send_feishu_review_message" as const,
    summary: `发送「${savedRun.run.result.productName}」的飞书评审摘要`,
    payload: {
      runId: savedRun.id,
    },
  }
}

function normalizePlan(plan: ConversationPlan, cleanedText: string): ConversationPlan {
  const toolCalls = (plan.toolCalls ?? [])
    .map((call) => ({
      name: call.name,
      arguments: {
        query: call.arguments?.query?.trim() || inferSearchQuery(cleanedText),
      },
    }))
    .filter((call): call is NormalizedToolCall => isConversationToolName(call.name))

  if (toolCalls.length === 0) return fallbackPlan(cleanedText, undefined)

  return {
    toolCalls: dedupeToolCalls(toolCalls),
    replyGuidance: plan.replyGuidance,
  }
}

function normalizeToolCalls(plan: ConversationPlan, cleanedText: string) {
  const calls = normalizePlan(plan, cleanedText).toolCalls ?? []

  if (calls.some((call) => call.name === "search_run_objects") && !calls.some((call) => call.name === "read_latest_run")) {
    return [{ name: "read_latest_run" as const, arguments: { query: inferSearchQuery(cleanedText) } }, ...calls]
  }

  return calls
}

function fallbackPlan(cleanedText: string, session?: ConversationSession): ConversationPlan {
  const compact = normalizeText(cleanedText)

  if (compact.includes("help") || compact.includes("帮助") || compact.includes("菜单") || compact.includes("你能做什么") || compact.includes("你是谁")) {
    return { toolCalls: [{ name: "help", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("status") || compact.includes("状态") || compact.includes("进度")) {
    return { toolCalls: [{ name: "status", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("项目记忆") || compact.includes("产品记忆") || compact.includes("记住了哪些") || compact.includes("有哪些项目") || compact.includes("哪些产品项目")) {
    return { toolCalls: [{ name: "list_product_memories", arguments: { query: cleanedText } }] }
  }

  if (isCancelText(cleanedText)) {
    return { toolCalls: [{ name: "cancel_pending_action", arguments: { query: cleanedText } }] }
  }

  if (isConfirmText(cleanedText) || (session?.pendingAction && (compact.includes("执行") || compact.includes("可以") || compact.includes("继续")))) {
    return { toolCalls: [{ name: "execute_pending_action", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("驳回") || compact.includes("拒绝")) {
    return { toolCalls: [{ name: "prepare_reject_run", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("通过") || compact.includes("批准") || compact.includes("同意")) {
    return { toolCalls: [{ name: "prepare_approve_run", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("创建") && (compact.includes("prd") || compact.includes("飞书文档") || compact.includes("文档"))) {
    return { toolCalls: [{ name: "prepare_create_prd_document", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("创建") && compact.includes("tapd")) {
    return { toolCalls: [{ name: "prepare_create_tapd_work_items", arguments: { query: cleanedText } }] }
  }

  if ((compact.includes("发送") || compact.includes("发到") || compact.includes("通知")) && compact.includes("飞书")) {
    return { toolCalls: [{ name: "prepare_send_feishu_review", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("合并") || compact.includes("并入") || compact.includes("手动合并")) {
    return {
      toolCalls: [
        { name: "read_product_memories", arguments: { query: cleanedText } },
        { name: "compare_product_memories", arguments: { query: cleanedText } },
        { name: "prepare_merge_product_memories", arguments: { query: cleanedText } },
      ],
    }
  }

  if (compact.includes("重复") || compact.includes("查重") || compact.includes("去重") || compact.includes("合并项目") || compact.includes("项目合并")) {
    return { toolCalls: [{ name: "find_duplicate_product_memories", arguments: { query: extractDuplicateQuery(cleanedText) || cleanedText } }] }
  }

  if ((compact.includes("切换") || compact.includes("搜索") || compact.includes("查找") || compact.includes("定位")) && (compact.includes("项目") || compact.includes("产品") || compact.includes("记忆"))) {
    return { toolCalls: [{ name: "search_product_memories", arguments: { query: inferProjectQuery(cleanedText) || cleanedText } }] }
  }

  if (compact.includes("授权链接") || compact.includes("重新授权") || compact === "授权" || compact.includes("oauthauthorize")) {
    return { toolCalls: [{ name: "oauth_authorize", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("授权状态") || compact.includes("权限") || compact.includes("oauth状态")) {
    return { toolCalls: [{ name: "oauth_status", arguments: { query: cleanedText } }] }
  }

  if ((compact.includes("分析") || compact.includes("看看")) && (compact.includes("示例") || compact.includes("sample"))) {
    return { toolCalls: [{ name: "analyze_sample", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("分析") || compact.includes("读取") || compact.includes("跑一下")) {
    return { toolCalls: [{ name: "analyze_bitable", arguments: { query: inferAnalyzeTarget(cleanedText) } }] }
  }

  if (compact.includes("tapd") && (compact.includes("项目") || compact.includes("workspace"))) {
    return { toolCalls: [{ name: "list_tapd_projects", arguments: { query: cleanedText } }] }
  }

  if (compact.includes("base") || compact.includes("多维表格")) {
    if (asksForBaseKeysOrTables(compact)) {
      return { toolCalls: [{ name: "list_oauth_bases_with_tables", arguments: { query: cleanedText } }] }
    }

    if (compact.includes("搜索") || compact.includes("查找")) {
      return { toolCalls: [{ name: "search_oauth_bases", arguments: { query: inferSearchQuery(cleanedText) } }] }
    }

    return { toolCalls: [{ name: "list_oauth_bases", arguments: { query: cleanedText } }] }
  }

  return {
    toolCalls: [
      { name: "search_product_memory_context", arguments: { query: inferSearchQuery(cleanedText) } },
      { name: "read_latest_run", arguments: { query: cleanedText } },
      { name: "search_run_objects", arguments: { query: inferSearchQuery(cleanedText) } },
    ],
  }
}

function compactSavedRun(savedRun: SavedAgentRun) {
  const result = savedRun.run.result

  return {
    id: savedRun.id,
    sourceLabel: savedRun.sourceLabel,
    productName: result.productName,
    summary: result.summary,
    prdTitle: result.prd.title,
    mvpScope: result.mvpScope,
    topRice: result.ricePrioritization.slice(0, 10),
    engineeringTasks: result.engineeringTasks,
    risks: result.risks,
    openQuestions: result.openQuestions,
  }
}

function searchSavedRun(savedRun: SavedAgentRun, query: string): SearchResult {
  const result = savedRun.run.result
  const tasks = result.engineeringTasks
    .map((task) => ({ ...task, score: scoreMatch(query, `${task.title} ${task.description} ${task.priority} ${task.acceptanceCriteria.join(" ")}`) }))
    .filter((task) => task.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  const riceItems = result.ricePrioritization
    .map((item) => ({ ...item, score: scoreMatch(query, `${item.feature} ${item.priority} ${item.rationale} ${(item.evidenceFeedbackIds ?? []).join(" ")}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  const clusters = result.demandClusters
    .map((cluster) => ({ ...cluster, score: scoreMatch(query, `${cluster.title} ${cluster.description} ${cluster.userPain} ${cluster.productOpportunity} ${cluster.evidenceFeedbackIds.join(" ")}`) }))
    .filter((cluster) => cluster.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  const evidenceIds = uniqueStrings([
    ...riceItems.flatMap((item) => item.evidenceFeedbackIds ?? []),
    ...clusters.flatMap((cluster) => cluster.evidenceFeedbackIds),
  ]).slice(0, 8)
  const feedbackMap = new Map(savedRun.feedbackItems.map((item) => [item.id, item]))
  const evidence = evidenceIds
    .map((id) => feedbackMap.get(id))
    .filter((item): item is FeedbackItem => Boolean(item))
    .map((item) => ({
      id: item.id,
      content: item.content,
      source: item.source,
      userType: item.userType,
    }))

  return {
    tasks,
    riceItems,
    clusters,
    evidence,
  }
}

function fallbackConversationReply(cleanedText: string, toolResults: ExecutedToolResult[]) {
  const failed = toolResults.find((result) => !result.ok)
  if (failed) {
    return `我尝试读取上下文时遇到问题：${failed.error || "未知错误"}`
  }

  const productMemoryReply = buildProductMemoryFallbackReply(toolResults)
  if (productMemoryReply) return productMemoryReply

  if (toolResults.length === 0) {
    return "我理解你的问题，但还没有找到合适的上下文。你可以先让我分析一张反馈表，再继续讨论 PRD 或 TAPD 任务。"
  }

  return [
    "我已经读取了相关上下文，但这次没有拿到稳定的模型回复。",
    "你可以换一种更具体的问法，比如：某个任务为什么是 P1、是否应该进 MVP、或者根据你补充的背景重新评估。",
  ].join("\n")
}

function buildProductMemoryFallbackReply(toolResults: ExecutedToolResult[]) {
  const listResult = toolResults.find((result) => result.name === "list_product_memories")
  if (listResult?.data && isRecord(listResult.data)) {
    const memories = Array.isArray(listResult.data.memories) ? listResult.data.memories : []
    if (memories.length === 0) {
      return "我现在还没有沉淀出产品项目记忆。先让我分析一次 CSV 或飞书 Base，分析完成后会自动生成项目记忆。"
    }

    return [
      "当前已沉淀的产品项目记忆：",
      ...memories.slice(0, 12).map((item, index) => {
        const memory = item as Record<string, unknown>
        return `${index + 1}. ${String(memory.displayName || "未命名项目")}（key：${String(memory.key || "-")}，最近运行：${String(memory.latestRunId || "-")}）`
      }),
      memories.length > 12 ? `还有 ${memories.length - 12} 个未展示。` : "",
      "",
      "你可以继续说：@PMOpsAgent 查一下 简历 项目的优先级依据",
    ]
      .filter(Boolean)
      .join("\n")
  }

  const searchResult = toolResults.find((result) => result.name === "search_product_memories")
  if (searchResult?.data && isRecord(searchResult.data)) {
    const matches = Array.isArray(searchResult.data.matches) ? searchResult.data.matches : []
    if (matches.length === 0) {
      return "我没有找到匹配的产品项目记忆。你可以先让我列出项目记忆，或换一个更接近产品名、Base 名、表名的说法。"
    }

    return [
      "我找到这些可能相关的项目记忆：",
      ...matches.slice(0, 8).map((item, index) => {
        const memory = item as Record<string, unknown>
        return `${index + 1}. ${String(memory.displayName || "未命名项目")}（key：${String(memory.key || "-")}）\n   来源：${formatUnknownArray(memory.sourceLabels)}`
      }),
      "",
      "如果有多个候选，请带上项目名继续问，我会只读取对应项目的上下文。",
    ].join("\n")
  }

  const readResult = toolResults.find((result) => result.name === "read_product_memories")
  if (readResult?.data && isRecord(readResult.data)) {
    const memories = Array.isArray(readResult.data.memories) ? readResult.data.memories : []
    if (memories.length < 2) {
      return "我还没有定位到至少两个可比较的项目。你可以直接说项目名、Base 名，或者贴 project_xxx key，我会先读取再判断是否能合并。"
    }

    return [
      "我先读到了这些候选项目：",
      ...memories.slice(0, 8).map((item, index) => {
        const memory = item as Record<string, unknown>
        return `${index + 1}. ${String(memory.displayName || "未命名项目")}（key：${String(memory.key || "-")}）\n   来源：${formatUnknownArray(memory.sourceLabels)}`
      }),
      "",
      "下一步我会比较它们是不是本质同一个项目，再给出合并建议。确认前不会真正改记忆。",
    ].join("\n")
  }

  const compareResult = toolResults.find((result) => result.name === "compare_product_memories")
  if (compareResult?.data && isRecord(compareResult.data) && isRecord(compareResult.data.comparison)) {
    const comparison = compareResult.data.comparison
    const memories = Array.isArray(comparison.memories) ? comparison.memories : []
    const recommendedTargetKey = typeof comparison.recommendedTargetKey === "string" ? comparison.recommendedTargetKey : undefined
    const reasons = Array.isArray(comparison.reasons) ? comparison.reasons.map((reason) => String(reason)).filter(Boolean) : []

    return [
      "我比较了一下这些项目记忆：",
      `相似度：${Number(comparison.similarity || 0)}，判断：${comparison.duplicateLikely ? "大概率是同一项目" : "还不能直接判定为同一项目"}`,
      recommendedTargetKey ? `建议保留：${recommendedTargetKey}` : undefined,
      "",
      "依据：",
      ...(reasons.length > 0 ? reasons.map((reason) => `- ${reason}`) : ["- 暂无明确依据。"]),
      memories.length > 0 ? "" : undefined,
      ...memories.slice(0, 8).map((item) => {
        const memory = item as Record<string, unknown>
        return `- ${String(memory.displayName || "未命名项目")}（${String(memory.key || "-")}）`
      }),
      "",
      "如果你确认要合并，我会先生成待确认动作；你再回复“确认合并”才会真正写入。",
    ]
      .filter((line): line is string => typeof line === "string")
      .join("\n")
  }

  const duplicateResult = toolResults.find((result) => result.name === "find_duplicate_product_memories")
  if (duplicateResult?.data && isRecord(duplicateResult.data)) {
    const groups = Array.isArray(duplicateResult.data.duplicateGroups) ? duplicateResult.data.duplicateGroups : []
    if (groups.length === 0) {
      return "我没有发现明显重复的项目记忆。你也可以指定范围，比如“筛选销售助手相关的重复项目”。"
    }

    return [
      "我筛了一下，发现这些可能重复的项目：",
      ...groups.slice(0, 6).map((item, index) => {
        const group = item as Record<string, unknown>
        const memories = Array.isArray(group.memories) ? group.memories : []
        return [
          `${index + 1}. ${String(group.title || "未命名重复组")}（置信度：${Math.round(Number(group.confidence || 0) * 100)}%）`,
          `   原因：${String(group.reason || "-")}`,
          ...memories.slice(0, 4).map((memoryItem) => {
            const memory = memoryItem as Record<string, unknown>
            return `   - ${String(memory.displayName || "未命名项目")}（${String(memory.key || "-")}）`
          }),
        ].join("\n")
      }),
      "",
      "你可以继续说：@PMOpsAgent 先合并销售助手。届时我会先生成待确认合并项，等你确认后再真正改本地记忆。",
    ].join("\n")
  }

  const preparedMergeResult = toolResults.find((result) => result.name === "prepare_merge_product_memories")
  if (preparedMergeResult?.data && isRecord(preparedMergeResult.data)) {
    const group = isRecord(preparedMergeResult.data.duplicateGroup) ? preparedMergeResult.data.duplicateGroup : undefined
    const target = isRecord(preparedMergeResult.data.target) ? preparedMergeResult.data.target : undefined
    const sources = Array.isArray(preparedMergeResult.data.sources) ? preparedMergeResult.data.sources : []

    return [
      `我已经准备好合并这组项目：${String(group?.title || "未命名重复组")}`,
      group?.confidence ? `置信度：${Math.round(Number(group.confidence) * 100)}%` : undefined,
      group?.reason ? `依据：${String(group.reason)}` : undefined,
      "",
      "合并方案：",
      target ? `保留：${String(target.displayName || "未命名项目")}（${String(target.key || "-")}）` : undefined,
      ...sources.map((item) => {
        const source = item as Record<string, unknown>
        return `合入：${String(source.displayName || "未命名项目")}（${String(source.key || "-")}）`
      }),
      "",
      "这一步还没有真正修改记忆。确认的话，请回复：@PMOpsAgent 确认合并。",
    ]
      .filter((line): line is string => typeof line === "string")
      .join("\n")
  }

  const preparedRunAction = toolResults.find(
    (result) =>
      result.name === "prepare_approve_run" ||
      result.name === "prepare_reject_run" ||
      result.name === "prepare_create_prd_document" ||
      result.name === "prepare_create_tapd_work_items" ||
      result.name === "prepare_send_feishu_review",
  )
  if (preparedRunAction?.data && isRecord(preparedRunAction.data)) {
    const pendingAction = isRecord(preparedRunAction.data.pendingAction) ? preparedRunAction.data.pendingAction : undefined
    const run = isRecord(preparedRunAction.data.run) ? preparedRunAction.data.run : undefined

    return [
      `我已经准备好这个动作：${String(pendingAction?.summary || "执行待确认操作")}`,
      run ? `对象：${String(run.productName || "未命名产品")}（运行记录：${String(run.id || "-")}）` : undefined,
      run?.sourceLabel ? `来源：${String(run.sourceLabel)}` : undefined,
      "",
      "这一步还没有真正执行。确认的话，请回复：@PMOpsAgent 确认执行。",
    ]
      .filter((line): line is string => typeof line === "string")
      .join("\n")
  }

  const executedResult = toolResults.find((result) => result.name === "execute_pending_action")
  if (executedResult?.data && isRecord(executedResult.data)) {
    const actionResult = isRecord(executedResult.data.result) ? executedResult.data.result : undefined
    const executedAction = isRecord(executedResult.data.executedAction) ? executedResult.data.executedAction : undefined

    if (actionResult?.type === "merge_product_memories") {
      const mergedMemory = isRecord(actionResult.mergedMemory) ? actionResult.mergedMemory : undefined
      if (!mergedMemory) return "已执行项目合并。"
      return [
        "已执行合并。",
        `保留项目：${String(mergedMemory.displayName || "未命名项目")}`,
        `保留 key：${String(mergedMemory.key || "-")}`,
        `合并后来源：${formatUnknownArray(mergedMemory.sourceLabels)}`,
        `关联运行记录：${Array.isArray(mergedMemory.runIds) ? mergedMemory.runIds.length : 0} 条`,
      ].join("\n")
    }

    if (actionResult?.type === "approve_run") return "已通过这次分析。现在可以继续创建飞书 PRD、创建 TAPD 或发送评审摘要。"
    if (actionResult?.type === "reject_run") return "已驳回这次分析。"

    if (actionResult?.type === "create_feishu_prd_document") {
      const document = isRecord(actionResult.document) ? actionResult.document : undefined
      return document?.url ? `已创建飞书 PRD：${String(document.url)}` : "已创建飞书 PRD。"
    }

    if (actionResult?.type === "create_tapd_work_items") {
      const created = isRecord(actionResult.created) ? actionResult.created : undefined
      const story = isRecord(created?.story) ? created.story : undefined
      const tasks = Array.isArray(created?.tasks) ? created.tasks : []
      return [
        "已创建 TAPD 需求与任务。",
        story?.url ? `需求：${String(story.url)}` : undefined,
        `任务数：${tasks.length}`,
      ]
        .filter((line): line is string => typeof line === "string")
        .join("\n")
    }

    if (actionResult?.type === "send_feishu_review_message") return "已发送飞书评审摘要。"

    return executedAction?.summary ? `已执行：${String(executedAction.summary)}` : "已执行当前待确认动作。"
  }

  const cancelledResult = toolResults.find((result) => result.name === "cancel_pending_action")
  if (cancelledResult?.ok) {
    return "好的，已取消当前待确认动作。"
  }

  const contextResult = toolResults.find((result) => result.name === "search_product_memory_context")
  if (contextResult?.data && isRecord(contextResult.data)) {
    const contexts = Array.isArray(contextResult.data.contexts) ? contextResult.data.contexts : []
    const firstContext = contexts.find((item) => isRecord(item)) as Record<string, unknown> | undefined
    if (!firstContext) return undefined

    const memory = isRecord(firstContext.memory) ? firstContext.memory : undefined
    const decisions = Array.isArray(firstContext.decisions) ? firstContext.decisions : []
    const evidence = Array.isArray(firstContext.evidence) ? firstContext.evidence : []

    if (!memory) return undefined

    return [
      `我定位到的项目：${String(memory.displayName || "未命名项目")}`,
      isRecord(memory.artifacts) ? `PRD：${String(memory.artifacts.prdTitle || "-")}` : undefined,
      `摘要：${String(memory.summary || "-")}`,
      "",
      decisions.length ? "相关判断：" : "我没有在这个项目里找到特别匹配的判断。",
      ...decisions.slice(0, 5).map((item) => {
        const decision = item as Record<string, unknown>
        return `- ${String(decision.title || "未命名")}：${String(decision.priority || "-")}，${String(decision.description || "")}`
      }),
      evidence.length ? "" : undefined,
      evidence.length ? "相关用户证据：" : undefined,
      ...evidence.slice(0, 5).map((item) => {
        const evidenceItem = item as Record<string, unknown>
        return `- ${String(evidenceItem.id || "-")}：${truncateText(String(evidenceItem.content || ""), 80)}`
      }),
    ]
      .filter((line): line is string => typeof line === "string")
      .join("\n")
  }

  return undefined
}

async function loadFeedbackForAnalysisTool(toolName: Extract<ConversationToolName, "analyze_sample" | "analyze_bitable">, query: string) {
  if (toolName === "analyze_sample") {
    const csvText = await readFile(sampleFeedbackPath, "utf8")
    return {
      feedbackItems: parseFeedbackCsv(csvText),
      sourceLabel: "飞书群聊：示例反馈",
    }
  }

  const url = extractFirstUrl(query)
  if (url) {
    return readFeedbackFromFeishuBitableUrl(url)
  }

  const target = inferAnalyzeTarget(query)
  if (target) {
    let oauthError: FeishuOAuthError | undefined

    try {
      return await readFeedbackFromOAuthDiscoveredTable(target)
    } catch (error) {
      if (!(error instanceof FeishuOAuthError)) {
        throw error
      }

      oauthError = error
    }

    try {
      return await readFeedbackFromFeishuWorkspaceTableName(target)
    } catch (error) {
      if (error instanceof FeishuBitableError && error.code === "FEISHU_BITABLE_WORKSPACE_INDEX_MISSING") {
        try {
          return await readFeedbackFromFeishuBitableTableName(target)
        } catch (fallbackError) {
          if (oauthError) throw oauthError
          throw fallbackError
        }
      }

      throw error
    }
  }

  return {
    feedbackItems: await readFeedbackFromFeishuBitable(),
    sourceLabel: "飞书群聊：已配置多维表格",
  }
}

async function readFeedbackFromOAuthDiscoveredTable(tableName: string) {
  const token = await getValidFeishuUserAccessToken()
  const shouldMatchBaseAndTable = tableName.includes("/")
  const listedBases = await listFeishuBitableBases()
  const matchedBases = shouldMatchBaseAndTable ? listedBases : matchOAuthBases(listedBases, tableName)
  const bases = matchedBases.length > 0 ? matchedBases : await searchFeishuBitableBases(extractBaseQuery(tableName))
  const tables = await listOAuthTablesFromBases(bases, token)
  const table = matchOAuthTable(tables, tableName, {
    allowSingleTableFromSingleBase: !shouldMatchBaseAndTable && matchedBases.length === 1,
  })

  return readFeedbackFromFeishuBitableWithToken({
    appToken: table.appToken,
    tableId: table.tableId,
    token,
    sourceLabel: `飞书 OAuth ${table.baseName}/${table.name}`,
  })
}

async function listOAuthTablesFromBases(bases: Awaited<ReturnType<typeof searchFeishuBitableBases>>, token: string): Promise<FeishuBitableOAuthTable[]> {
  const allTables: FeishuBitableOAuthTable[] = []

  for (const base of bases.slice(0, 20)) {
    const tables = await listFeishuBitableTablesByAppToken(base.appToken, token)
    allTables.push(
      ...tables.map((table) => ({
        ...table,
        appToken: base.appToken,
        baseName: base.title,
        baseUrl: base.url,
      })),
    )
  }

  return allTables
}

function matchOAuthBases(bases: Awaited<ReturnType<typeof listFeishuBitableBases>>, queryText: string) {
  const query = normalizeText(extractBaseQuery(queryText))
  if (!query) return []

  const exactMatches = bases.filter((base) => normalizeText(base.title) === query)
  if (exactMatches.length > 0) return exactMatches

  return bases.filter((base) => {
    const baseName = normalizeText(base.title)
    return baseName.includes(query) || query.includes(baseName)
  })
}

function matchOAuthTable(tables: FeishuBitableOAuthTable[], tableName: string, options?: { allowSingleTableFromSingleBase?: boolean }) {
  const query = normalizeText(tableName)

  if (!query) {
    throw new FeishuBitableError("FEISHU_BITABLE_TABLE_NOT_FOUND", "没有识别到要分析的数据表名称。", "请说明要分析的 Base、表名或完整飞书多维表格链接。")
  }

  const fullName = (table: FeishuBitableOAuthTable) => normalizeText(`${table.baseName}/${table.name}`)
  const exactMatches = tables.filter((table) => normalizeText(table.name) === query || fullName(table) === query)
  if (exactMatches.length === 1) return exactMatches[0]

  if (options?.allowSingleTableFromSingleBase && tables.length === 1) {
    return tables[0]
  }

  if (options?.allowSingleTableFromSingleBase && tables.length > 1) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS",
      `搜索“${tableName}”只命中了一个 Base，但这个 Base 下有多个数据表。`,
      `请使用“Base名/表名”重新发送。候选：${tables.map((table) => `${table.baseName}/${table.name}`).join("、")}`,
    )
  }

  const baseNameMatches = tables.filter((table) => normalizeText(table.baseName) === query)
  if (baseNameMatches.length === 1) return baseNameMatches[0]

  if (baseNameMatches.length > 1) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS",
      `“${tableName}”是一个 Base 名，但这个 Base 下有多个数据表。`,
      `请使用“Base名/表名”重新发送。候选：${baseNameMatches.map((table) => `${table.baseName}/${table.name}`).join("、")}`,
    )
  }

  const fuzzyMatches = tables.filter((table) => {
    const tableOnlyName = normalizeText(table.name)
    const tableFullName = fullName(table)
    return tableOnlyName.includes(query) || tableFullName.includes(query) || query.includes(tableOnlyName)
  })
  if (fuzzyMatches.length === 1) return fuzzyMatches[0]

  if (fuzzyMatches.length > 1) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS",
      `找到多个名称接近“${tableName}”的数据表。`,
      `请使用“Base名/表名”重新发送。候选：${fuzzyMatches.map((table) => `${table.baseName}/${table.name}`).join("、")}`,
    )
  }

  throw new FeishuBitableError(
    "FEISHU_BITABLE_TABLE_NOT_FOUND",
    `没有找到名为“${tableName}”的数据表。`,
    "请先让我列出所有 Base 和表名，确认 Base 名、表名或 table_id。",
  )
}

function inferAnalyzeTarget(text: string) {
  return cleanMentionText(text)
    .replace(/https?:\/\/[^\s<>"']+/gi, " ")
    .replace(/^(帮我|请|麻烦)?\s*(分析|读取|跑一下|看一下|看看)\s*/i, "")
    .replace(/^(一下|下|这个|这张|表格|多维表格)\s*/i, "")
    .replace(/^(表格|多维|bitable)\s*/i, "")
    .trim()
}

function extractFirstUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s<>"']+/i)
  return match?.[0]
}

function extractBaseQuery(tableName: string) {
  const [baseName] = tableName.split("/")
  return baseName?.trim() || tableName.trim()
}

function inferSearchQuery(text: string) {
  const cleaned = cleanMentionText(text)
  const explicitTarget = extractQuotedText(cleaned) || extractPriorityTarget(cleaned)
  return explicitTarget || cleaned
}

function inferProjectQuery(text: string) {
  const cleaned = cleanMentionText(text)
  const quoted = extractQuotedText(cleaned)
  if (quoted) return quoted

  const patterns = [
    /(?:切换到|打开|查看|搜索|查找|定位|读取)([^，。！？?]+?)(?:项目|产品|记忆|上下文)/i,
    /(?:在|关于|针对)([^，。！？?]+?)(?:项目|产品|这个项目|这个产品)/i,
    /([^，。！？?]+?)(?:项目|产品)(?:里|中|的|有哪些|当前|为什么|怎么|如何)/i,
  ]

  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return value
  }

  const sourceLike = cleaned.match(/(?:Base|base|表格)\s*([a-zA-Z0-9_\-\u4e00-\u9fa5]+)/)
  if (sourceLike?.[1]) return sourceLike[1].trim()

  return undefined
}

function extractMergeTarget(text: string) {
  const cleaned = cleanMentionText(text)
  const quoted = extractQuotedText(cleaned)
  if (quoted) return quoted

  const patterns = [
    /(?:先|请|帮我|麻烦)?\s*合并([^，。！？?]+?)(?:项目|产品|记忆)?$/i,
    /(?:把|将)([^，。！？?]+?)(?:项目|产品|记忆)?合并/i,
    /(?:先处理|处理|就)([^，。！？?]+?)(?:这组|这个|项目|产品)?/i,
  ]

  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    const value = cleanupMergeTarget(match?.[1])
    if (value) return value
  }

  return undefined
}

function extractDuplicateQuery(text: string) {
  const cleaned = cleanMentionText(text)
  const quoted = extractQuotedText(cleaned)
  if (quoted) return quoted

  const withoutIntent = cleaned
    .replace(/(有一些|请你|帮我|麻烦|然后我会要求你合并|我会要求你合并|筛选出来告诉我|告诉我|先|一下)/g, " ")
    .replace(/(重复的|重复|查重|去重|项目|产品|记忆|合并|筛选|找出|找一下|有哪些|哪些)/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return withoutIntent || undefined
}

function cleanupMergeTarget(value: string | undefined) {
  return value
    ?.replace(/^(一下|下|这组|这个|项目|产品|记忆|重复项|重复项目)\s*/g, "")
    .replace(/(项目|产品|记忆|重复项|重复项目)$/g, "")
    .trim()
}

function isConfirmText(text: string) {
  const compact = normalizeText(text)
  return (
    compact === "确认" ||
    compact === "执行" ||
    compact === "执行吧" ||
    compact.startsWith("确认") ||
    compact === "确认合并" ||
    compact === "可以合并" ||
    compact === "执行合并" ||
    compact === "合并吧" ||
    compact === "就这样合并" ||
    compact === "同意合并" ||
    compact.includes("确认合并") ||
    compact.includes("确认执行") ||
    compact.includes("直接执行") ||
    compact.includes("开始执行") ||
    compact.includes("直接开始执行") ||
    compact.includes("不要再问")
  )
}

function isCancelText(text: string) {
  const compact = normalizeText(text)
  return compact === "取消" || compact === "取消合并" || compact === "先不合并" || compact === "不要合并" || compact.includes("取消合并")
}

function compactConversationForPlanner(session: ConversationSession) {
  return {
    recentTurns: session.recentTurns.slice(-6),
    recentToolObservations: compactToolObservations(session).slice(-4),
    pendingAction: session.pendingAction,
  }
}

function compactToolObservations(session: ConversationSession) {
  return (session.recentToolObservations ?? []).map((observation) => {
    if (observation.name !== "find_duplicate_product_memories" || !isRecord(observation.data)) {
      return observation
    }

    const duplicateGroups = Array.isArray(observation.data.duplicateGroups)
      ? observation.data.duplicateGroups.slice(0, 5)
      : []

    return {
      ...observation,
      data: {
        productMemory: true,
        duplicateGroups,
      },
    }
  })
}

function hasRecentDuplicateGroups(session: ConversationSession | undefined) {
  return Boolean(resolveRecentDuplicateGroups(session).length)
}

async function resolveProductMemoriesForTool(query: string, session: ConversationSession): Promise<ProductMemory[]> {
  const memories = await listProductMemories()
  const conversationText = buildRecentConversationText(session, query)
  const relevantText = extractMergeRelevantText(conversationText)
  const explicitKeys = extractProductMemoryKeysFromText(`${query}\n${relevantText}`)

  if (explicitKeys.length >= 2) {
    const explicitMemories = await readProductMemoriesByKeys(explicitKeys)
    if (explicitMemories.length >= 2) return explicitMemories
  }

  const mentioned = findMentionedProductMemories(relevantText || query || conversationText, memories)
  if (mentioned.length >= 2) return mentioned.slice(0, 8)

  const recentKeys = extractRecentProductMemoryKeys(session)
  if (recentKeys.length >= 2) {
    const recentMemories = await readProductMemoriesByKeys(recentKeys)
    if (recentMemories.length >= 2) return recentMemories
  }

  const searchQuery = extractMergeTarget(query) || inferProjectQuery(query) || extractDuplicateQuery(query) || query
  const matches = await searchProductMemories(searchQuery, 8)
  return matches.map((match) => match.memory).slice(0, 8)
}

async function readProductMemoriesByKeys(keys: string[]) {
  const memories = await Promise.all(keys.map((key) => readProductMemoryByKey(key).catch(() => undefined)))
  return memories.filter((memory): memory is ProductMemory => Boolean(memory))
}

function compactProductMemoryDetail(memory: ProductMemory) {
  return {
    key: memory.key,
    displayName: memory.displayName,
    aliases: memory.aliases.slice(0, 8),
    sourceLabels: memory.sourceLabels.slice(0, 8),
    latestRunId: memory.latestRunId,
    summary: memory.summary,
    artifacts: memory.artifacts,
    decisions: memory.decisions.slice(0, 12),
    evidence: memory.evidence.slice(0, 12),
    updatedAt: memory.updatedAt,
  }
}

function compactProductMemoryComparison(comparison: ProductMemoryComparison) {
  return {
    similarity: comparison.similarity,
    duplicateLikely: comparison.duplicateLikely,
    recommendedTargetKey: comparison.recommendedTargetKey,
    reasons: comparison.reasons,
    mergeRisks: comparison.mergeRisks,
    memories: comparison.memories.map(compactProductMemoryForMerge),
  }
}

async function resolveDuplicateGroupForMerge(query: string, session: ConversationSession, toolResults: ExecutedToolResult[] = []) {
  const toolResultGroup = resolveMergeGroupFromToolResults(toolResults)
  if (toolResultGroup) return toolResultGroup

  const observationGroup = resolveMergeGroupFromToolObservations(session)
  if (observationGroup) return observationGroup

  const conversationText = buildRecentConversationText(session, query)
  const explicitGroup = await resolveExplicitMergeGroupFromConversation(conversationText)
  if (explicitGroup) return explicitGroup

  const recentGroups = resolveRecentDuplicateGroups(session)
  const queryText = extractMergeTarget(query) || extractDuplicateQuery(query) || query

  if (recentGroups.length > 0) {
    const requestedIndex = extractRequestedGroupIndex(query)
    if (typeof requestedIndex === "number" && recentGroups[requestedIndex]) {
      return recentGroups[requestedIndex]
    }

    if (queryText) {
      const matched = recentGroups
        .map((group) => ({
          group,
          score: scoreMatch(queryText, `${group.title} ${group.reason} ${group.memories.map((memory) => `${memory.displayName} ${memory.key} ${memory.sourceLabels.join(" ")}`).join(" ")}`),
        }))
        .sort((a, b) => b.score - a.score)[0]

      if (matched && matched.score > 0) return matched.group
    }

    return recentGroups[0]
  }

  const groups = await findDuplicateProductMemories(queryText)
  if (groups[0]) return groups[0]

  return undefined
}

function resolveMergeGroupFromToolResults(toolResults: ExecutedToolResult[]) {
  for (const result of [...toolResults].reverse()) {
    const group = resolveMergeGroupFromToolData(result.data)
    if (group) return group
  }

  return undefined
}

function resolveMergeGroupFromToolObservations(session: ConversationSession) {
  for (const observation of [...(session.recentToolObservations ?? [])].reverse()) {
    const group = resolveMergeGroupFromToolData(observation.data)
    if (group) return group
  }

  return undefined
}

function resolveMergeGroupFromToolData(data: unknown): ProductMemoryDuplicateGroup | undefined {
  if (!isRecord(data)) return undefined

  if (isRecord(data.comparison)) {
    const group = groupFromComparisonLike(data.comparison)
    if (group) return group
  }

  if (Array.isArray(data.memories)) {
    return groupFromCompactMemories(data.memories, undefined, "用户最近读取了这些项目，并要求继续判断或合并。", 0.62)
  }

  if (Array.isArray(data.duplicateGroups)) {
    const group = data.duplicateGroups.find(isProductMemoryDuplicateGroup)
    if (group) return group
  }

  if (isProductMemoryDuplicateGroup(data.duplicateGroup)) return data.duplicateGroup

  return undefined
}

function groupFromComparisonLike(comparison: Record<string, unknown>): ProductMemoryDuplicateGroup | undefined {
  if (!Array.isArray(comparison.memories)) return undefined

  const similarity = Number(comparison.similarity || 0)
  const duplicateLikely = Boolean(comparison.duplicateLikely)
  const recommendedTargetKey = typeof comparison.recommendedTargetKey === "string" ? comparison.recommendedTargetKey : undefined
  const reasons = Array.isArray(comparison.reasons) ? comparison.reasons.map((reason) => String(reason)).filter(Boolean) : []

  if (!duplicateLikely && similarity < 35) return undefined

  return groupFromCompactMemories(
    comparison.memories,
    recommendedTargetKey,
    reasons.join("；") || "LLM/工具链比较后认为这些项目有较强重叠，需要用户确认后合并。",
    Math.min(0.95, Math.max(0.55, similarity / 100)),
  )
}

function groupFromCompactMemories(memories: unknown[], recommendedTargetKey: string | undefined, reason: string, confidence: number): ProductMemoryDuplicateGroup | undefined {
  const normalized = memories.map(normalizeCompactProductMemory).filter((memory): memory is ProductMemoryDuplicateGroup["memories"][number] => Boolean(memory))
  const uniqueMemories = uniqueByKey(normalized)

  if (uniqueMemories.length < 2) return undefined

  const target = uniqueMemories.find((memory) => memory.key === recommendedTargetKey) ?? uniqueMemories[0]
  const sources = uniqueMemories.filter((memory) => memory.key !== target.key)

  if (sources.length === 0) return undefined

  return {
    title: target.displayName,
    confidence,
    reason,
    memories: [target, ...sources],
  }
}

function normalizeCompactProductMemory(value: unknown): ProductMemoryDuplicateGroup["memories"][number] | undefined {
  if (!isRecord(value) || typeof value.key !== "string") return undefined

  return {
    key: value.key,
    displayName: typeof value.displayName === "string" ? value.displayName : value.key,
    aliases: Array.isArray(value.aliases) ? value.aliases.map((item) => String(item)).filter(Boolean).slice(0, 6) : [],
    sourceLabels: Array.isArray(value.sourceLabels) ? value.sourceLabels.map((item) => String(item)).filter(Boolean).slice(0, 6) : [],
    latestRunId: typeof value.latestRunId === "string" ? value.latestRunId : "",
    summary: typeof value.summary === "string" ? value.summary : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  }
}

function uniqueByKey(memories: ProductMemoryDuplicateGroup["memories"]): ProductMemoryDuplicateGroup["memories"] {
  const seen = new Set<string>()
  return memories.filter((memory) => {
    if (seen.has(memory.key)) return false
    seen.add(memory.key)
    return true
  })
}

function extractRecentProductMemoryKeys(session: ConversationSession) {
  const keys: string[] = []

  for (const observation of [...(session.recentToolObservations ?? [])].reverse()) {
    if (!observation.ok) continue
    if (
      observation.name === "read_product_memories" ||
      observation.name === "compare_product_memories" ||
      observation.name === "prepare_merge_product_memories" ||
      observation.name === "search_product_memories"
    ) {
      keys.push(...extractProductMemoryKeysFromUnknown(observation.data))
    }

    if (keys.length >= 2) break
  }

  return uniqueStringValues(keys).slice(0, 8)
}

function extractProductMemoryKeysFromUnknown(value: unknown) {
  try {
    return extractProductMemoryKeysFromText(JSON.stringify(value))
  } catch {
    return []
  }
}

function extractProductMemoryKeysFromText(text: string) {
  return uniqueStringValues(text.match(/project_[a-f0-9]{16}/g) ?? [])
}

function uniqueStringValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim()).map((value) => value.trim())))
}

async function resolveExplicitMergeGroupFromConversation(text: string): Promise<ProductMemoryDuplicateGroup | undefined> {
  const memories = await listProductMemories()
  const relevantText = extractMergeRelevantText(text)
  const mentioned = findMentionedProductMemories(relevantText || text, memories)

  if (mentioned.length < 2) return undefined

  const target = pickMergeTargetFromConversation(relevantText || text, mentioned) ?? mentioned[0]
  const sources = mentioned.filter((memory) => memory.key !== target.key)
  if (sources.length === 0) return undefined

  return {
    title: target.displayName,
    confidence: 0.72,
    reason: "用户在最近对话中明确提到了这些项目需要合并；项目名或数据来源不同，但被用户判断为同一项目。",
    memories: [target, ...sources].map(compactProductMemoryForMerge),
  }
}

function buildRecentConversationText(session: ConversationSession, query: string) {
  return [
    ...session.recentTurns.slice(-12).map((turn) => turn.text),
    query,
  ].join("\n")
}

function extractMergeRelevantText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const markerPattern = /(合并|保留|合入|并入|删除|主项目|重复|同一项目|一样的项目|本质一样|待确认|确认)/

  return lines
    .map((line, index) => {
      if (!markerPattern.test(line)) return undefined
      return [lines[index - 1], line, lines[index + 1]].filter(Boolean).join("\n")
    })
    .filter((value): value is string => Boolean(value))
    .join("\n")
}

function findMentionedProductMemories(text: string, memories: ProductMemory[]) {
  const normalizedText = normalizeText(text)
  const explicitKeys = new Set((text.match(/project_[a-f0-9]{16}/g) ?? []))

  return memories
    .map((memory) => {
      const names = [memory.key, memory.displayName, ...memory.aliases, ...memory.sourceLabels].filter(Boolean)
      const score = names.reduce((sum, name) => {
        const normalizedName = normalizeText(name)
        if (!normalizedName) return sum
        if (explicitKeys.has(memory.key)) return sum + 200
        if (normalizedText.includes(normalizedName)) return sum + Math.max(40, normalizedName.length * 4)
        if (normalizedName.includes(normalizedText) && normalizedText.length >= 3) return sum + normalizedText.length * 2
        return sum
      }, 0)

      return {
        memory,
        score,
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt))
    .map((item) => item.memory)
}

function pickMergeTargetFromConversation(text: string, memories: ProductMemory[]) {
  const normalizedText = normalizeText(text)
  const keepMarkers = ["保留", "主项目", "主项目保留", "保留项目", "并入到", "合并到"]

  const scored = memories
    .map((memory) => {
      const names = [memory.key, memory.displayName, ...memory.aliases].filter(Boolean)
      const earliestNameIndex = Math.min(
        ...names
          .map((name) => normalizedText.indexOf(normalizeText(name)))
          .filter((index) => index >= 0),
      )
      const markerScore = keepMarkers.reduce((score, marker) => {
        const markerIndex = normalizedText.indexOf(normalizeText(marker))
        if (markerIndex < 0 || !Number.isFinite(earliestNameIndex)) return score
        const distance = Math.abs(earliestNameIndex - markerIndex)
        return score + Math.max(0, 120 - distance)
      }, 0)

      return {
        memory,
        score: markerScore + (Number.isFinite(earliestNameIndex) ? Math.max(0, 50 - earliestNameIndex / 20) : 0),
      }
    })
    .sort((a, b) => b.score - a.score)

  return scored[0]?.score > 0 ? scored[0].memory : undefined
}

function compactProductMemoryForMerge(memory: ProductMemory): ProductMemoryDuplicateGroup["memories"][number] {
  return {
    key: memory.key,
    displayName: memory.displayName,
    aliases: memory.aliases.slice(0, 6),
    sourceLabels: memory.sourceLabels.slice(0, 6),
    latestRunId: memory.latestRunId,
    summary: memory.summary,
    updatedAt: memory.updatedAt,
  }
}

function resolveRecentDuplicateGroups(session: ConversationSession | undefined): ProductMemoryDuplicateGroup[] {
  if (!session) return []

  const observations = [...(session.recentToolObservations ?? [])].reverse()
  const observation = observations.find((item) => item.name === "find_duplicate_product_memories" && item.ok && isRecord(item.data))
  if (!observation || !isRecord(observation.data) || !Array.isArray(observation.data.duplicateGroups)) return []

  return observation.data.duplicateGroups.filter(isProductMemoryDuplicateGroup)
}

function isProductMemoryDuplicateGroup(value: unknown): value is ProductMemoryDuplicateGroup {
  return isRecord(value) && typeof value.title === "string" && Array.isArray(value.memories)
}

function extractRequestedGroupIndex(text: string) {
  const compact = normalizeText(text)
  if (compact.includes("第一组") || compact.includes("第1组") || compact.includes("1组")) return 0
  if (compact.includes("第二组") || compact.includes("第2组") || compact.includes("2组")) return 1
  if (compact.includes("第三组") || compact.includes("第3组") || compact.includes("3组")) return 2
  return undefined
}

function extractQuotedText(text: string) {
  const match = text.match(/[「“"]([^」”"]+)[」”"]/)
  return match?.[1]?.trim()
}

function extractPriorityTarget(text: string) {
  const patterns = [
    /(?:研发任务中|任务中|任务|功能|需求|PRD中|prd中)[，,\s]*([^，。！？?]+?)(?:的优先级|为什么|为啥|依据|理由|是p[012]|只有p[012]|调整为p[012]|改成p[012])/i,
    /([^，。！？?]+?)(?:的优先级)(?:为什么|为啥|是|只有|太低|太高)/i,
    /(?:把|将)([^，。！？?]+?)(?:从p[012]|调整为p[012]|改成p[012])/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return value
  }

  return undefined
}

function scoreMatch(query: string, candidate: string) {
  const normalizedQuery = normalizeText(inferSearchQuery(query))
  const normalizedCandidate = normalizeText(candidate)

  if (!normalizedQuery || !normalizedCandidate) return 0
  if (normalizedCandidate.includes(normalizedQuery)) return normalizedQuery.length * 8 + 40
  if (normalizedQuery.includes(normalizedCandidate)) return normalizedCandidate.length * 8 + 20

  const queryTokens = splitSearchTokens(normalizedQuery)
  const tokenScore = queryTokens.reduce((score, token) => score + (token.length > 1 && normalizedCandidate.includes(token) ? token.length * 4 : 0), 0)
  const charScore = Array.from(new Set(normalizedQuery.split(""))).reduce((score, char) => score + (normalizedCandidate.includes(char) ? 1 : 0), 0)

  return tokenScore + charScore
}

function splitSearchTokens(value: string) {
  return value
    .split(/[，。！？、,.!?;；:：/\\|()[\]{}<>"'`~\-_+=\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "")
}

function isConversationToolName(value: unknown): value is ConversationToolName {
  return (
    value === "read_latest_run" ||
    value === "search_run_objects" ||
    value === "list_product_memories" ||
    value === "search_product_memories" ||
    value === "read_product_memories" ||
    value === "search_product_memory_context" ||
    value === "compare_product_memories" ||
    value === "find_duplicate_product_memories" ||
    value === "prepare_merge_product_memories" ||
    value === "prepare_approve_run" ||
    value === "prepare_reject_run" ||
    value === "prepare_create_prd_document" ||
    value === "prepare_create_tapd_work_items" ||
    value === "prepare_send_feishu_review" ||
    value === "execute_pending_action" ||
    value === "cancel_pending_action" ||
    value === "help" ||
    value === "status" ||
    value === "oauth_authorize" ||
    value === "oauth_status" ||
    value === "list_bitable_tables" ||
    value === "list_workspace_tables" ||
    value === "list_oauth_bases" ||
    value === "list_oauth_bases_with_tables" ||
    value === "search_oauth_bases" ||
    value === "list_tapd_projects" ||
    value === "analyze_sample" ||
    value === "analyze_bitable"
  )
}

function asksForBaseKeysOrTables(compactText: string) {
  return (
    compactText.includes("键名") ||
    compactText.includes("key") ||
    compactText.includes("app_token") ||
    compactText.includes("apptoken") ||
    compactText.includes("table_id") ||
    compactText.includes("tableid") ||
    compactText.includes("表名") ||
    compactText.includes("数据表") ||
    compactText.includes("各自") ||
    compactText.includes("对应信息")
  )
}

function dedupeToolCalls(calls: NormalizedToolCall[]) {
  const seen = new Set<string>()
  const deduped: NormalizedToolCall[] = []

  for (const call of calls) {
    const key = `${call.name}:${call.arguments.query}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(call)
  }

  return deduped.slice(0, 4)
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim()).map((value) => value.trim())))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function formatUnknownArray(value: unknown) {
  if (!Array.isArray(value)) return "-"
  return value.map((item) => String(item)).filter(Boolean).slice(0, 4).join("、") || "-"
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized
}

function getConversationAgentTimeoutMs() {
  const rawValue = process.env.DEEPSEEK_CONVERSATION_TIMEOUT_MS?.trim()
  if (!rawValue) return 18_000

  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || parsed < 1000) return 18_000

  return parsed
}
