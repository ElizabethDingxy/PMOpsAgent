import {
  readFeishuApprovalRecord,
  updateFeishuApprovalRecord,
  type FeishuApprovalRecord,
} from "@/lib/approvals/approvalStore"
import { createFeishuPrdDocument, FeishuDocumentError } from "@/lib/feishu/createPrdDocument"
import { sendFeishuTextMessage, FeishuWebhookError } from "@/lib/feishu/sendWebhook"
import { mergeProductMemories } from "@/lib/memory/productMemoryStore"
import { readSavedRunById, writeSavedRun, RunStoreError } from "@/lib/runs/runStore"
import { createTapdWorkItems, TapdError, type TapdWorkItemsConfigInput } from "@/lib/tapd/createTapdWorkItems"
import { appendTraceEvent, getTraceEvents } from "@/lib/trace/traceStore"
import { createTraceEvent } from "@/lib/trace/traceTypes"
import type { ConversationPendingAction } from "@/lib/memory/conversationSessionStore"
import type { TraceEvent } from "@/types/agent"
import type { AgentResult, SavedAgentRun } from "@/types/product"

export type AgentAction =
  | {
      type: "merge_product_memories"
      summary: string
      payload: {
        targetKey: string
        sourceKeys: string[]
      }
    }
  | {
      type: "approve_run" | "reject_run" | "create_feishu_prd_document" | "send_feishu_review_message"
      summary: string
      payload: {
        runId: string
      }
    }
  | {
      type: "create_tapd_work_items"
      summary: string
      payload: {
        runId: string
        selectedTaskIndexes?: number[]
        tapdConfig?: TapdWorkItemsConfigInput
      }
    }

export type ExecuteAgentActionResult =
  | {
      type: "merge_product_memories"
      mergedMemory: {
        key: string
        displayName: string
        sourceLabels: string[]
        runIds: string[]
      }
    }
  | {
      type: "approve_run" | "reject_run"
      approval: FeishuApprovalRecord
    }
  | {
      type: "create_feishu_prd_document"
      approval: FeishuApprovalRecord
      document: {
        documentId: string
        url: string
      }
      savedRun: SavedAgentRun
      trace: TraceEvent[]
    }
  | {
      type: "create_tapd_work_items"
      approval: FeishuApprovalRecord
      created: NonNullable<AgentResult["tapdWorkItems"]>
      savedRun: SavedAgentRun
      trace: TraceEvent[]
    }
  | {
      type: "send_feishu_review_message"
      trace: TraceEvent[]
    }

export class AgentActionError extends Error {
  code:
    | "ACTION_RUN_NOT_FOUND"
    | "ACTION_NOT_APPROVED"
    | "ACTION_PAYLOAD_INVALID"
    | "ACTION_FAILED"
    | "ACTION_CONFIG_MISSING"
  fix: string
  cause?: unknown

  constructor(code: AgentActionError["code"], message: string, fix: string, options?: { cause?: unknown }) {
    super(message)
    this.name = "AgentActionError"
    this.code = code
    this.fix = fix
    this.cause = options?.cause
  }
}

export async function executeAgentAction(action: AgentAction | ConversationPendingAction): Promise<ExecuteAgentActionResult> {
  if (action.type === "merge_product_memories") {
    const merged = await mergeProductMemories(action.payload)
    return {
      type: action.type,
      mergedMemory: {
        key: merged.key,
        displayName: merged.displayName,
        sourceLabels: merged.sourceLabels,
        runIds: merged.runIds,
      },
    }
  }

  if (action.type === "approve_run") {
    const existingApproval = await readFeishuApprovalRecord(action.payload.runId)
    return {
      type: action.type,
      approval: await updateFeishuApprovalRecord(action.payload.runId, {
        status:
          existingApproval?.status === "prd_created" || existingApproval?.status === "tapd_created"
            ? existingApproval.status
            : "approved",
        errorMessage: undefined,
      }),
    }
  }

  if (action.type === "reject_run") {
    return {
      type: action.type,
      approval: await updateFeishuApprovalRecord(action.payload.runId, {
        status: "rejected",
        errorMessage: undefined,
      }),
    }
  }

  if (action.type === "create_feishu_prd_document") {
    return createPrdDocumentForRun(action.payload.runId)
  }

  if (action.type === "create_tapd_work_items") {
    return createTapdWorkItemsForRun(action.payload.runId, action.payload.selectedTaskIndexes, action.payload.tapdConfig)
  }

  if (action.type === "send_feishu_review_message") {
    return sendFeishuReviewMessageForRun(action.payload.runId)
  }

  throw new AgentActionError("ACTION_PAYLOAD_INVALID", "未知的 Agent 动作。", "请重新生成待确认动作后再执行。")
}

