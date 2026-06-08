"use client"

import { useEffect, useState } from "react"
import { AgentTrace } from "@/components/AgentTrace"
import { ApprovalPanel, type ApprovalStatus } from "@/components/ApprovalPanel"
import { EditablePrd } from "@/components/EditablePrd"
import { EditableTasks } from "@/components/EditableTasks"
import { InsightCards } from "@/components/InsightCards"
import { RunHistory } from "@/components/RunHistory"
import { TapdTaskPanel, type TapdProjectConfig } from "@/components/TapdTaskPanel"
import { UploadPanel, type UploadError } from "@/components/UploadPanel"
import { CsvParseError, parseFeedbackCsv } from "@/lib/csv/parseFeedbackCsv"
import { MetricCsvParseError, parseMetricCsv } from "@/lib/csv/parseMetricCsv"
import { createClientTraceEvent } from "@/lib/trace/traceTypes"
import type { TraceEvent } from "@/types/agent"
import type { AgentResult, AgentRun, BusinessMetric, FeedbackItem, SavedAgentRun, SavedAgentRunSummary } from "@/types/product"

const tapdProjectConfigStorageKey = "pmops.tapdProjectConfig.v1"
const emptyTapdProjectConfig: TapdProjectConfig = {
  workspaceId: "",
  owner: "",
  creator: "",
  iterationId: "",
}

type DemoShellProps = {
  initialSavedRuns?: SavedAgentRunSummary[]
  initialSelectedRun?: SavedAgentRun
}

