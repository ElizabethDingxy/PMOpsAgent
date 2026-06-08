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
      ? "bg-pine/10 text-pine"
      : runtimeStatusTone === "mock"
        ? "bg-amber/10 text-slate-700"
        : "bg-slate-100 text-slate-500"

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">反馈输入</h2>
          <p className="mt-1 text-sm text-slate-500">上传 CSV、加载示例，或读取飞书多维表格。</p>
        </div>
        <div className="rounded-md bg-mist px-3 py-2 text-sm font-medium text-pine">
          {feedbackCount} 条
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-pine hover:bg-pine/5">
        <input
          ref={feedbackInputRef}
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          className="sr-only"
          onChange={handleFileChange}
        />
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-white p-2 text-pine shadow-sm">
            <FileUp size={20} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">上传反馈 CSV</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              点击此区域选择用户反馈文件。支持 content、反馈内容、用户反馈、source、created_at 等字段。
            </p>
            <button
              type="button"
              onClick={() => feedbackInputRef.current?.click()}
              className="mt-3 inline-flex rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-pine shadow-sm"
            >
              选择反馈 CSV
            </button>
          </div>
        </div>
      </div>

      {sourceLabel ? (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">当前数据：{sourceLabel}</p>
      ) : null}

      <FeedbackPreview feedbackItems={feedbackItems} />

      <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-pine" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">业务数据</h3>
        </div>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">当前业务目标</span>
            <input
              value={businessGoal}
              onChange={(event) => onBusinessGoalChange(event.target.value)}
              placeholder="例如：提升新用户首周激活率"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-pine"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">北极星指标</span>
            <input
              value={northStarMetric}
              onChange={(event) => onNorthStarMetricChange(event.target.value)}
              placeholder="例如：每周完成一次有效分析的用户数"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-pine"
            />
          </label>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={onLoadSample}
          disabled={isLoadingSample}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm"
        >
          <Rows3 size={17} aria-hidden="true" />
          {isLoadingSample ? "加载中" : "加载示例反馈"}
        </button>
        <button
          type="button"
          onClick={onLoadFeishuBitable}
          disabled={!feishuBitableConfigured || isLoadingBitable}
          title={feishuBitableConfigured ? "从飞书多维表格读取反馈" : "请先配置飞书多维表格环境变量"}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <Table2 size={17} aria-hidden="true" />
          {isLoadingBitable ? "读取中" : "读取飞书表格"}
        </button>
        <button
          type="button"
          onClick={onStartAnalysis}
          disabled={feedbackCount === 0 || isAnalyzing}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-pine px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Play size={17} aria-hidden="true" />
          {isAnalyzing ? "分析中" : "开始分析"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-3">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 shrink-0 text-red-600" size={17} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-red-700">{error.title}</p>
              <p className="mt-1 text-sm leading-6 text-red-700">{error.message}</p>
              <p className="mt-1 text-sm leading-6 text-red-600">{error.fix}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`mt-5 rounded-md px-3 py-2 text-sm ${runtimeToneClass}`}>
        {runtimeStatusLabel}
      </div>
    </section>
  )
}

function FeedbackPreview({ feedbackItems }: { feedbackItems: FeedbackItem[] }) {
  if (feedbackItems.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-500">
        尚未读取反馈。请上传反馈 CSV 或加载示例数据。
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-pine/15 bg-pine/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">已读取反馈</h3>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-pine">
          {feedbackItems.length} 条
        </span>
      </div>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
        {feedbackItems.slice(0, 6).map((item) => (
          <article key={item.id} className="rounded-md bg-white px-3 py-2 text-sm shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-pine">{item.id}</span>
              {item.userType ? <span>{item.userType}</span> : null}
              {item.source ? <span>{item.source}</span> : null}
              {item.createdAt ? <span>{item.createdAt}</span> : null}
            </div>
            <p className="mt-1 line-clamp-3 leading-6 text-slate-700">{item.content}</p>
          </article>
        ))}
      </div>
      {feedbackItems.length > 6 ? (
        <p className="mt-3 text-xs text-slate-500">还有 {feedbackItems.length - 6} 条反馈未展示。</p>
      ) : null}
    </div>
  )
}
