import {
  readFeishuApprovalRecord,
  updateFeishuApprovalRecord,
  type FeishuApprovalRecord,
} from "@/lib/approvals/approvalStore"
import { executeAgentAction, AgentActionError } from "@/lib/agent/agentActionExecutor"
import { buildApprovalCard, updateFeishuApprovalCard } from "@/lib/feishu/sendApprovalCard"
import { readSavedRunById, RunStoreError } from "@/lib/runs/runStore"
import type { SavedAgentRun } from "@/types/product"

type FeishuCardActionErrorCode =
  | "FEISHU_CARD_ACTION_TOKEN_MISMATCH"
  | "FEISHU_CARD_ACTION_ENCRYPTED"
  | "FEISHU_CARD_ACTION_BAD_PAYLOAD"
  | "FEISHU_CARD_ACTION_RUN_NOT_FOUND"
  | "FEISHU_CARD_ACTION_NOT_APPROVED"
  | "FEISHU_CARD_ACTION_FAILED"

export class FeishuCardActionError extends Error {
  code: FeishuCardActionErrorCode
  fix: string
  status: number

  constructor(code: FeishuCardActionErrorCode, message: string, fix: string, options?: { cause?: unknown; status?: number }) {
    super(message, options)
    this.name = "FeishuCardActionError"
    this.code = code
    this.fix = fix
    this.status = options?.status ?? 500
  }
}

export type FeishuCardActionCallbackResult =
  | {
      kind: "challenge"
      challenge: string
    }
  | {
      kind: "handled"
      message: string
      runId: string
      action: FeishuApprovalAction
      card: Record<string, unknown>
    }

type FeishuApprovalAction = "approve" | "reject" | "create_prd" | "create_tapd"

type FeishuCardActionPayload = {
  type?: string
  challenge?: string
  token?: string
  encrypt?: string
  header?: {
    token?: string
  }
  action?: {
    value?: unknown
  }
  event?: {
    action?: {
      value?: unknown
    }
    context?: {
      open_message_id?: string
      open_chat_id?: string
    }
    message_id?: string
    open_message_id?: string
  }
  open_message_id?: string
  message_id?: string
}

type ParsedAction = {
  action: FeishuApprovalAction
  runId: string
  cardMessageId?: string
}

export async function handleFeishuCardActionCallback(input: unknown): Promise<FeishuCardActionCallbackResult> {
  if (!input || typeof input !== "object") {
    throw new FeishuCardActionError(
      "FEISHU_CARD_ACTION_BAD_PAYLOAD",
      "飞书卡片回调内容不是有效 JSON。",
      "请确认卡片回调请求地址指向 /api/feishu/card-actions，并使用飞书平台自动发送的 JSON 回调。",
      { status: 400 },
    )
  }

  const payload = input as FeishuCardActionPayload

  if (payload.encrypt) {
    throw new FeishuCardActionError(
      "FEISHU_CARD_ACTION_ENCRYPTED",
      "当前 Demo 暂未实现飞书卡片回调加密解密。",
      "请在飞书卡片回调配置中先关闭 Encrypt Key；如果必须开启，需要后续实现解密逻辑。",
      { status: 400 },
    )
  }

  verifyCardToken(payload)

  if (payload.type === "url_verification" && payload.challenge) {
    return {
      kind: "challenge",
      challenge: payload.challenge,
    }
  }

  const parsed = parseCardAction(payload)
  const savedRun = await readRun(parsed.runId)
  let approval = await readFeishuApprovalRecord(parsed.runId)

  if (!approval) {
    approval = await updateFeishuApprovalRecord(parsed.runId, {
      status: "pending",
      cardMessageId: parsed.cardMessageId,
      sourceLabel: savedRun.sourceLabel,
    })
  } else if (parsed.cardMessageId && !approval.cardMessageId) {
    approval = await updateFeishuApprovalRecord(parsed.runId, {
      cardMessageId: parsed.cardMessageId,
    })
  }

  let updatedApproval: FeishuApprovalRecord

  try {
    updatedApproval = await runApprovalAction(parsed.action, savedRun, approval)
  } catch (error) {
    const latestApproval = await readFeishuApprovalRecord(parsed.runId)

    if (latestApproval) {
      try {
        await updateFeishuApprovalCard({
          cardMessageId: latestApproval.cardMessageId || parsed.cardMessageId,
          savedRun: await readSavedRunById(parsed.runId),
          approval: latestApproval,
        })
      } catch {
        // Preserve the original action error.
      }
    }

    if (error instanceof FeishuCardActionError && error.status === 200 && latestApproval) {
      return {
        kind: "handled",
        action: parsed.action,
        runId: parsed.runId,
        message: error.message,
        card: buildApprovalCard(await readSavedRunById(parsed.runId), latestApproval),
      }
    }

    throw error
  }

  try {
    await updateFeishuApprovalCard({
      cardMessageId: updatedApproval.cardMessageId || parsed.cardMessageId,
      savedRun: await readSavedRunById(parsed.runId),
      approval: updatedApproval,
    })
  } catch {
    // The action has already been handled. Do not fail the callback and risk Feishu retrying a write action.
  }

  return {
    kind: "handled",
    action: parsed.action,
    runId: parsed.runId,
    message: actionMessage(parsed.action, updatedApproval),
    card: buildApprovalCard(await readSavedRunById(parsed.runId), updatedApproval),
  }
}

