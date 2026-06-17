import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { getVector, getVectorSimilarity, type VectorData } from "@/lib/llm/embeddingClient"
import type { ProductMemory, ProductMemoryDecision, ProductMemoryEvidence } from "./productMemoryStore"

const vectorsDir = path.join(process.cwd(), "data", "product-memory", "vectors")

export type ProjectVectorStore = {
  key: string
  summaryText: string
  summaryVector: VectorData
  decisionVectors: Record<
    string,
    {
      text: string
      vector: VectorData
    }
  >
  evidenceVectors: Record<
    string,
    {
      text: string
      vector: VectorData
    }
  >
}

async function ensureVectorsDir() {
  await mkdir(vectorsDir, { recursive: true })
}

function getVectorStorePath(key: string): string {
  return path.join(vectorsDir, `${key}.json`)
}

export async function loadProjectVectors(key: string): Promise<ProjectVectorStore | null> {
  try {
    const filePath = getVectorStorePath(key)
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw) as ProjectVectorStore
  } catch {
    return null
  }
}

/**
 * Incrementally updates the vector store for a given ProductMemory.
 * Only fetches embeddings for new or modified text items to conserve API tokens and optimize speed.
 */
export async function upsertProjectVectorsFromMemory(memory: ProductMemory): Promise<ProjectVectorStore> {
  await ensureVectorsDir()
  const existing = await loadProjectVectors(memory.key)

  // 1. Vectorize Summary
  const currentSummaryText = `${memory.displayName}\n${memory.summary}\n${memory.artifacts.prdTitle}`
  let summaryVector: VectorData
  if (existing && existing.summaryText === currentSummaryText && existing.summaryVector) {
    summaryVector = existing.summaryVector
  } else {
    summaryVector = await getVector(currentSummaryText)
  }

  // 2. Vectorize Decisions
  const decisionVectors: Record<string, { text: string; vector: VectorData }> = {}
  for (const decision of memory.decisions) {
    const key = `${decision.kind}:${decision.title}:${decision.runId}`
    const currentText = `${decision.title}\n${decision.description}\n${decision.priority || ""}\n${decision.rationale || ""}`

    if (existing && existing.decisionVectors[key] && existing.decisionVectors[key].text === currentText) {
      decisionVectors[key] = existing.decisionVectors[key]
    } else {
      decisionVectors[key] = {
        text: currentText,
        vector: await getVector(currentText),
      }
    }
  }

  // 3. Vectorize Evidence
  const evidenceVectors: Record<string, { text: string; vector: VectorData }> = {}
  for (const item of memory.evidence) {
    const key = `${item.runId}:${item.id}`
    const currentText = `${item.content}`

    if (existing && existing.evidenceVectors[key] && existing.evidenceVectors[key].text === currentText) {
      evidenceVectors[key] = existing.evidenceVectors[key]
    } else {
      evidenceVectors[key] = {
        text: currentText,
        vector: await getVector(currentText),
      }
    }
  }

  const store: ProjectVectorStore = {
    key: memory.key,
    summaryText: currentSummaryText,
    summaryVector,
    decisionVectors,
    evidenceVectors,
  }

  const filePath = getVectorStorePath(memory.key)
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8")

  return store
}

/**
 * Ranks ProductMemories based on cosine similarity of their overall summaries to the query.
 */
export async function rankProductMemories(
  query: string,
  memories: ProductMemory[],
): Promise<Array<{ memory: ProductMemory; score: number }>> {
  if (memories.length === 0) return []

  const queryVector = await getVector(query)
  const scored = await Promise.all(
    memories.map(async (memory) => {
      let score = 0
      try {
        const store = await loadProjectVectors(memory.key)
        if (store && store.summaryVector) {
          // Range similarity from 0 to 100 for display
          score = Math.round(getVectorSimilarity(queryVector, store.summaryVector) * 100)
        } else {
          // If vector store doesn't exist, trigger lazy load in background
          void upsertProjectVectorsFromMemory(memory).catch(() => undefined)
          score = 0
        }
      } catch {
        score = 0
      }
      return { memory, score }
    }),
  )

  return scored.sort((a, b) => b.score - a.score)
}

/**
 * Searches and ranks decisions and evidence inside a specific product memory using vector search.
 */
export async function rankMemoryContext(
  query: string,
  memory: ProductMemory,
): Promise<{
  decisions: Array<ProductMemoryDecision & { score: number }>
  evidence: Array<ProductMemoryEvidence & { score: number }>
}> {
  const queryVector = await getVector(query)
  const store = await loadProjectVectors(memory.key)

  if (!store) {
    // If no vectors exist, trigger creation in the background and return 0-scored arrays
    void upsertProjectVectorsFromMemory(memory).catch(() => undefined)
    return {
      decisions: memory.decisions.slice(0, 8).map((d) => ({ ...d, score: 0 })),
      evidence: memory.evidence.slice(0, 8).map((e) => ({ ...e, score: 0 })),
    }
  }

  // Rank Decisions
  const rankedDecisions = memory.decisions
    .map((decision) => {
      const key = `${decision.kind}:${decision.title}:${decision.runId}`
      const vecItem = store.decisionVectors[key]
      let score = 0
      if (vecItem && vecItem.vector) {
        score = Math.round(getVectorSimilarity(queryVector, vecItem.vector) * 100)
      }
      return { ...decision, score }
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  // Rank Evidence
  const rankedEvidence = memory.evidence
    .map((item) => {
      const key = `${item.runId}:${item.id}`
      const vecItem = store.evidenceVectors[key]
      let score = 0
      if (vecItem && vecItem.vector) {
        score = Math.round(getVectorSimilarity(queryVector, vecItem.vector) * 100)
      }
      return { ...item, score }
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  return {
    decisions: rankedDecisions,
    evidence: rankedEvidence,
  }
}
