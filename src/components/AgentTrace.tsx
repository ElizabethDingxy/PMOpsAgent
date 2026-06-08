import { AlertCircle, CheckCircle2, Clock3, Loader2, ShieldCheck } from "lucide-react"
import type { TraceEvent, TraceStatus } from "@/types/agent"

type AgentTraceProps = {
  trace: TraceEvent[]
}

const statusStyles: Record<TraceStatus, string> = {
  pending: "bg-slate-100 text-slate-500",
  running: "bg-amber/15 text-amber",
  success: "bg-pine/10 text-pine",
  failed: "bg-red-50 text-red-600",
  waiting_approval: "bg-coral/10 text-coral",
}

function StatusIcon({ status }: { status: TraceStatus }) {
  if (status === "success") return <CheckCircle2 size={18} aria-hidden="true" />
  if (status === "running") return <Loader2 size={18} aria-hidden="true" />
  if (status === "failed") return <AlertCircle size={18} aria-hidden="true" />
  if (status === "waiting_approval") return <ShieldCheck size={18} aria-hidden="true" />
  return <Clock3 size={18} aria-hidden="true" />
}

export function AgentTrace({ trace }: AgentTraceProps) {
  const currentStatus = getTraceSummary(trace)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Agent 工作流 Trace</h2>
          <p className="mt-1 text-sm text-slate-500">每一步都会留下状态、说明和时间。</p>
        </div>
        <span className={`rounded-md px-3 py-1.5 text-xs font-semibold ${currentStatus.className}`}>
          {currentStatus.label}
        </span>
      </div>

      <div className="mt-5 max-h-[360px] space-y-3 overflow-y-auto pr-1">
        {trace.length > 0 ? (
          trace.map((event) => (
            <article key={event.id} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                  statusStyles[event.status]
                }`}
              >
                <StatusIcon status={event.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{event.step}</h3>
                  <time className="text-xs text-slate-400">{event.timestamp}</time>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">{event.message}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
            等待读取反馈并开始分析。Agent trace 会在运行后展示每一步状态。
          </div>
        )}
      </div>
    </section>
  )
}

function getTraceSummary(trace: TraceEvent[]) {
  if (trace.some((event) => event.status === "failed")) {
    return {
      label: "失败",
      className: "bg-red-50 text-red-600",
    }
  }

  if (trace.some((event) => event.status === "running")) {
    return {
      label: "运行中",
      className: "bg-amber/15 text-amber",
    }
  }

  if (trace.some((event) => event.status === "waiting_approval")) {
    return {
      label: "等待审批",
      className: "bg-coral/10 text-coral",
    }
  }

  if (trace.length > 0) {
    return {
      label: "已记录",
      className: "bg-pine/10 text-pine",
    }
  }

  return {
    label: "未开始",
    className: "bg-slate-100 text-slate-500",
  }
}
