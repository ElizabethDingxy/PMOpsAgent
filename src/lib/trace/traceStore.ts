import type { TraceEvent } from "@/types/agent"

const traceRuns = new Map<string, TraceEvent[]>()

export function createTraceRun(runId = crypto.randomUUID()): string {
  traceRuns.set(runId, [])
  return runId
}

export function appendTraceEvent(runId: string, event: TraceEvent) {
  const events = traceRuns.get(runId) ?? []
  
  // Filter out any matching logical steps to avoid duplicate elements in the timeline
  let filteredEvents = events;
  if (event.id === "feishu_message") {
    filteredEvents = events.filter((e) => e.id !== "send_feishu" && e.id !== "feishu_message")
  } else {
    filteredEvents = events.filter((e) => e.id !== event.id)
  }
  
  filteredEvents.push(event)
  traceRuns.set(runId, filteredEvents)
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
