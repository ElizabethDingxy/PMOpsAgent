export type TraceStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "waiting_approval"

export type TraceEvent = {
  id: string
  step: string
  status: TraceStatus
  message: string
  timestamp: string
  metadata?: Record<string, unknown>
}
