import { NextResponse } from "next/server"
import { listProductMemories } from "@/lib/memory/productMemoryStore"
import { upsertProjectVectorsFromMemory } from "@/lib/memory/vectorStore"
import { getEmbeddingEngineStatus } from "@/lib/llm/embeddingClient"
import { rm, mkdir } from "node:fs/promises"
import path from "node:path"

const vectorsDir = path.join(process.cwd(), "data", "product-memory", "vectors")

export async function POST(request: Request) {
  try {
    let force = false
    try {
      const body = await request.json()
      force = Boolean(body?.force)
    } catch {
      // Body may be empty, ignore
    }

    if (force) {
      // Clear all existing vector files for a clean rebuild
      await rm(vectorsDir, { recursive: true, force: true }).catch(() => undefined)
      await mkdir(vectorsDir, { recursive: true }).catch(() => undefined)
    }

    const memories = await listProductMemories()
    let successCount = 0
    const errors: Array<{ key: string; error: string }> = []

    // Rebuild vectors for each memory item
    for (const memory of memories) {
      try {
        await upsertProjectVectorsFromMemory(memory)
        successCount++
      } catch (err) {
        errors.push({
          key: memory.key,
          error: err instanceof Error ? err.message : "未知错误",
        })
      }
    }

    const engineStatus = getEmbeddingEngineStatus()

    return NextResponse.json({
      ok: true,
      count: memories.length,
      successCount,
      errors: errors.length > 0 ? errors : undefined,
      engine: engineStatus.engine,
      model: engineStatus.model,
    })
  } catch (error) {
    console.error("[RebuildVectors] API Failed:", error)
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VECTOR_REBUILD_FAILED",
          message: error instanceof Error ? error.message : "重建向量数据库发生未知错误。",
        },
      },
      { status: 500 },
    )
  }
}
