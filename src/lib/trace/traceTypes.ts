import type { TraceEvent, TraceStatus } from "@/types/agent"

export type TraceStepId =
  | "validate_input"
  | "feedback_loaded"
  | "business_context_applied"
  | "mock_mode_enabled"
  | "research_agent_running"
  | "research_agent_completed"
  | "strategy_agent_running"
  | "strategy_agent_completed"
  | "prd_agent_running"
  | "prd_agent_completed"
  | "delivery_agent_running"
  | "delivery_agent_completed"
  | "orchestrator_completed"
  | "waiting_for_approval"
  | "send_feishu"
  | "multi_agent_failed"
  | "feishu_message_sent"
  | "feishu_message_failed"

export const demoTraceSteps: Array<{
  id: TraceStepId
  step: string
}> = [
  { id: "feedback_loaded", step: "读取反馈" },
  { id: "business_context_applied", step: "业务数据" },
  { id: "research_agent_running", step: "Research Agent" },
  { id: "strategy_agent_running", step: "Strategy Agent" },
  { id: "prd_agent_running", step: "PRD Agent" },
  { id: "delivery_agent_running", step: "Delivery Agent" },
  { id: "orchestrator_completed", step: "Orchestrator" },
  { id: "waiting_for_approval", step: "等待审批" },
  { id: "send_feishu", step: "发送飞书" },
]

export function createTraceEvent(
  id: string,
  step: string,
  status: TraceStatus,
  message: string,
  metadata?: Record<string, unknown>,
): TraceEvent {
  return {
    id,
    step,
    status,
    message,
    timestamp: new Date().toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    metadata,
  }
}

export function createClientTraceEvent(
  id: string,
  step: string,
  status: TraceStatus,
  message: string,
): TraceEvent {
  return createTraceEvent(id, step, status, message)
}