async function runApprovalAction(action: FeishuApprovalAction, savedRun: SavedAgentRun, approval: FeishuApprovalRecord) {
  try {
    if (action === "approve") {
      const result = await executeAgentAction({
        type: "approve_run",
        summary: `通过分析运行 ${savedRun.id}`,
        payload: {
          runId: savedRun.id,
        },
      })
      return result.type === "approve_run" ? result.approval : approval
    }

    if (action === "reject") {
      const result = await executeAgentAction({
        type: "reject_run",
        summary: `驳回分析运行 ${savedRun.id}`,
        payload: {
          runId: savedRun.id,
        },
      })
      return result.type === "reject_run" ? result.approval : approval
    }

    if (!isApproved(approval)) {
      return await updateFeishuApprovalRecord(savedRun.id, {
        status: approval.status,
        errorMessage: "请先点击“通过分析”，再创建 PRD 或 TAPD。",
      })
    }

    if (action === "create_prd") {
      const result = await executeAgentAction({
        type: "create_feishu_prd_document",
        summary: `创建分析运行 ${savedRun.id} 的飞书 PRD`,
        payload: {
          runId: savedRun.id,
        },
      })
      return result.type === "create_feishu_prd_document" ? result.approval : approval
    }

    const result = await executeAgentAction({
      type: "create_tapd_work_items",
      summary: `创建分析运行 ${savedRun.id} 的 TAPD 需求与任务`,
      payload: {
        runId: savedRun.id,
        selectedTaskIndexes: savedRun.run.result.engineeringTasks.map((_, index) => index),
      },
    })
    return result.type === "create_tapd_work_items" ? result.approval : approval
  } catch (error) {
    if (error instanceof FeishuCardActionError) {
      throw error
    }

    await updateFeishuApprovalRecord(savedRun.id, {
      status: "failed",
      errorMessage: errorMessage(error),
    })

    if (error instanceof AgentActionError) {
      throw new FeishuCardActionError("FEISHU_CARD_ACTION_FAILED", error.message, error.fix, { cause: error, status: 200 })
    }

    throw new FeishuCardActionError(
      "FEISHU_CARD_ACTION_FAILED",
      error instanceof Error ? error.message : "飞书卡片动作执行失败。",
      "请检查服务端日志、飞书应用权限、TAPD 配置和网络连接。",
      { cause: error, status: 200 },
    )
  }
}

function verifyCardToken(payload: FeishuCardActionPayload) {
  const expectedToken = process.env.FEISHU_EVENT_VERIFICATION_TOKEN?.trim()
  if (!expectedToken) return

  const actualToken = payload.header?.token || payload.token
  if (actualToken !== expectedToken) {
    throw new FeishuCardActionError(
      "FEISHU_CARD_ACTION_TOKEN_MISMATCH",
      "飞书卡片回调 Verification Token 校验失败。",
      "请确认 .env.local 中的 FEISHU_EVENT_VERIFICATION_TOKEN 与飞书开放平台卡片回调页面一致。",
      { status: 401 },
    )
  }
}

function parseCardAction(payload: FeishuCardActionPayload): ParsedAction {
  const value = normalizeActionValue(payload.event?.action?.value ?? payload.action?.value)
  const action = typeof value.action === "string" ? value.action : undefined
  const runId = typeof value.runId === "string" ? value.runId : undefined

  if (!isFeishuApprovalAction(action) || !runId) {
    throw new FeishuCardActionError(
      "FEISHU_CARD_ACTION_BAD_PAYLOAD",
      "飞书卡片回调缺少 action 或 runId。",
      "请确认群聊中使用的是 PMOpsAgent 生成的审批卡片，不要手动构造回调请求。",
      { status: 400 },
    )
  }

  return {
    action,
    runId,
    cardMessageId:
      payload.event?.message_id ||
      payload.message_id ||
      payload.event?.context?.open_message_id ||
      payload.event?.open_message_id ||
      payload.open_message_id,
  }
}

function normalizeActionValue(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === "object") return value as Record<string, unknown>

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  return {}
}

function isFeishuApprovalAction(value: string | undefined): value is FeishuApprovalAction {
  return value === "approve" || value === "reject" || value === "create_prd" || value === "create_tapd"
}

async function readRun(runId: string) {
  try {
    return await readSavedRunById(runId)
  } catch (error) {
    if (error instanceof RunStoreError) {
      throw new FeishuCardActionError(
        "FEISHU_CARD_ACTION_RUN_NOT_FOUND",
        "找不到这次分析运行记录。",
        "请重新在群聊中触发一次分析，生成新的审批卡片后再操作。",
        { cause: error, status: 404 },
      )
    }

    throw error
  }
}

function isApproved(approval: FeishuApprovalRecord) {
  return approval.status === "approved" || approval.status === "prd_created" || approval.status === "tapd_created"
}

function actionMessage(action: FeishuApprovalAction, approval: FeishuApprovalRecord) {
  if (approval.errorMessage) return approval.errorMessage
  if (action === "approve") return "已通过分析。"
  if (action === "reject") return "已驳回分析。"
  if (action === "create_prd") return approval.prdUrl ? `已创建飞书 PRD：${approval.prdUrl}` : "已处理创建 PRD。"
  return approval.tapdStoryUrl ? `已创建 TAPD 需求：${approval.tapdStoryUrl}` : "已处理创建 TAPD。"
}

function errorMessage(error: unknown) {
  if (error instanceof AgentActionError || error instanceof FeishuCardActionError) {
    return `${error.message} 修复建议：${error.fix}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return "未知错误。"
}
