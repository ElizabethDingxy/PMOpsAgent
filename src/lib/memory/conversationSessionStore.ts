import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { TapdWorkItemsConfigInput } from "@/lib/tapd/createTapdWorkItems"

const sessionsDir = path.join(process.cwd(), "data", "conversation-sessions")

export type ConversationPendingActionType =
  | "merge_product_memories"
  | "approve_run"
  | "reject_run"
  | "create_feishu_prd_document"
  | "create_tapd_work_items"
  | "send_feishu_review_message"

export type ConversationPendingAction =
  | {
      id: string
      type: "merge_product_memories"
      summary: string
      payload: {
        targetKey: string
        sourceKeys: string[]
      }
      createdAt: string
      updatedAt: string
      expiresAt: string
    }
  | {
      id: string
      type: "approve_run" | "reject_run" | "create_feishu_prd_document" | "send_feishu_review_message"
      summary: string
      payload: {
        runId: string
      }
      createdAt: string
      updatedAt: string
      expiresAt: string
    }
  | {
      id: string
      type: "create_tapd_work_items"
      summary: string
      payload: {
        runId: string
        selectedTaskIndexes?: number[]
        tapdConfig?: TapdWorkItemsConfigInput
      }
      createdAt: string
      updatedAt: string
      expiresAt: string
    }

export type ConversationPendingActionInput = Omit<ConversationPendingAction, "id" | "createdAt" | "updatedAt" | "expiresAt">

export type ConversationTurn = {
  role: "user" | "assistant"
  text: string
  timestamp: string
}

export type ConversationToolObservation = {
  name: string
  ok: boolean
  data?: unknown
  error?: string
  timestamp: string
}

export type ConversationSession = {
  key: string
  recentTurns: ConversationTurn[]
  recentToolObservations: ConversationToolObservation[]
  pendingAction?: ConversationPendingAction
  createdAt: string
  updatedAt: string
}

export async function readConversationSession(key = "default"): Promise<ConversationSession> {
  await ensureSessionsDir()

  const safeKey = toSafeSessionKey(key)

  try {
    const raw = await readFile(getSessionPath(safeKey), "utf8")
    const session = JSON.parse(raw) as ConversationSession

    if (session.pendingAction && new Date(session.pendingAction.expiresAt).getTime() < Date.now()) {
      return writeConversationSession({
        ...session,
        pendingAction: undefined,
      })
    }

    return session
  } catch {
    const now = new Date().toISOString()
    return {
      key: safeKey,
      recentTurns: [],
      recentToolObservations: [],
      createdAt: now,
      updatedAt: now,
    }
  }
}

export async function appendConversationTurns(key: string | undefined, turns: ConversationTurn[]): Promise<ConversationSession> {
  const session = await readConversationSession(key)

  return writeConversationSession({
    ...session,
    recentTurns: [...session.recentTurns, ...turns].slice(-12),
  })
}

export async function appendConversationToolObservations(key: string | undefined, observations: Omit<ConversationToolObservation, "timestamp">[]): Promise<ConversationSession> {
  const session = await readConversationSession(key)
  const timestamp = new Date().toISOString()

  return writeConversationSession({
    ...session,
    recentToolObservations: [
      ...(session.recentToolObservations ?? []),
      ...observations.map((observation) => ({
        ...observation,
        timestamp,
      })),
    ].slice(-10),
  })
}

export async function setPendingConversationAction(key: string | undefined, action: ConversationPendingActionInput): Promise<ConversationPendingAction> {
  const session = await readConversationSession(key)
  const now = new Date()
  const pendingAction = {
    ...action,
    id: randomUUID(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
  } as ConversationPendingAction

  await writeConversationSession({
    ...session,
    pendingAction,
  })

  return pendingAction
}

export async function clearPendingConversationAction(key: string | undefined): Promise<void> {
  const session = await readConversationSession(key)
  await writeConversationSession({
    ...session,
    pendingAction: undefined,
  })
}

async function writeConversationSession(session: ConversationSession): Promise<ConversationSession> {
  await ensureSessionsDir()

  const updatedSession: ConversationSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  }

  await writeFile(getSessionPath(updatedSession.key), JSON.stringify(updatedSession, null, 2), "utf8")

  return updatedSession
}

async function ensureSessionsDir() {
  await mkdir(sessionsDir, {
    recursive: true,
  })
}

function toSafeSessionKey(key = "default") {
  const normalized = key.trim() || "default"
  return createHash("sha1").update(normalized).digest("hex").slice(0, 24)
}

function getSessionPath(key: string) {
  return path.join(sessionsDir, `${key}.json`)
}
