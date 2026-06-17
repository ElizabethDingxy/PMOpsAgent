"use client"

import { AlertCircle, BarChart3, FileUp, Play, Rows3, Table2 } from "lucide-react"
import { useRef, type ChangeEvent } from "react"
import type { FeedbackItem } from "@/types/product"

export type UploadError = {
  title: string
  message: string
  fix: string
}

type UploadPanelProps = {
  feedbackCount: number
  feedbackItems: FeedbackItem[]
  error?: UploadError | null
  isLoadingSample?: boolean
  isLoadingBitable?: boolean
  isAnalyzing?: boolean
  sourceLabel?: string
  businessGoal: string
  northStarMetric: string
  feishuBitableConfigured: boolean
  runtimeStatusLabel: string
  runtimeStatusTone: "ready" | "mock" | "unknown"
  onLoadSample: () => void
  onLoadFeishuBitable: () => void
  onUploadCsv: (file: File) => void
  onBusinessGoalChange: (value: string) => void
  onNorthStarMetricChange: (value: string) => void
  onStartAnalysis: () => void
}

export function UploadPanel({
  feedbackCount,
  feedbackItems,
  error,
  isLoadingSample = false,
  isLoadingBitable = false,
  isAnalyzing = false,
  sourceLabel,
  businessGoal,
  northStarMetric,
  feishuBitableConfigured,
  runtimeStatusLabel,
  runtimeStatusTone,
  onLoadSample,
  onLoadFeishuBitable,
  onUploadCsv,
  onBusinessGoalChange,
  onNorthStarMetricChange,
  onStartAnalysis,
}: UploadPanelProps) {
  const feedbackInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (file) {
      onUploadCsv(file)
    }

    event.target.value = ""
  }

  const runtimeToneClass =
    runtimeStatusTone === "ready"
      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-[inset_0_0_12px_rgba(16,185,129,0.05)] animate-pulse-glow"
      : runtimeStatusTone === "mock"
        ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse-glow-amber"
        : "bg-slate-800/50 border border-slate-700/50 text-slate-400"

  return (
    <section className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
        <div>
          <h2 className="text-md font-bold text-slate-100 tracking-tight">配置面板 / Configuration</h2>
          <p className="mt-1 text-xs text-slate-400">设置业务指标，导入用户反馈数据并启动 AI 分析。</p>
        </div>
        <div className="shrink-0 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 text-xs font-semibold text-indigo-400">
          {feedbackCount} 条反馈
        </div>
      </div>

      {/* CSV Uploader */}
      <div className="mt-5 rounded-xl border border-dashed border-slate-800 bg-[#0e1320]/40 p-5 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all duration-300 group">
        <input
          ref={feedbackInputRef}
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          className="sr-only"
          onChange={handleFileChange}
        />
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-[#161b2a] border border-slate-800 p-2.5 text-indigo-400 shadow-md group-hover:border-indigo-500/30 group-hover:text-indigo-300 transition-all">
            <FileUp size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-200">导入反馈数据集</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              选择本地 CSV 格式反馈文件。需包含 content 或反馈内容字段，支持解析 source 和时间属性。
            </p>
            <button
              type="button"
              onClick={() => feedbackInputRef.current?.click()}
              className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-all shadow-sm"
            >
              浏览本地 CSV
            </button>
          </div>
        </div>
      </div>

      {sourceLabel ? (
        <div className="mt-3.5 rounded-lg bg-[#0e1320]/80 border border-slate-800/80 px-3.5 py-2 text-xs text-indigo-400 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping"></span>
          <span className="truncate">数据源：{sourceLabel}</span>
        </div>
      ) : null}

      <FeedbackPreview feedbackItems={feedbackItems} />

      {/* Business Metrics */}
      <div className="mt-5 rounded-xl border border-slate-800 bg-[#0e1320]/40 p-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
          <BarChart3 size={16} className="text-indigo-400" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Context / 业务上下文</h3>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-400">核心业务目标</span>
            <input
              value={businessGoal}
              onChange={(event) => onBusinessGoalChange(event.target.value)}
              placeholder="例如：提升求职助手分析转化率"
              className="mt-1.5 w-full rounded-lg border border-slate-850 bg-[#07090f] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 transition-all"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-400">北极星指标 (KPI)</span>
            <input
              value={northStarMetric}
              onChange={(event) => onNorthStarMetricChange(event.target.value)}
              placeholder="例如：每周完成并导出的团队活跃数"
              className="mt-1.5 w-full rounded-lg border border-slate-850 bg-[#07090f] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 transition-all"
            />
          </label>
        </div>
      </div>

      {/* Buttons */}
      <div className="mt-5 grid grid-cols-1 gap-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onLoadSample}
            disabled={isLoadingSample}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#121826]/80 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-[#182033] hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-40 transition-all"
          >
            <Rows3 size={15} aria-hidden="true" />
            {isLoadingSample ? "载入中..." : "加载示例反馈"}
          </button>
          <button
            type="button"
            onClick={onLoadFeishuBitable}
            disabled={!feishuBitableConfigured || isLoadingBitable}
            title={feishuBitableConfigured ? "从飞书多维表格读取反馈" : "请先配置飞书多维表格环境变量"}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#121826]/80 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-[#182033] hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-40 transition-all"
          >
            <Table2 size={15} aria-hidden="true" />
            {isLoadingBitable ? "同步中..." : "读取飞书表格"}
          </button>
        </div>
        <button
          type="button"
          onClick={onStartAnalysis}
          disabled={feedbackCount === 0 || isAnalyzing}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-sm font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.25)] hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-all duration-300 py-3 disabled:cursor-not-allowed disabled:opacity-40 disabled:from-slate-800 disabled:to-slate-900 disabled:shadow-none disabled:text-slate-500"
        >
          <Play size={15} aria-hidden="true" />
          {isAnalyzing ? "正在进行 AI 深度分析..." : "开始 AI 自动分析"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 shrink-0 text-rose-400" size={16} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-rose-300 tracking-tight">{error.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-rose-400">{error.message}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400 font-mono">建议操作：{error.fix}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`mt-4 rounded-lg px-3.5 py-2.5 text-xs font-mono border flex items-center justify-between ${runtimeToneClass}`}>
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${runtimeStatusTone === 'ready' ? 'bg-emerald-400' : runtimeStatusTone === 'mock' ? 'bg-amber-400' : 'bg-slate-500'}`}></span>
          模型环境：{runtimeStatusLabel}
        </span>
      </div>
    </section>
  )
}

function FeedbackPreview({ feedbackItems }: { feedbackItems: FeedbackItem[] }) {
  if (feedbackItems.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-slate-800 bg-[#0e1320]/20 px-4 py-6 text-center text-xs text-slate-500">
        暂无待分析的反馈，请加载示例数据或上传本地 CSV 文件。
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-800/80 bg-[#121826]/40 p-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">反馈预览</h3>
        <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
          第 1-6 条
        </span>
      </div>
      <div className="max-h-60 space-y-2.5 overflow-y-auto pr-1">
        {feedbackItems.slice(0, 6).map((item) => (
          <article key={item.id} className="rounded-lg bg-[#0d101d] border border-slate-850 p-3 hover:border-slate-800 transition-all">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/40 pb-1 mb-1.5 text-[10px] font-mono text-slate-500">
              <span className="font-bold text-indigo-400">{item.id}</span>
              <div className="flex gap-2">
                {item.userType ? <span className="bg-slate-800 px-1.5 py-0.5 rounded">{item.userType}</span> : null}
                {item.source ? <span className="bg-[#182030] px-1.5 py-0.5 rounded text-slate-400">{item.source}</span> : null}
                {item.createdAt ? <span>{item.createdAt}</span> : null}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-300 break-all">{item.content}</p>
          </article>
        ))}
      </div>
      {feedbackItems.length > 6 ? (
        <p className="mt-2.5 text-center text-[10px] text-slate-500 font-mono">
          ... 还有 {feedbackItems.length - 6} 条用户反馈数据已读入
        </p>
      ) : null}
    </div>
  )
}
