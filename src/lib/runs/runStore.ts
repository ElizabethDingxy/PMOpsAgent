import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { upsertProductMemoryFromSavedRun } from "@/lib/memory/productMemoryStore"
import type { AgentRun, BusinessContext, FeedbackItem, SavedAgentRun, SavedAgentRunSummary } from "@/types/product"

const runsDir = path.join(process.cwd(), "data", "runs")

export class RunStoreError extends Error {
  code: "RUN_NOT_FOUND" | "RUN_ID_INVALID" | "RUN_STORE_FAILED"

  constructor(code: RunStoreError["code"], message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "RunStoreError"
    this.code = code
  }
}

export async function saveAgentRun(input: {
  feedbackItems: FeedbackItem[]
  businessContext?: BusinessContext
  run: AgentRun
  sourceLabel?: string
}): Promise<SavedAgentRun> {
  await ensureRunsDir()

  const id = sanitizeRunId(input.run.runId || crypto.randomUUID())
  const now = new Date().toISOString()
  const savedRun: SavedAgentRun = {
    id,
    sourceLabel: input.sourceLabel,
    feedbackItems: input.feedbackItems,
    businessContext: input.businessContext,
    run: {
      ...input.run,
      runId: id,
    },
    createdAt: now,
    updatedAt: now,
  }

  await writeFile(getRunPath(id), JSON.stringify(savedRun, null, 2), "utf8")
  await upsertProductMemoryFromSavedRun(savedRun)

  return savedRun
}

export async function listAgentRunSummaries(): Promise<SavedAgentRunSummary[]> {
  await ensureRunsDir()

  const files = await readdir(runsDir)
  const jsonFiles = files.filter((file) => file.endsWith(".json"))
  const runs = await Promise.all(
    jsonFiles.map(async (file) => {
      try {
        return await readSavedRunById(file.replace(/\.json$/, ""))
      } catch {
        return null
      }
    }),
  )

  return runs
    .filter((run): run is SavedAgentRun => Boolean(run))
    .map(toSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function readSavedRunById(id: string): Promise<SavedAgentRun> {
  const safeId = sanitizeRunId(id)

  try {
    const raw = await readFile(getRunPath(safeId), "utf8")
    return JSON.parse(raw) as SavedAgentRun
  } catch (error) {
    throw new RunStoreError("RUN_NOT_FOUND", "运行记录不存在。", { cause: error })
  }
}

export async function writeSavedRun(savedRun: SavedAgentRun): Promise<SavedAgentRun> {
  const safeId = sanitizeRunId(savedRun.id)
  const updatedRun: SavedAgentRun = {
    ...savedRun,
    id: safeId,
    run: {
      ...savedRun.run,
      runId: safeId,
    },
    updatedAt: new Date().toISOString(),
  }

  await ensureRunsDir()
  await writeFile(getRunPath(safeId), JSON.stringify(updatedRun, null, 2), "utf8")
  await upsertProductMemoryFromSavedRun(updatedRun)

  return updatedRun
}

export async function deleteSavedRunById(id: string): Promise<void> {
  const safeId = sanitizeRunId(id)

  try {
    await unlink(getRunPath(safeId))
  } catch (error) {
    throw new RunStoreError("RUN_NOT_FOUND", "运行记录不存在或已被删除。", { cause: error })
  }
}

function toSummary(savedRun: SavedAgentRun): SavedAgentRunSummary {
  return {
    id: savedRun.id,
    productName: savedRun.run.result.productName,
    summary: savedRun.run.result.summary,
    mode: savedRun.run.mode,
    isMock: savedRun.run.isMock,
    feedbackCount: savedRun.feedbackItems.length,
    clusterCount: savedRun.run.result.demandClusters.length,
    taskCount: savedRun.run.result.engineeringTasks.length,
    sourceLabel: savedRun.sourceLabel,
    createdAt: savedRun.createdAt,
    updatedAt: savedRun.updatedAt,
  }
}

async function ensureRunsDir() {
  await mkdir(runsDir, {
    recursive: true,
  })
}

function getRunPath(id: string) {
  return path.join(runsDir, `${id}.json`)
}

function sanitizeRunId(id: string) {
  const safeId = id.trim()

  if (!/^[a-zA-Z0-9_-]+$/.test(safeId)) {
    throw new RunStoreError("RUN_ID_INVALID", "运行记录 ID 不合法。")
  }

  return safeId
}
