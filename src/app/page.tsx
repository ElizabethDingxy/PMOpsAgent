import { DemoShell } from "@/components/DemoShell"
import { listAgentRunSummaries, readSavedRunById, RunStoreError } from "@/lib/runs/runStore"

export const dynamic = "force-dynamic"

type HomeProps = {
  searchParams?: Promise<{
    run?: string
  }>
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams
  const initialSavedRuns = await listAgentRunSummaries()
  const initialSelectedRun = params?.run ? await readRunOrUndefined(params.run) : undefined

  return <DemoShell initialSavedRuns={initialSavedRuns} initialSelectedRun={initialSelectedRun} />
}

async function readRunOrUndefined(id: string) {
  try {
    return await readSavedRunById(id)
  } catch (error) {
    if (error instanceof RunStoreError) return undefined
    throw error
  }
}
