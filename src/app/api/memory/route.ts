import { NextResponse } from "next/server"
import { listProductMemories, searchProductMemories } from "@/lib/memory/productMemoryStore"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = url.searchParams.get("q")?.trim()

  if (query) {
    const matches = await searchProductMemories(query)

    return NextResponse.json({
      ok: true,
      query,
      memories: matches.map((match) => ({
        key: match.memory.key,
        displayName: match.memory.displayName,
        aliases: match.memory.aliases,
        sourceLabels: match.memory.sourceLabels,
        latestRunId: match.memory.latestRunId,
        summary: match.memory.summary,
        score: match.score,
        matchedFields: match.matchedFields,
        updatedAt: match.memory.updatedAt,
      })),
    })
  }

  const memories = await listProductMemories()

  return NextResponse.json({
    ok: true,
    memories: memories.map((memory) => ({
      key: memory.key,
      displayName: memory.displayName,
      aliases: memory.aliases,
      sourceLabels: memory.sourceLabels,
      runIds: memory.runIds,
      latestRunId: memory.latestRunId,
      summary: memory.summary,
      artifacts: memory.artifacts,
      updatedAt: memory.updatedAt,
    })),
  })
}