export async function createPrdDocumentForResult(result: AgentResult, runId?: string) {
  if (!result.prd) {
    throw new AgentActionError("ACTION_PAYLOAD_INVALID", "缺少 PRD 草稿。", "请先运行 PMOpsAgent 生成 PRD 草稿。")
  }

  appendActionTrace(runId, createTraceEvent("feishu_prd_document_creating", "创建飞书 PRD", "running", "正在创建飞书 PRD 文档。"))

  try {
    const document = await createFeishuPrdDocument(result)
    const trace = appendActionTrace(
      runId,
      createTraceEvent("feishu_prd_document_created", "创建飞书 PRD", "success", "飞书 PRD 文档已创建。", {
        documentId: document.documentId,
        url: document.url,
      }),
    )

    return {
      document,
      trace,
    }
  } catch (error) {
    appendActionTrace(runId, createTraceEvent("feishu_prd_document_failed", "创建飞书 PRD", "failed", toErrorMessage(error)))
    throw normalizeActionError(error, "飞书 PRD 文档创建失败。", "请检查飞书应用权限、发布状态、文档权限和网络连接。")
  }
}

export async function createTapdWorkItemsForResult(
  result: AgentResult,
  selectedTaskIndexes?: number[],
  runId?: string,
  tapdConfig?: TapdWorkItemsConfigInput,
) {
  if (!result.engineeringTasks?.length) {
    throw new AgentActionError("ACTION_PAYLOAD_INVALID", "缺少研发任务草稿。", "请先运行 PMOpsAgent 生成研发任务草稿。")
  }

  const selectedIndexes = selectedTaskIndexes ?? result.engineeringTasks.map((_, index) => index)
  appendActionTrace(runId, createTraceEvent("tapd_work_items_creating", "创建 TAPD 任务", "running", "正在创建 TAPD 需求与任务。"))

  try {
    const created = await createTapdWorkItems(result, selectedIndexes, tapdConfig)
    const trace = appendActionTrace(
      runId,
      createTraceEvent("tapd_work_items_created", "创建 TAPD 任务", "success", `已创建 1 个 TAPD 需求和 ${created.tasks.length} 个 TAPD 任务。`, {
        story: created.story,
        tasks: created.tasks,
      }),
    )

    return {
      created,
      trace,
    }
  } catch (error) {
    appendActionTrace(runId, createTraceEvent("tapd_work_items_failed", "创建 TAPD 任务", "failed", toErrorMessage(error)))
    throw normalizeActionError(error, "TAPD 需求/任务创建失败。", "请检查 TAPD API 账号、项目 ID 和网络连接。")
  }
}

export async function sendFeishuReviewMessage(message: string, runId?: string) {
  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    throw new AgentActionError("ACTION_PAYLOAD_INVALID", "飞书消息内容为空。", "请先运行 PMOpsAgent 生成评审摘要。")
  }

  try {
    await sendFeishuTextMessage(trimmedMessage)
    const trace = appendActionTrace(runId, createTraceEvent("feishu_message_sent", "发送飞书", "success", "飞书评审摘要已发送。"))
    return {
      trace,
    }
  } catch (error) {
    appendActionTrace(runId, createTraceEvent("feishu_message_failed", "发送飞书", "failed", toErrorMessage(error)))
    throw normalizeActionError(error, "飞书消息发送失败。", "请检查飞书自定义机器人 webhook 和网络连接。")
  }
}

async function createPrdDocumentForRun(runId: string): Promise<Extract<ExecuteAgentActionResult, { type: "create_feishu_prd_document" }>> {
  const savedRun = await readRun(runId)
  const existingApproval = await readFeishuApprovalRecord(runId)

  if (existingApproval?.prdUrl) {
    return {
      type: "create_feishu_prd_document",
      approval: existingApproval,
      document: {
        documentId: "",
        url: existingApproval.prdUrl,
      },
      savedRun,
      trace: getTraceEvents(runId),
    }
  }

  assertApproved(existingApproval)

  const { document, trace } = await createPrdDocumentForResult(savedRun.run.result, runId)
  if (!document.url) {
    throw new AgentActionError("ACTION_FAILED", "飞书 PRD 文档已创建，但没有返回可访问链接。", "请检查飞书文档 API 返回内容和文档空间权限。")
  }
  const createdDocument = {
    documentId: document.documentId,
    url: document.url,
  }
  const updatedRun: SavedAgentRun = {
    ...savedRun,
    run: {
      ...savedRun.run,
      result: {
        ...savedRun.run.result,
        prdDocumentUrl: createdDocument.url,
        feishuReviewMessage: appendUniqueLink(savedRun.run.result.feishuReviewMessage, "飞书 PRD", createdDocument.url),
      },
    },
  }
  const writtenRun = await writeSavedRun(updatedRun)
  const approval = await updateFeishuApprovalRecord(runId, {
    status: "prd_created",
    prdUrl: createdDocument.url,
    errorMessage: undefined,
  })

  return {
    type: "create_feishu_prd_document",
    approval,
    document: createdDocument,
    savedRun: writtenRun,
    trace,
  }
}

