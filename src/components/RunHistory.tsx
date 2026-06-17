"use client"

import { Copy, Eye, History, Trash2 } from "lucide-react"
import type { SavedAgentRunSummary } from "@/types/product"

type RunHistoryProps = {
  runs: SavedAgentRunSummary[]
  isLoading: boolean
  errorMessage?: string
  activeRunId?: string
  onRefresh: () => void
  onCopySummary: (id: string) => void
  onDelete: (id: string) => void
}

export function RunHistory({
  runs,
  isLoading,
  errorMessage,
  activeRunId,
  onRefresh,
  onCopySummary,
  onDelete,
}: RunHistoryProps) {
  return (
    <section className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-2 text-indigo-400">
            <History size={16} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-md font-bold text-slate-100 tracking-tight">运行历史 / History</h2>
            <p className="mt-1 text-xs text-slate-400">
              {runs.length > 0 ? `已保存 ${runs.length} 次本地运行草稿。` : "本地会话运行草稿记录归档列表。"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-slate-800 bg-[#121826]/80 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-[#182033] hover:border-slate-700 transition-all"
        >
          {isLoading ? "载入中" : "刷新"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-400">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 max-h-96 space-y-3.5 overflow-y-auto pr-1">
        {runs.length > 0 ? (
          runs.slice(0, 12).map((run) => {
            const isActive = activeRunId === run.id
            return (
              <article
                key={run.id}
                className={`rounded-xl border p-4 transition-all duration-300 ${
                  isActive 
                    ? "border-indigo-500 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.1)]" 
                    : "border-slate-850 bg-[#121826]/20 hover:border-slate-800 hover:bg-[#121826]/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-200 tracking-tight">{run.productName}</p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">{run.summary}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold font-mono ${
                    run.mode === 'mock' 
                      ? "bg-amber-500/10 border-amber-500/25 text-amber-400" 
                      : "bg-indigo-500/10 border-indigo-500/25 text-indigo-400"
                  }`}>
                    {run.mode === 'mock' ? 'MOCK' : 'DEEPSEEK'}
                  </span>
                </div>

                <div className="mt-3.5 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] font-mono text-slate-500 border-t border-slate-800/40 pt-3">
                  <span className="text-slate-450">{formatDateTime(run.createdAt)}</span>
                  <span>·</span>
                  <span>{run.feedbackCount} 反馈</span>
                  <span>·</span>
                  <span>{run.clusterCount} 主题</span>
                  <span>·</span>
                  <span>{run.taskCount} 任务</span>
                  <span>·</span>
                  <span className="text-slate-500 font-bold">{run.id.slice(0, 8)}</span>
                </div>

                {run.sourceLabel ? (
                  <p className="mt-2 text-[10px] text-slate-500 truncate">来源：{run.sourceLabel}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <IconLink label="回放数据" href={`/?run=${encodeURIComponent(run.id)}#analysis-result`} icon={<Eye size={13} aria-hidden="true" />} />
                  <IconButton
                    label="复制飞书摘要"
                    onClick={() => onCopySummary(run.id)}
                    icon={<Copy size={13} aria-hidden="true" />}
                  />
                  <IconButton
                    label="删除记录"
                    onClick={() => onDelete(run.id)}
                    icon={<Trash2 size={13} aria-hidden="true" />}
                    danger
                  />
                </div>
              </article>
            )
          })
        ) : (
          <div className="rounded-xl border border-slate-850 bg-[#0e1320]/20 px-4 py-8 text-center text-xs text-slate-500">
            {isLoading ? "正在同步会话历史..." : "暂无历史运行记录，完成分析后将在此处自动归档会话。"}
          </div>
        )}
      </div>
    </section>
  )
}

function IconButton({
  label,
  icon,
  danger = false,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-[#121826] px-2.5 py-1.5 text-xs font-semibold transition-all ${
        danger 
          ? "border-rose-500/20 text-rose-450 hover:bg-rose-500/10 hover:border-rose-500/40" 
          : "border-slate-800 text-slate-400 hover:text-slate-250 hover:border-slate-700 hover:bg-slate-800/60"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function IconLink({
  label,
  icon,
  href,
}: {
  label: string
  icon: React.ReactNode
  href: string
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#121826] px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-250 hover:border-slate-700 hover:bg-slate-800/60 transition-all"
    >
      {icon}
      {label}
    </a>
  )
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}
