import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const approvalsDir = path.join(process.cwd(), "data", "approvals")

export type FeishuApprovalStatus = "pending" | "approved" | "rejected" | "prd_created" | "tapd_created" | "failed"

export type FeishuApprovalRecord = {
  runId: string
  status: FeishuApprovalStatus
  cardMessageId?: string
  sourceLabel?: string
  prdUrl?: string
  tapdStoryUrl?: string
  tapdTaskUrls?: string[]
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export async function createFeishuApprovalRecord(input: {
  runId: string
  cardMessageId?: string
  sourceLabel?: string
}) {
  const now = new Date().toISOString()
  const record: FeishuApprovalRecord = {
    runId: sanitizeRunId(input.runId),
    status: "pending",
    cardMessageId: input.cardMessageId,
    sourceLabel: input.sourceLabel,
    createdAt: now,
    updatedAt: now,
  }

  await saveFeishuApprovalRecord(record)
  return record
}

export async function readFeishuApprovalRecord(runId: string) {
  const safeRunId = sanitizeRunId(runId)

  try {
    const raw = await readFile(getApprovalPath(safeRunId), "utf8")
    return JSON.parse(raw) as FeishuApprovalRecord
  } catch {
    return undefined
  }
}

export async function updateFeishuApprovalRecord(
  runId: string,
  patch: Partial<Omit<FeishuApprovalRecord, "runId" | "createdAt">>,
) {
  const existing = await readFeishuApprovalRecord(runId)
  const now = new Date().toISOString()
  const record: FeishuApprovalRecord = {
    runId: sanitizeRunId(runId),
    status: "pending",
    createdAt: existing?.createdAt || now,
    ...existing,
    ...patch,
    updatedAt: now,
  }

  await saveFeishuApprovalRecord(record)
  return record
}

async function saveFeishuApprovalRecord(record: FeishuApprovalRecord) {
  await mkdir(approvalsDir, {
    recursive: true,
  })
  await writeFile(getApprovalPath(record.runId), JSON.stringify(record, null, 2), "utf8")
}

function getApprovalPath(runId: string) {
  return path.join(approvalsDir, `${runId}.json`)
}

function sanitizeRunId(id: string) {
  const safeId = id.trim()

  if (!/^[a-zA-Z0-9_-]+$/.test(safeId)) {
    throw new Error("审批记录 ID 不合法。")
  }

  return safeId
}
