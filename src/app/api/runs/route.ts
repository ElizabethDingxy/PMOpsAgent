import { NextResponse } from "next/server"
import { listAgentRunSummaries } from "@/lib/runs/runStore"

export async function GET() {
  const runs = await listAgentRunSummaries()

  return NextResponse.json({
    ok: true,
    runs,
  })
}
