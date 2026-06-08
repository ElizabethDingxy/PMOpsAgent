import type { TraceEvent } from "@/types/agent"

const traceRuns = new Map<string, TraceEvent[]>()

export function createTraceRun(runId = crypto.randomUUID()): string {
  traceRuns.set(runId, [])
  return runId
}

export function appendTraceEvent(runId: string, event: TraceEvent) {
  const events = traceRuns.get(runId) ?? []
  events.push(event)
  traceRuns.set(runId, events)
  return event
}

export function replaceTraceEvents(runId: string, events: TraceEvent[]) {
  traceRuns.set(runId, [...events])
}

export function getTraceEvents(runId: string): TraceEvent[] {
  return [...(traceRuns.get(runId) ?? [])]
}

export function clearTraceRun(runId: string) {
  traceRuns.delete(runId)
}