export function DemoShell({ initialSavedRuns = [], initialSelectedRun }: DemoShellProps) {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>(initialSelectedRun?.feedbackItems ?? [])
  const [businessGoal, setBusinessGoal] = useState(initialSelectedRun?.businessContext?.businessGoal ?? "")
  const [northStarMetric, setNorthStarMetric] = useState(initialSelectedRun?.businessContext?.northStarMetric ?? "")
  const [businessMetrics, setBusinessMetrics] = useState<BusinessMetric[]>(initialSelectedRun?.businessContext?.metrics ?? [])
  const [metricsSourceLabel, setMetricsSourceLabel] = useState(initialSelectedRun?.businessContext?.metricsSourceLabel ?? "")
  const [agentRun, setAgentRun] = useState<AgentRun | null>(initialSelectedRun?.run ?? null)
  const [draftResult, setDraftResult] = useState<AgentResult | null>(initialSelectedRun?.run.result ?? null)
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>(initialSelectedRun?.run.result.trace ?? [])
  const [uploadError, setUploadError] = useState<UploadError | null>(null)
  const [notice, setNotice] = useState<string>(
    initialSelectedRun ? `已加载历史运行：${initialSelectedRun.run.result.productName}` : "请先上传 CSV 或加载示例反馈。",
  )
  const [isLoadingSample, setIsLoadingSample] = useState(false)
  const [isLoadingBitable, setIsLoadingBitable] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isCreatingPrdDoc, setIsCreatingPrdDoc] = useState(false)
  const [isCreatingTapd, setIsCreatingTapd] = useState(false)
  const [sourceLabel, setSourceLabel] = useState<string>(initialSelectedRun?.sourceLabel ?? "")
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null)
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("draft_generated")
  const [sendStatusMessage, setSendStatusMessage] = useState(initialSelectedRun ? "已加载历史草稿，请确认或编辑后再发送。" : "")
  const [tapdStatusMessage, setTapdStatusMessage] = useState(
    initialSelectedRun ? "已加载历史研发任务，确认后可创建 TAPD 需求/任务。" : "",
  )
  const [selectedTapdTaskIndexes, setSelectedTapdTaskIndexes] = useState<number[]>(
    initialSelectedRun?.run.result.engineeringTasks.map((_, index) => index) ?? [],
  )
  const [tapdProjectConfig, setTapdProjectConfig] = useState<TapdProjectConfig>(emptyTapdProjectConfig)
  const [savedRuns, setSavedRuns] = useState<SavedAgentRunSummary[]>(initialSavedRuns)
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [runHistoryError, setRunHistoryError] = useState("")

  useEffect(() => {
    let ignore = false

    async function loadRuntimeConfig() {
      try {
        const response = await fetch("/api/runtime-config")
        const payload = (await response.json()) as RuntimeConfigResponse

        if (!ignore && payload.ok) {
          setRuntimeConfig({
            deepseekConfigured: payload.deepseekConfigured,
            feishuWebhookConfigured: payload.feishuWebhookConfigured,
            feishuBitableConfigured: payload.feishuBitableConfigured,
            feishuBitableViewConfigured: payload.feishuBitableViewConfigured,
            feishuDocumentConfigured: payload.feishuDocumentConfigured,
            feishuDocumentFolderConfigured: payload.feishuDocumentFolderConfigured,
            feishuDocumentBaseUrlConfigured: payload.feishuDocumentBaseUrlConfigured,
            tapdConfigured: payload.tapdConfigured,
            tapdWorkspaceConfigured: payload.tapdWorkspaceConfigured,
            tapdOwnerConfigured: payload.tapdOwnerConfigured,
            tapdIterationConfigured: payload.tapdIterationConfigured,
            model: payload.model,
          })
        }
      } catch {
        if (!ignore) {
          setRuntimeConfig(null)
        }
      }
    }

    void loadRuntimeConfig()
    void loadRunHistory()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(tapdProjectConfigStorageKey)
      if (!rawValue) return

      const parsed = JSON.parse(rawValue) as Partial<TapdProjectConfig>
      setTapdProjectConfig({
        workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : "",
        owner: typeof parsed.owner === "string" ? parsed.owner : "",
        creator: typeof parsed.creator === "string" ? parsed.creator : "",
        iterationId: typeof parsed.iterationId === "string" ? parsed.iterationId : "",
      })
    } catch {
      // Ignore malformed local TAPD project config.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(tapdProjectConfigStorageKey, JSON.stringify(tapdProjectConfig))
    } catch {
      // Local persistence is a convenience; creation can still proceed with the in-memory value.
    }
  }, [tapdProjectConfig])

  async function handleLoadSample() {
    setIsLoadingSample(true)
    setUploadError(null)
    setNotice("正在读取 data/sample-feedback.csv。")

    try {
      const response = await fetch("/api/sample-feedback")

      if (!response.ok) {
        throw new Error("示例反馈文件读取失败。")
      }

      const csvText = await response.text()
      const items = parseFeedbackCsv(csvText)
      setFeedbackItems(items)
      setAgentRun(null)
      setDraftResult(null)
      setTraceEvents([])
      setApprovalStatus("draft_generated")
      setSendStatusMessage("")
      setTapdStatusMessage("")
      setSelectedTapdTaskIndexes([])
      setSourceLabel("data/sample-feedback.csv")
      setNotice(`已加载示例反馈：${items.length} 条。`)
    } catch (error) {
      setFeedbackItems([])
      setAgentRun(null)
      setDraftResult(null)
      setTraceEvents([])
      setApprovalStatus("draft_generated")
      setSendStatusMessage("")
      setTapdStatusMessage("")
      setSelectedTapdTaskIndexes([])
      setSourceLabel("")
      setUploadError(toUploadError(error))
      setNotice("示例反馈加载失败。")
    } finally {
      setIsLoadingSample(false)
    }
  }

  async function handleUploadCsv(file: File) {
    setUploadError(null)
    setNotice(`正在解析 ${file.name}。`)

    try {
      const csvText = await readCsvFileText(file)
      const items = parseFeedbackCsv(csvText)
      setFeedbackItems(items)
      setAgentRun(null)
      setDraftResult(null)
      setTraceEvents([])
      setApprovalStatus("draft_generated")
      setSendStatusMessage("")
      setTapdStatusMessage("")
      setSelectedTapdTaskIndexes([])
      setSourceLabel(file.name)
      setNotice(`已解析 ${file.name}：${items.length} 条反馈。`)
    } catch (error) {
      setFeedbackItems([])
      setAgentRun(null)
      setDraftResult(null)
      setTraceEvents([])
      setApprovalStatus("draft_generated")
      setSendStatusMessage("")
      setTapdStatusMessage("")
      setSelectedTapdTaskIndexes([])
      setSourceLabel("")
      setUploadError(toUploadError(error))
      setNotice("CSV 解析失败。")
    }
  }

  async function handleUploadMetricCsv(file: File) {
    setUploadError(null)
    setNotice(`正在解析指标文件 ${file.name}。`)

    try {
      const csvText = await readCsvFileText(file)
      const metrics = parseMetricCsv(csvText)
      setBusinessMetrics(metrics)
      setMetricsSourceLabel(file.name)
      setNotice(`已解析 ${file.name}：${metrics.length} 条业务指标。`)
    } catch (error) {
      setBusinessMetrics([])
      setMetricsSourceLabel("")
      setUploadError(toMetricUploadError(error))
      setNotice("指标 CSV 解析失败。")
    }
  }

  async function handleLoadSampleMetrics() {
    setUploadError(null)
    setNotice("正在读取 data/sample-metrics.csv。")

    try {
      const response = await fetch("/api/sample-metrics")

      if (!response.ok) {
        throw new Error("示例指标文件读取失败。")
      }

      const csvText = await response.text()
      const metrics = parseMetricCsv(csvText)
      setBusinessGoal("提升 PMOpsAgent 分析到 PRD/TAPD 交付的转化率")
      setNorthStarMetric("每周完成一次有效分析并进入评审的团队数")
      setBusinessMetrics(metrics)
      setMetricsSourceLabel("data/sample-metrics.csv")
      setNotice(`已加载示例指标：${metrics.length} 条。`)
    } catch (error) {
      setBusinessMetrics([])
      setMetricsSourceLabel("")
      setUploadError(toMetricUploadError(error))
      setNotice("示例指标加载失败。")
    }
  }

  async function handleLoadFeishuBitable() {
    setIsLoadingBitable(true)
    setUploadError(null)
    setNotice("正在读取飞书多维表格反馈。")

    try {
      const response = await fetch("/api/feishu/bitable-feedback")
      const payload = (await response.json()) as FeishuBitableFeedbackResponse

      if (!payload.ok) {
        throw new FeishuBitableReadError(payload.error.message, payload.error.fix)
      }

      setFeedbackItems(payload.feedbackItems)
      setAgentRun(null)
      setDraftResult(null)
      setTraceEvents([])
      setApprovalStatus("draft_generated")
      setSendStatusMessage("")
      setTapdStatusMessage("")
      setSelectedTapdTaskIndexes([])
      setSourceLabel(payload.sourceLabel)
      setNotice(`已读取飞书多维表格：${payload.feedbackItems.length} 条反馈。`)
    } catch (error) {
      setFeedbackItems([])
      setAgentRun(null)
      setDraftResult(null)
      setTraceEvents([])
      setApprovalStatus("draft_generated")
      setSendStatusMessage("")
      setTapdStatusMessage("")
      setSelectedTapdTaskIndexes([])
      setSourceLabel("")
      setUploadError(toFeishuBitableUploadError(error))
      setNotice("飞书多维表格读取失败。")
    } finally {
      setIsLoadingBitable(false)
    }
  }

  async function handleStartAnalysis() {
    if (feedbackItems.length === 0) {
      setUploadError({
        title: "还没有用户反馈",
        message: "当前没有可分析的 FeedbackItem。",
        fix: "请先上传 CSV 或加载示例反馈，再开始分析。",
      })
      return
    }

    setIsAnalyzing(true)
    setUploadError(null)
    setAgentRun(null)
    setDraftResult(null)
    setTraceEvents(createAnalyzingTrace(feedbackItems.length))
    setApprovalStatus("draft_generated")
    setSendStatusMessage("")
    setTapdStatusMessage("")
    setSelectedTapdTaskIndexes([])
    setNotice("Agent 正在分析反馈。")

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          feedbackItems,
          businessContext: {
            businessGoal,
            northStarMetric,
            metrics: businessMetrics,
            metricsSourceLabel,
          },
          sourceLabel: sourceLabel || "手动上传 CSV",
        }),
      })
      const payload = (await response.json()) as AnalyzeResponse

      if (!payload.ok) {
        throw new AnalyzeError(payload.error.message, payload.error.fix, payload.error.trace)
      }

      setAgentRun(payload.run)
      setDraftResult(payload.run.result)
      setTraceEvents(payload.run.result.trace)
      setApprovalStatus("draft_generated")
      setSendStatusMessage("草稿已生成，请确认或编辑后再发送。")
      setTapdStatusMessage("已生成研发任务草稿，确认后可创建 TAPD 需求/任务。")
      setSelectedTapdTaskIndexes(payload.run.result.engineeringTasks.map((_, index) => index))
      void loadRunHistory()
      setNotice(payload.run.message)
    } catch (error) {
      setAgentRun(null)
      setDraftResult(null)
      setApprovalStatus("draft_generated")
      setTapdStatusMessage("")
      setSelectedTapdTaskIndexes([])
      if (error instanceof AnalyzeError && error.trace?.length) {
        setTraceEvents(error.trace)
      }
      setUploadError(toAnalyzeUploadError(error))
      setNotice("Agent 分析失败。")
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function loadRunHistory() {
    setIsLoadingRuns(true)
    setRunHistoryError("")

    try {
      const response = await fetch("/api/runs")
      const payload = (await response.json()) as RunListResponse

      if (payload.ok) {
        setSavedRuns(payload.runs)
      } else {
        setRunHistoryError(payload.error?.message || "历史运行读取失败。")
      }
    } catch (error) {
      setRunHistoryError(error instanceof Error ? error.message : "历史运行读取失败。")
    } finally {
      setIsLoadingRuns(false)
    }
  }

  async function handleCopyHistorySummary(id: string) {
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(id)}`)
      const payload = (await response.json()) as RunDetailResponse

      if (!payload.ok) {
        throw new Error(payload.error.message)
      }

      await navigator.clipboard.writeText(payload.run.run.result.feishuReviewMessage)
      setSendStatusMessage("历史飞书摘要已复制。")
    } catch (error) {
      setSendStatusMessage(error instanceof Error ? error.message : "复制历史摘要失败。")
    }
  }

  async function handleDeleteRun(id: string) {
    const confirmed = window.confirm("确认删除这条本地历史运行记录吗？")

    if (!confirmed) return

    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      const payload = (await response.json()) as DeleteRunResponse

      if (!payload.ok) {
        throw new Error(payload.error.message)
      }

      if (agentRun?.runId === id) {
        setAgentRun(null)
        setDraftResult(null)
        setTraceEvents([])
        setApprovalStatus("draft_generated")
        setTapdStatusMessage("")
        setSelectedTapdTaskIndexes([])
      }

      await loadRunHistory()
      setNotice("历史运行已删除。")
    } catch (error) {
      setUploadError({
        title: "历史运行删除失败",
        message: error instanceof Error ? error.message : "无法删除该历史记录。",
        fix: "请刷新历史列表后重试。",
      })
    }
  }

  async function handleSendFeishu() {
    if (!draftResult?.feishuReviewMessage || !agentRun) {
      setApprovalStatus("failed")
      setSendStatusMessage("请先运行 Agent 生成飞书评审摘要。")
      return
    }

    if (approvalStatus !== "approved") {
      setSendStatusMessage("请先点击“确认通过”，再发送到飞书。")
      return
    }

    setApprovalStatus("sending")
    setSendStatusMessage("正在发送飞书评审摘要。")
    setTraceEvents(markSendTraceRunning(visibleTrace))

    try {
      const response = await fetch("/api/send-feishu", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: draftResult.feishuReviewMessage,
          runId: agentRun.runId,
        }),
      })
      const payload = (await response.json()) as SendFeishuResponse

      if (!payload.ok) {
        throw new SendFeishuError(payload.error.message, payload.error.fix, payload.error.trace)
      }

      setTraceEvents(payload.trace)
      setApprovalStatus("sent")
      setSendStatusMessage("飞书评审摘要已发送。")
    } catch (error) {
      if (error instanceof SendFeishuError && error.trace?.length) {
        setTraceEvents(error.trace)
      } else {
        setTraceEvents(markSendTraceFailed(visibleTrace, toErrorMessage(error)))
      }

      setApprovalStatus("failed")
      setSendStatusMessage(error instanceof SendFeishuError ? `${error.message} ${error.fix ?? ""}`.trim() : "飞书发送失败。")
    }
  }

  async function handleCopySummary() {
    const message = draftResult?.feishuReviewMessage ?? ""

    if (!message.trim()) {
      setSendStatusMessage("暂无可复制的飞书摘要。")
      return
    }

    try {
      await navigator.clipboard.writeText(message)
      setSendStatusMessage("飞书摘要已复制。")
    } catch {
      setSendStatusMessage("复制失败，请手动选中摘要文本复制。")
    }
  }

  function handleCancelSend() {
    setApprovalStatus("cancelled")
    setTraceEvents(markApprovalTrace(visibleTrace, "approval_cancelled", "已取消发送，草稿仍保留。"))
    setSendStatusMessage("已取消发送。本次不会向飞书群发送消息，草稿仍保留。")
  }

  function handleApproveDraft() {
    if (!draftResult?.feishuReviewMessage.trim()) {
      setSendStatusMessage("飞书摘要为空，无法确认。")
      return
    }

    setApprovalStatus("approved")
    setTraceEvents(markApprovalTrace(visibleTrace, "approval_confirmed", "用户已确认飞书摘要，可以发送。"))
    setSendStatusMessage("草稿已确认。现在可以发送到飞书。")
  }

  async function handleCreatePrdDocument() {
    if (!draftResult || !agentRun) {
      setSendStatusMessage("请先运行 Agent 生成 PRD 草稿。")
      return
    }

    if (approvalStatus !== "approved") {
      setSendStatusMessage("请先点击“确认通过”，再创建飞书 PRD 文档。")
      return
    }

    setIsCreatingPrdDoc(true)
    setSendStatusMessage("正在创建飞书 PRD 文档。")
    setTraceEvents(markPrdDocTraceRunning(visibleTrace))

    try {
      const response = await fetch("/api/feishu/prd-document", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: draftResult,
          runId: agentRun.runId,
        }),
      })
      const payload = (await response.json()) as CreatePrdDocumentResponse

      if (!payload.ok) {
        throw new CreatePrdDocumentError(payload.error.message, payload.error.fix, payload.error.trace)
      }

      const nextMessage = appendPrdDocumentLink(draftResult.feishuReviewMessage, payload.document.url)

      setDraftResult({
        ...draftResult,
        feishuReviewMessage: nextMessage,
        prdDocumentUrl: payload.document.url,
      })
      setTraceEvents(payload.trace)
      setApprovalStatus("approved")
      setSendStatusMessage(payload.document.url ? "飞书 PRD 文档已创建，链接已追加到飞书摘要。" : "飞书 PRD 文档已创建。")
    } catch (error) {
      if (error instanceof CreatePrdDocumentError && error.trace?.length) {
        setTraceEvents(error.trace)
      } else {
        setTraceEvents(markPrdDocTraceFailed(visibleTrace, toErrorMessage(error)))
      }

      setSendStatusMessage(error instanceof CreatePrdDocumentError ? `${error.message} ${error.fix ?? ""}`.trim() : "飞书 PRD 文档创建失败。")
    } finally {
      setIsCreatingPrdDoc(false)
    }
  }

  async function handleCreateTapdWorkItems() {
    if (!draftResult || !agentRun) {
      setTapdStatusMessage("请先运行 Agent 生成研发任务草稿。")
      return
    }

    if (approvalStatus !== "approved") {
      setTapdStatusMessage("请先点击“确认通过”，再创建 TAPD 需求/任务。")
      return
    }

    if (selectedTapdTaskIndexes.length === 0) {
      setTapdStatusMessage("请至少选择一个研发任务。")
      return
    }

    setIsCreatingTapd(true)
    setTapdStatusMessage("正在创建 TAPD 需求与任务。")
    setTraceEvents(markTapdTraceRunning(visibleTrace))

    try {
      const response = await fetch("/api/tapd/work-items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          result: draftResult,
          selectedTaskIndexes: selectedTapdTaskIndexes,
          runId: agentRun.runId,
          tapdConfig: compactTapdProjectConfig(tapdProjectConfig),
        }),
      })
      const payload = (await response.json()) as CreateTapdWorkItemsResponse

      if (!payload.ok) {
        throw new CreateTapdWorkItemsError(payload.error.message, payload.error.fix, payload.error.trace)
      }

      const nextMessage = appendTapdLinks(draftResult.feishuReviewMessage, payload.created)

      setDraftResult({
        ...draftResult,
        feishuReviewMessage: nextMessage,
        tapdWorkItems: payload.created,
      })
      setTraceEvents(payload.trace)
      setApprovalStatus("approved")
      setTapdStatusMessage(`已创建 1 个 TAPD 需求和 ${payload.created.tasks.length} 个 TAPD 任务，链接已追加到飞书摘要。`)
    } catch (error) {
      if (error instanceof CreateTapdWorkItemsError && error.trace?.length) {
        setTraceEvents(error.trace)
      } else {
        setTraceEvents(markTapdTraceFailed(visibleTrace, toErrorMessage(error)))
      }

      setTapdStatusMessage(error instanceof CreateTapdWorkItemsError ? `${error.message} ${error.fix ?? ""}`.trim() : "TAPD 需求/任务创建失败。")
    } finally {
      setIsCreatingTapd(false)
    }
  }

  const agentResult = draftResult ?? agentRun?.result
  const visibleTrace = traceEvents.length > 0 ? traceEvents : agentResult?.trace ?? []
  const hasApprovalDraft = Boolean(draftResult && agentRun)
  const feishuMessage = draftResult?.feishuReviewMessage ?? ""
  const webhookConfigured = Boolean(runtimeConfig?.feishuWebhookConfigured)
  const feishuDocumentConfigured = Boolean(runtimeConfig?.feishuDocumentConfigured)
  const tapdConfigured = Boolean(runtimeConfig?.tapdConfigured)
  const tapdDefaultWorkspaceConfigured = Boolean(runtimeConfig?.tapdWorkspaceConfigured)
  const tapdWorkspaceReady = Boolean(tapdProjectConfig.workspaceId.trim() || tapdDefaultWorkspaceConfigured)
  const canApproveDraft = Boolean(
    hasApprovalDraft && draftResult?.feishuReviewMessage.trim() && approvalStatus !== "sending" && approvalStatus !== "sent",
  )
  const canCreatePrdDoc = Boolean(hasApprovalDraft && feishuDocumentConfigured && approvalStatus === "approved" && !isCreatingPrdDoc)
  const canCreateTapd = Boolean(
    hasApprovalDraft && tapdConfigured && tapdWorkspaceReady && approvalStatus === "approved" && selectedTapdTaskIndexes.length > 0 && !isCreatingTapd,
  )
  const canSendFeishu = Boolean(
    hasApprovalDraft && draftResult?.feishuReviewMessage.trim() && webhookConfigured && approvalStatus === "approved",
  )

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-panel lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-pine">AI Product Manager Agent</p>
            <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">PMOpsAgent</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              从用户反馈中提炼需求主题、MVP 范围、RICE 优先级、PRD 草稿和研发任务，并在发送飞书前等待用户审批。
            </p>
            <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{notice}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Metric label="反馈" value={String(feedbackItems.length)} />
            <Metric label="主题" value={String(agentResult?.demandClusters.length ?? 0)} />
            <Metric label="任务" value={String(agentResult?.engineeringTasks.length ?? 0)} />
          </div>
        </header>

        <div className="grid gap-6 xl:h-[calc(100vh-190px)] xl:min-h-[620px] xl:grid-cols-[340px_minmax(0,1fr)_420px]">
          <div className="min-h-0 space-y-6 xl:overflow-y-auto xl:pr-1">
            <UploadPanel
              feedbackCount={feedbackItems.length}
              feedbackItems={feedbackItems}
              error={uploadError}
              isLoadingSample={isLoadingSample}
              isLoadingBitable={isLoadingBitable}
              isAnalyzing={isAnalyzing}
              sourceLabel={sourceLabel}
              businessGoal={businessGoal}
              northStarMetric={northStarMetric}
              feishuBitableConfigured={Boolean(runtimeConfig?.feishuBitableConfigured)}
              runtimeStatusLabel={getRuntimeStatusLabel(runtimeConfig, agentRun)}
              runtimeStatusTone={getRuntimeStatusTone(runtimeConfig, agentRun)}
              onLoadSample={handleLoadSample}
              onLoadFeishuBitable={handleLoadFeishuBitable}
              onUploadCsv={handleUploadCsv}
              onBusinessGoalChange={setBusinessGoal}
              onNorthStarMetricChange={setNorthStarMetric}
              onStartAnalysis={handleStartAnalysis}
            />
            <AgentTrace trace={visibleTrace} />
            <RunHistory
              runs={savedRuns}
              isLoading={isLoadingRuns}
              errorMessage={runHistoryError}
              activeRunId={agentRun?.runId}
              onRefresh={loadRunHistory}
              onCopySummary={handleCopyHistorySummary}
              onDelete={handleDeleteRun}
            />
          </div>

          {agentResult ? (
            <div id="analysis-result" className="min-h-0 scroll-mt-6 space-y-5 xl:overflow-y-auto xl:pr-1">
              {agentRun ? <ResultModeBanner agentRun={agentRun} /> : null}
              <InsightCards
                clusters={agentResult.demandClusters}
                mvpScope={agentResult.mvpScope}
                riceItems={agentResult.ricePrioritization}
              />
            </div>
          ) : (
            <ResultEmptyState />
          )}

          <div className="min-h-0 space-y-6 xl:overflow-y-auto xl:pr-1">
            {agentResult ? (
              <>
                <EditablePrd
                  prd={agentResult.prd}
                  risks={agentResult.risks}
                  openQuestions={agentResult.openQuestions}
                  onChange={(prd) =>
                    updateDraftResult({
                      prd,
                    })
                  }
                />
                <EditableTasks
                  tasks={agentResult.engineeringTasks}
                  onChange={(engineeringTasks) =>
                    updateDraftResult({
                      engineeringTasks,
                    })
                  }
                />
                <TapdTaskPanel
                  tasks={agentResult.engineeringTasks}
                  selectedIndexes={selectedTapdTaskIndexes}
                  projectConfig={tapdProjectConfig}
                  tapdConfigured={tapdConfigured}
                  defaultWorkspaceConfigured={tapdDefaultWorkspaceConfigured}
                  canCreate={canCreateTapd}
                  isCreating={isCreatingTapd}
                  created={draftResult?.tapdWorkItems}
                  statusMessage={tapdStatusMessage}
                  onProjectConfigChange={setTapdProjectConfig}
                  onToggleTask={toggleTapdTaskSelection}
                  onSelectAll={() => setSelectedTapdTaskIndexes(agentResult.engineeringTasks.map((_, index) => index))}
                  onClearSelection={() => setSelectedTapdTaskIndexes([])}
                  onCreate={handleCreateTapdWorkItems}
                />
              </>
            ) : (
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
                <h2 className="text-base font-semibold text-ink">PRD 与任务草稿</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  加载反馈并点击“开始分析”后，这里会展示结构化 PRD、风险、开放问题和研发任务。
                </p>
              </section>
            )}
            <ApprovalPanel
              message={feishuMessage}
              hasDraft={hasApprovalDraft}
              canApprove={canApproveDraft}
              canCreatePrdDoc={canCreatePrdDoc}
              canSend={canSendFeishu}
              webhookConfigured={webhookConfigured}
              feishuDocumentConfigured={feishuDocumentConfigured}
              status={approvalStatus}
              statusMessage={sendStatusMessage}
              isCreatingPrdDoc={isCreatingPrdDoc}
              prdDocumentUrl={draftResult?.prdDocumentUrl}
              onMessageChange={(message) =>
                updateDraftResult({
                  feishuReviewMessage: message,
                })
              }
              onApprove={handleApproveDraft}
              onCreatePrdDoc={handleCreatePrdDocument}
              onSend={handleSendFeishu}
              onCopy={handleCopySummary}
              onCancel={handleCancelSend}
            />
          </div>
        </div>
      </div>
    </main>
  )

  function updateDraftResult(patch: Partial<AgentResult>) {
    setDraftResult((current) => {
      const base = current ?? agentRun?.result

      if (!base) return current

      return {
        ...base,
        ...patch,
        ...("prd" in patch || "engineeringTasks" in patch ? { prdDocumentUrl: undefined, tapdWorkItems: undefined } : {}),
      }
    })
    if ("engineeringTasks" in patch && patch.engineeringTasks) {
      setSelectedTapdTaskIndexes(patch.engineeringTasks.map((_, index) => index))
      setTapdStatusMessage("研发任务已修改，请重新确认后再创建 TAPD。")
    }
    setApprovalStatus("user_editing")
    setSendStatusMessage("草稿已修改，请重新确认后再发送。")
  }

  function toggleTapdTaskSelection(index: number) {
    setSelectedTapdTaskIndexes((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort((left, right) => left - right),
    )
  }
}

type AnalyzeResponse =
  | {
      ok: true
      run: AgentRun
    }
  | {
      ok: false
      error: {
        code: string
        message: string
        fix?: string
        trace?: TraceEvent[]
      }
    }

type RuntimeConfig = {
  deepseekConfigured: boolean
  feishuWebhookConfigured: boolean
  feishuSecretConfigured?: boolean
  feishuBitableConfigured?: boolean
  feishuBitableViewConfigured?: boolean
  feishuDocumentConfigured?: boolean
  feishuDocumentFolderConfigured?: boolean
  feishuDocumentBaseUrlConfigured?: boolean
  tapdConfigured?: boolean
  tapdWorkspaceConfigured?: boolean
  tapdOwnerConfigured?: boolean
  tapdIterationConfigured?: boolean
  model: string
}

type RuntimeConfigResponse =
  | {
      ok: true
      deepseekConfigured: boolean
      feishuWebhookConfigured: boolean
      feishuSecretConfigured?: boolean
      feishuBitableConfigured?: boolean
      feishuBitableViewConfigured?: boolean
      feishuDocumentConfigured?: boolean
      feishuDocumentFolderConfigured?: boolean
      feishuDocumentBaseUrlConfigured?: boolean
      tapdConfigured?: boolean
      tapdWorkspaceConfigured?: boolean
      tapdOwnerConfigured?: boolean
      tapdIterationConfigured?: boolean
      model: string
    }

type FeishuBitableFeedbackResponse =
  | {
      ok: true
      feedbackItems: FeedbackItem[]
      sourceLabel: string
    }
  | {
      ok: false
      error: {
        code: string
        message: string
        fix?: string
      }
    }

type RunListResponse =
  | {
      ok: true
      runs: SavedAgentRunSummary[]
    }
  | {
      ok: false
      error: {
        message: string
      }
    }

type RunDetailResponse =
  | {
      ok: true
      run: SavedAgentRun
    }
  | {
      ok: false
      error: {
        message: string
      }
    }

type DeleteRunResponse =
  | {
      ok: true
    }
  | {
      ok: false
      error: {
        message: string
      }
    }

class AnalyzeError extends Error {
  fix?: string
  trace?: TraceEvent[]

  constructor(message: string, fix?: string, trace?: TraceEvent[]) {
    super(message)
    this.name = "AnalyzeError"
    this.fix = fix
    this.trace = trace
  }
}

class FeishuBitableReadError extends Error {
  fix?: string

  constructor(message: string, fix?: string) {
    super(message)
    this.name = "FeishuBitableReadError"
    this.fix = fix
  }
}

type SendFeishuResponse =
  | {
      ok: true
      trace: TraceEvent[]
    }
  | {
      ok: false
      error: {
        code: string
        message: string
        fix?: string
        trace?: TraceEvent[]
      }
    }

type CreatePrdDocumentResponse =
  | {
      ok: true
      document: {
        documentId: string
        title: string
        url?: string
      }
      trace: TraceEvent[]
    }
  | {
      ok: false
      error: {
        code: string
        message: string
        fix?: string
        trace?: TraceEvent[]
      }
    }

type CreateTapdWorkItemsResponse =
  | {
      ok: true
      created: {
        story: {
          id: string
          title: string
          url: string
        }
        tasks: Array<{
          id: string
          title: string
          url: string
        }>
      }
      trace: TraceEvent[]
    }
  | {
      ok: false
      error: {
        code: string
        message: string
        fix?: string
        trace?: TraceEvent[]
      }
    }

type TapdCreatedPayload = Extract<CreateTapdWorkItemsResponse, { ok: true }>["created"]

class SendFeishuError extends Error {
  fix?: string
  trace?: TraceEvent[]

  constructor(message: string, fix?: string, trace?: TraceEvent[]) {
    super(message)
    this.name = "SendFeishuError"
    this.fix = fix
    this.trace = trace
  }
}

class CreatePrdDocumentError extends Error {
  fix?: string
  trace?: TraceEvent[]

  constructor(message: string, fix?: string, trace?: TraceEvent[]) {
    super(message)
    this.name = "CreatePrdDocumentError"
    this.fix = fix
    this.trace = trace
  }
}

class CreateTapdWorkItemsError extends Error {
  fix?: string
  trace?: TraceEvent[]

  constructor(message: string, fix?: string, trace?: TraceEvent[]) {
    super(message)
    this.name = "CreateTapdWorkItemsError"
    this.fix = fix
    this.trace = trace
  }
}

function ResultModeBanner({ agentRun }: { agentRun: AgentRun }) {
  return (
    <section className="rounded-lg border border-amber/20 bg-amber/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{agentRun.isMock ? "Mock 分析结果" : "LLM 分析结果"}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{agentRun.message}</p>
        </div>
        <span className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          mode: {agentRun.mode}
        </span>
      </div>
    </section>
  )
}

function ResultEmptyState() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-base font-semibold text-ink">结果预览</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        当前还没有 Agent 结果。请先读取至少 3 条反馈，然后点击“开始分析”。
      </p>
      <div className="mt-5 grid gap-3">
        {["需求主题", "MVP 范围", "RICE 优先级"].map((item) => (
          <div key={item} className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {item} 将在分析完成后显示。
          </div>
        ))}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <p className="text-xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  )
}

function toUploadError(error: unknown): UploadError {
  if (error instanceof CsvParseError) {
    return {
      title: "CSV 解析失败",
      message: error.message,
      fix: error.fix,
    }
  }

  if (error instanceof Error) {
    return {
      title: "读取反馈失败",
      message: error.message,
      fix: "请确认文件存在、格式为 CSV，并稍后重试。",
    }
  }

  return {
    title: "读取反馈失败",
    message: "发生未知错误。",
    fix: "请重新上传 CSV，或使用示例反馈继续演示。",
  }
}

async function readCsvFileText(file: File) {
  const buffer = await file.arrayBuffer()
  const utf8Text = new TextDecoder("utf-8", {
    fatal: false,
  }).decode(buffer)

  if (!utf8Text.includes("\uFFFD")) {
    return utf8Text
  }

  try {
    return new TextDecoder("gb18030", {
      fatal: false,
    }).decode(buffer)
  } catch {
    return utf8Text
  }
}

function toMetricUploadError(error: unknown): UploadError {
  if (error instanceof MetricCsvParseError) {
    return {
      title: "指标 CSV 解析失败",
      message: error.message,
      fix: error.fix,
    }
  }

  if (error instanceof Error) {
    return {
      title: "读取指标失败",
      message: error.message,
      fix: "请确认文件存在、格式为 CSV，并包含 metric,value 表头。",
    }
  }

  return {
    title: "读取指标失败",
    message: "发生未知错误。",
    fix: "请重新上传指标 CSV，或先不填写业务指标继续分析。",
  }
}

function toAnalyzeUploadError(error: unknown): UploadError {
  if (error instanceof AnalyzeError) {
    return {
      title: "Agent 分析失败",
      message: error.message,
      fix: error.fix || "请稍后重试；如果没有配置 API Key，系统会自动进入 Mock 模式。",
    }
  }

  if (error instanceof Error) {
    return {
      title: "Agent 分析失败",
      message: error.message,
      fix: "请检查本地服务是否运行，或稍后重试。",
    }
  }

  return {
    title: "Agent 分析失败",
    message: "发生未知错误。",
    fix: "请重新运行分析，或检查服务端日志。",
  }
}

function toFeishuBitableUploadError(error: unknown): UploadError {
  if (error instanceof FeishuBitableReadError) {
    return {
      title: "飞书多维表格读取失败",
      message: error.message,
      fix: error.fix || "请检查飞书应用配置、表格授权和字段名。",
    }
  }

  if (error instanceof Error) {
    return {
      title: "飞书多维表格读取失败",
      message: error.message,
      fix: "请检查本地服务是否运行，或稍后重试。",
    }
  }

  return {
    title: "飞书多维表格读取失败",
    message: "发生未知错误。",
    fix: "请检查 .env.local 中的飞书多维表格配置。",
  }
}

function compactTapdProjectConfig(config: TapdProjectConfig) {
  return {
    ...(config.workspaceId.trim() ? { workspaceId: config.workspaceId.trim() } : {}),
    ...(config.owner.trim() ? { owner: config.owner.trim() } : {}),
    ...(config.creator.trim() ? { creator: config.creator.trim() } : {}),
    ...(config.iterationId.trim() ? { iterationId: config.iterationId.trim() } : {}),
  }
}

function getRuntimeStatusLabel(runtimeConfig: RuntimeConfig | null, agentRun: AgentRun | null) {
  if (agentRun?.isMock) {
    return "当前为 Mock 模式：结果用于演示界面流程，不代表真实模型分析。"
  }

  if (agentRun && !agentRun.isMock) {
    return `当前为 LLM 模式：已使用 ${runtimeConfig?.model ?? "DeepSeek"} 生成真实分析结果。`
  }

  if (!runtimeConfig) {
    return "正在检查服务端环境配置。"
  }

  if (runtimeConfig.deepseekConfigured) {
    return `DeepSeek API Key 已被服务端识别，点击“开始分析”将调用 ${runtimeConfig.model}。`
  }

  return "DeepSeek API Key 未被当前服务端进程识别；点击“开始分析”会进入 Mock 模式。"
}

function getRuntimeStatusTone(runtimeConfig: RuntimeConfig | null, agentRun: AgentRun | null): "ready" | "mock" | "unknown" {
  if (agentRun?.isMock) return "mock"
  if (agentRun && !agentRun.isMock) return "ready"
  if (!runtimeConfig) return "unknown"
  return runtimeConfig.deepseekConfigured ? "ready" : "mock"
}

function createAnalyzingTrace(feedbackCount: number): TraceEvent[] {
  return [
    createClientTraceEvent("feedback_loaded", "读取反馈", "success", `已加载 ${feedbackCount} 条用户反馈。`),
    createClientTraceEvent("research_agent_running", "Research Agent", "running", "正在聚类用户反馈并提炼需求洞察。"),
    createClientTraceEvent("strategy_agent_pending", "Strategy Agent", "pending", "等待判断 MVP 范围与 RICE 优先级。"),
    createClientTraceEvent("prd_agent_pending", "PRD Agent", "pending", "等待生成 PRD 草稿。"),
    createClientTraceEvent("delivery_agent_pending", "Delivery Agent", "pending", "等待拆解研发任务和飞书摘要。"),
    createClientTraceEvent("orchestrator_pending", "Orchestrator", "pending", "等待汇总多 Agent 产物并校验结构。"),
    createClientTraceEvent("waiting_for_approval", "等待审批", "pending", "等待飞书评审摘要生成。"),
    createClientTraceEvent("send_feishu", "发送飞书", "pending", "用户确认后才会发送飞书。"),
  ]
}

function markSendTraceRunning(trace: TraceEvent[]): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "send_feishu")

  return [
    ...nextTrace,
    createClientTraceEvent("send_feishu", "发送飞书", "running", "用户已确认，正在发送飞书评审摘要。"),
  ]
}

function markSendTraceFailed(trace: TraceEvent[], message: string): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "send_feishu")

  return [
    ...nextTrace,
    createClientTraceEvent("feishu_message_failed", "发送飞书", "failed", message),
  ]
}

function markPrdDocTraceRunning(trace: TraceEvent[]): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "feishu_prd_document_creating")

  return [
    ...nextTrace,
    createClientTraceEvent("feishu_prd_document_creating", "创建飞书 PRD", "running", "正在创建飞书 PRD 文档。"),
  ]
}

function markPrdDocTraceFailed(trace: TraceEvent[], message: string): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "feishu_prd_document_creating")

  return [
    ...nextTrace,
    createClientTraceEvent("feishu_prd_document_failed", "创建飞书 PRD", "failed", message),
  ]
}

function markTapdTraceRunning(trace: TraceEvent[]): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "tapd_work_items_creating")

  return [
    ...nextTrace,
    createClientTraceEvent("tapd_work_items_creating", "创建 TAPD 任务", "running", "正在创建 TAPD 需求与任务。"),
  ]
}

function markTapdTraceFailed(trace: TraceEvent[], message: string): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "tapd_work_items_creating")

  return [
    ...nextTrace,
    createClientTraceEvent("tapd_work_items_failed", "创建 TAPD 任务", "failed", message),
  ]
}

function markApprovalTrace(trace: TraceEvent[], id: string, message: string): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "approval_confirmed" && event.id !== "approval_cancelled")

  return [
    ...nextTrace,
    createClientTraceEvent(id, "等待审批", "success", message),
  ]
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return "飞书发送失败。"
}

function appendPrdDocumentLink(message: string, url: string | undefined) {
  if (!url) return message
  if (message.includes(url)) return message

  return `${message.trim()}\n\nPRD 文档：${url}`
}

function appendTapdLinks(message: string, created: TapdCreatedPayload) {
  const links = [
    `TAPD 需求：${created.story.url}`,
    ...created.tasks.map((task) => `TAPD 任务：${task.url}`),
  ]
  const newLinks = links.filter((link) => !message.includes(link))

  if (newLinks.length === 0) return message

  return `${message.trim()}\n\n${newLinks.join("\n")}`
}
