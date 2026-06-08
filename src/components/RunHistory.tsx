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
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-mist p-2 text-pine">
            <History size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">历史运行</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {runs.length > 0 ? `共 ${runs.length} 条本地记录，点击“加载”查看完整内容。` : "查看、回放、复制或删除本地运行记录。"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          {isLoading ? "刷新中" : "刷新"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1 xl:max-h-[34vh]">
        {runs.length > 0 ? (
          runs.slice(0, 12).map((run) => (
            <article
              key={run.id}
              className={`rounded-lg border p-3 ${
                activeRunId === run.id ? "border-pine bg-pine/5" : "border-slate-100 bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{run.productName}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{run.summary}</p>
                </div>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-500">
                  {run.mode}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{formatDateTime(run.createdAt)}</span>
                <span>{run.feedbackCount} 条反馈</span>
                <span>{run.clusterCount} 个主题</span>
                <span>{run.taskCount} 个任务</span>
                <span className="font-mono text-slate-400">{run.id.slice(0, 8)}</span>
              </div>
              {run.sourceLabel ? <p className="mt-2 text-xs text-slate-400">来源：{run.sourceLabel}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <IconLink label="加载" href={`/?run=${encodeURIComponent(run.id)}#analysis-result`} icon={<Eye size={14} aria-hidden="true" />} />
                <IconButton
                  label="复制摘要"
                  onClick={() => onCopySummary(run.id)}
                  icon={<Copy size={14} aria-hidden="true" />}
                />
                <IconButton
                  label="删除"
                  onClick={() => onDelete(run.id)}
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  danger
                />
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
            {isLoading ? "正在读取历史运行..." : "还没有历史运行。完成一次分析后，这里会保存记录。"}
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
      className={`inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-semibold ${
        danger ? "border-red-100 text-red-600" : "border-slate-200 text-slate-600"
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
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600"
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
