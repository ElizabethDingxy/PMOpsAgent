import { AlertCircle, CheckCircle2, Clock3, Loader2, ShieldCheck } from "lucide-react"
import type { TraceEvent, TraceStatus } from "@/types/agent"

type AgentTraceProps = {
  trace: TraceEvent[]
}

const statusStyles: Record<TraceStatus, string> = {
  pending: "bg-slate-900 text-slate-500 border border-slate-800/80",
  running: "bg-amber-500/10 text-amber-400 border border-amber-500/25 animate-pulse",
  success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.1)]",
  failed: "bg-rose-500/10 text-rose-400 border border-rose-500/25 shadow-[0_0_12px_rgba(244,63,94,0.1)]",
  waiting_approval: "bg-[#d96c4a]/10 text-[#d96c4a] border border-[#d96c4a]/25 animate-pulse",
}

function StatusIcon({ status }: { status: TraceStatus }) {
  if (status === "success") return <CheckCircle2 size={16} aria-hidden="true" />
  if (status === "running") return <Loader2 size={16} className="animate-spin" aria-hidden="true" />
  if (status === "failed") return <AlertCircle size={16} aria-hidden="true" />
  if (status === "waiting_approval") return <ShieldCheck size={16} aria-hidden="true" />
  return <Clock3 size={16} aria-hidden="true" />
}

export function AgentTrace({ trace }: AgentTraceProps) {
  const currentStatus = getTraceSummary(trace)

  return (
    <section className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
        <div>
          <h2 className="text-md font-bold text-slate-100 tracking-tight">执行轨迹 / Agent Trace</h2>
          <p className="mt-1 text-xs text-slate-400">实时观察 Agent 的推理步骤与节点输出。</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${currentStatus.className}`}>
          {currentStatus.label}
        </span>
      </div>

      <div className="mt-5 max-h-96 space-y-4 overflow-y-auto pr-1 relative pl-4 border-l border-slate-850">
        {trace.length > 0 ? (
          trace.map((event, index) => {
            const isLast = index === trace.length - 1
            const isRunning = event.status === "running"
            const isFailed = event.status === "failed"

            return (
              <article key={event.id} className="relative group">
                {/* Timeline connector circle node */}
                <div className={`absolute -left-[25px] top-4.5 h-3.5 w-3.5 rounded-full border-2 bg-[#080b11] z-10 flex items-center justify-center transition-all ${
                  event.status === "success" 
                    ? "border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                    : isRunning 
                    ? "border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-ping" 
                    : isFailed 
                    ? "border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" 
                    : "border-slate-700"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    event.status === "success" ? "bg-emerald-500" : isRunning ? "bg-amber-500" : isFailed ? "bg-rose-500" : "bg-slate-700"
                  }`}></span>
                </div>

                <div className="flex gap-4 rounded-xl border border-slate-850 bg-[#121826]/30 hover:bg-[#121826]/50 p-4 transition-all duration-200">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      statusStyles[event.status]
                    }`}
                  >
                    <StatusIcon status={event.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-200 tracking-tight">{event.step}</h3>
                      <time className="shrink-0 text-[10px] font-mono text-slate-500">{event.timestamp}</time>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400 break-all">{event.message}</p>
                  </div>
                </div>
              </article>
            )
          })
        ) : (
          <div className="rounded-xl border border-slate-850 bg-[#0e1320]/20 px-4 py-8 text-center text-xs text-slate-500 pl-0">
            等待读取反馈并启动分析。运行后此区域将显示每一步的 AI 推理链路。
          </div>
        )}
      </div>
    </section>
  )
}

function getTraceSummary(trace: TraceEvent[]) {
  if (trace.some((event) => event.status === "failed")) {
    return {
      label: "执行失败",
      className: "bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.05)]",
    }
  }

  if (trace.some((event) => event.status === "running")) {
    return {
      label: "正在推理",
      className: "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse",
    }
  }

  if (trace.some((event) => event.status === "waiting_approval")) {
    return {
      label: "等待决策",
      className: "bg-[#d96c4a]/10 border-[#d96c4a]/20 text-[#d96c4a]",
    }
  }

  if (trace.length > 0) {
    return {
      label: "分析就绪",
      className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    }
  }

  return {
    label: "未开始",
    className: "bg-slate-800/40 border-slate-750 text-slate-500",
  }
}