async function createTapdWorkItemsForRun(
  runId: string,
  selectedTaskIndexes?: number[],
  tapdConfig?: TapdWorkItemsConfigInput,
): Promise<Extract<ExecuteAgentActionResult, { type: "create_tapd_work_items" }>> {
  const savedRun = await readRun(runId)
  const existingApproval = await readFeishuApprovalRecord(runId)

  if (existingApproval?.tapdStoryUrl && savedRun.run.result.tapdWorkItems) {
    return {
      type: "create_tapd_work_items",
      approval: existingApproval,
      created: savedRun.run.result.tapdWorkItems,
      savedRun,
      trace: getTraceEvents(runId),
    }
  }

  assertApproved(existingApproval)

  const { created, trace } = await createTapdWorkItemsForResult(savedRun.run.result, selectedTaskIndexes, runId, tapdConfig)
  const updatedRun: SavedAgentRun = {
    ...savedRun,
    run: {
      ...savedRun.run,
      result: {
        ...savedRun.run.result,
        tapdWorkItems: created,
        feishuReviewMessage: appendUniqueLink(savedRun.run.result.feishuReviewMessage, "TAPD 需求", created.story.url),
      },
    },
  }
  const writtenRun = await writeSavedRun(updatedRun)
  const approval = await updateFeishuApprovalRecord(runId, {
    status: "tapd_created",
    tapdStoryUrl: created.story.url,
    tapdTaskUrls: created.tasks.map((task) => task.url),
    errorMessage: undefined,
  })

  return {
    type: "create_tapd_work_items",
    approval,
    created,
    savedRun: writtenRun,
    trace,
  }
}

async function sendFeishuReviewMessageForRun(runId: string): Promise<Extract<ExecuteAgentActionResult, { type: "send_feishu_review_message" }>> {
  const savedRun = await readRun(runId)
  return {
    type: "send_feishu_review_message",
    ...(await sendFeishuReviewMessage(savedRun.run.result.feishuReviewMessage, runId)),
  }
}

async function readRun(runId: string) {
  try {
    return await readSavedRunById(runId)
  } catch (error) {
    if (error instanceof RunStoreError) {
      throw new AgentActionError("ACTION_RUN_NOT_FOUND", "找不到这次分析运行记录。", "请重新触发一次分析，生成新的运行记录后再操作。", {
        cause: error,
      })
    }

    throw error
  }
}

function assertApproved(approval: FeishuApprovalRecord | undefined) {
  if (approval?.status === "approved" || approval?.status === "prd_created" || approval?.status === "tapd_created") return

  throw new AgentActionError("ACTION_NOT_APPROVED", "这个动作还没有通过审批。", "请先确认通过分析，再执行创建文档、创建 TAPD 或发送等写操作。")
}

function appendActionTrace(runId: string | undefined, event: TraceEvent) {
  if (!runId) {
    return [event]
  }

  appendTraceEvent(runId, event)
  return getTraceEvents(runId)
}

function appendUniqueLink(message: string, label: string, url: string | undefined) {
  if (!url || message.includes(url)) return message
  return `${message}\n${label}：${url}`
}

function normalizeActionError(error: unknown, message: string, fix: string) {
  if (error instanceof AgentActionError) return error

  if (error instanceof FeishuDocumentError || error instanceof TapdError) {
    return new AgentActionError(
      error.code.endsWith("CONFIG_MISSING") ? "ACTION_CONFIG_MISSING" : "ACTION_FAILED",
      error.message,
      error.fix,
      { cause: error },
    )
  }

  if (error instanceof FeishuWebhookError) {
    return new AgentActionError(
      error.code === "FEISHU_WEBHOOK_MISSING" ? "ACTION_CONFIG_MISSING" : "ACTION_FAILED",
      error.message,
      fixForFeishuWebhookError(error.code),
      { cause: error },
    )
  }

  return new AgentActionError("ACTION_FAILED", error instanceof Error ? error.message : message, fix, {
    cause: error,
  })
}

function fixForFeishuWebhookError(code: FeishuWebhookError["code"]) {
  if (code === "FEISHU_WEBHOOK_MISSING") return "请在 .env.local 中配置 FEISHU_BOT_WEBHOOK，并重启服务。"
  if (code === "FEISHU_REQUEST_TIMEOUT") return "请检查网络连接，或稍后重试。"
  return "请确认飞书自定义机器人 webhook 有效，且没有复制错误。"
}

function toErrorMessage(error: unknown) {
  if (error instanceof FeishuDocumentError || error instanceof TapdError || error instanceof FeishuWebhookError || error instanceof AgentActionError) {
    return error.message
  }

  if (error instanceof Error) return error.message
  return "Agent 动作执行失败。"
}
