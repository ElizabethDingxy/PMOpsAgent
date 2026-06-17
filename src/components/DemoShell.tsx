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
import type { AgentResult, AgentRun, BusinessMetric, EngineeringTask, FeedbackItem, SavedAgentRun, SavedAgentRunSummary } from "@/types/product"
import { Award, BookOpen, ChevronRight, Cpu, Database, GitBranch, GitMerge, Layout, MessageSquare, Terminal } from "lucide-react"

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
    initialSelectedRun ? `已成功加载历史会话记录：${initialSelectedRun.run.result.productName}` : "请在左侧面板配置数据源并启动 AI 产品分析。",
  )
  const [isLoadingSample, setIsLoadingSample] = useState(false)
  const [isLoadingBitable, setIsLoadingBitable] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isCreatingPrdDoc, setIsCreatingPrdDoc] = useState(false)
  const [isCreatingTapd, setIsCreatingTapd] = useState(false)
  const [isSyncingTapdStatus, setIsSyncingTapdStatus] = useState(false)
  const [sourceLabel, setSourceLabel] = useState<string>(initialSelectedRun?.sourceLabel ?? "")
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null)
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("draft_generated")
  const [sendStatusMessage, setSendStatusMessage] = useState(initialSelectedRun ? "已加载历史草稿，请核对确认后再发送。" : "")
  const [tapdStatusMessage, setTapdStatusMessage] = useState(
    initialSelectedRun ? "已加载历史研发工单，确认后可直接创建 TAPD 需求和任务。" : "",
  )
  const [selectedTapdTaskIndexes, setSelectedTapdTaskIndexes] = useState<number[]>(
    initialSelectedRun?.run.result.engineeringTasks.map((_, index) => index) ?? [],
  )
  const [tapdProjectConfig, setTapdProjectConfig] = useState<TapdProjectConfig>(emptyTapdProjectConfig)
  const [savedRuns, setSavedRuns] = useState<SavedAgentRunSummary[]>(initialSavedRuns)
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [runHistoryError, setRunHistoryError] = useState("")

  // Tab State
  const [activeTab, setActiveTab] = useState<"insights" | "prd" | "tasks" | "sync">("insights")

  // Vector DB Rebuild States
  const [isRebuildingVectors, setIsRebuildingVectors] = useState(false)

  async function handleRebuildVectors(force = false) {
    setIsRebuildingVectors(true)
    setNotice("正在重建向量库与产品长效知识库...")

    const traceId = `rebuild_vectors_${Date.now()}`
    const startEvent: TraceEvent = {
      id: traceId,
      step: "向量知识库重构",
      status: "running",
      message: force ? "正在清空旧索引并全新重建语义向量..." : "正在分析并增量提取历史项目特征向量...",
      timestamp: new Date().toISOString()
    }
    setTraceEvents(prev => [...prev, startEvent])

    try {
      const response = await fetch("/api/memory/rebuild-vectors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ force })
      })
      const data = await response.json()

      if (response.ok && data.ok) {
        setNotice(`向量库重建完成！成功提取了 ${data.successCount} 个项目的语义向量。`)
        setTraceEvents(prev => prev.map(e => e.id === traceId ? {
          ...e,
          status: "success",
          message: `✓ 重建完成：共处理 ${data.successCount} 个项目。算法：${data.engine}，模型：${data.model}`,
          timestamp: new Date().toISOString()
        } : e))
      } else {
        throw new Error(data.error?.message || "重建向量库失败。")
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "未知网络错误"
      setNotice(`向量库重建失败：${errMsg}`)
      setTraceEvents(prev => prev.map(e => e.id === traceId ? {
        ...e,
        status: "failed",
        message: `✗ 向量库重建失败：${errMsg}`,
        timestamp: new Date().toISOString()
      } : e))
    } finally {
      setIsRebuildingVectors(false)
    }
  }

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
            embeddingConfigured: payload.embeddingConfigured,
            embeddingEngine: payload.embeddingEngine,
            embeddingModel: payload.embeddingModel,
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
    setNotice("正在读取示例反馈数据 (sample-feedback.csv)。")

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
      setNotice(`示例数据加载完毕，共读取到 ${items.length} 条用户反馈。`)
      setActiveTab("insights")
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
      setNotice("示例反馈加载失败，请检查本地文件。")
    } finally {
      setIsLoadingSample(false)
    }
  }

  async function handleUploadCsv(file: File) {
    setUploadError(null)
    setNotice(`正在解析上传的文件 ${file.name}。`)

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
      setNotice(`成功解析 ${file.name}，共读入 ${items.length} 条用户反馈数据。`)
      setActiveTab("insights")
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
      setNotice("本地 CSV 文件解析失败。")
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
      setNorthStarMetric("每周完成一次有效 analysis 并进入评审的团队数")
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
    setNotice("正在通过 API 连接飞书多维表格读取反馈。")

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
      setNotice(`飞书多维表格连接成功，已获取 ${payload.feedbackItems.length} 条反馈。`)
      setActiveTab("insights")
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
      setNotice("无法从飞书多维表格读取反馈数据。")
    } finally {
      setIsLoadingBitable(false)
    }
  }

  async function handleStartAnalysis() {
    if (feedbackItems.length === 0) {
      setUploadError({
        title: "数据集为空",
        message: "当前暂无待分析的用户反馈数据 (FeedbackItem)。",
        fix: "请先通过 CSV 上传或加载示例反馈，再启动 Agent 分析流程。",
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
    setNotice("AI Agent 正在进行多维度分析聚类与决策拆解，请稍候。")
    setActiveTab("insights")

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

      if (!response.body) {
        throw new Error("API 响应体为空，无法读取分析流。")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let buffer = ""
      let completedData: any = null

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        // Split by SSE double newline
        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() || "" // Save the trailing partial block

        for (const block of blocks) {
          const trimmed = block.trim()
          if (!trimmed) continue

          const eventMatch = trimmed.match(/^event: (.*)$/m)
          const dataMatch = trimmed.match(/^data: (.*)$/m)

          if (eventMatch && dataMatch) {
            const eventName = eventMatch[1].trim()
            const eventData = JSON.parse(dataMatch[1].trim())

            if (eventName === "progress") {
              const progressEvent = eventData as TraceEvent
              setTraceEvents((prev) => {
                // Replace or append the trace event in real-time
                let next = prev.filter((e) => e.id !== progressEvent.id && e.step !== progressEvent.step)
                
                // Clear the corresponding pending placeholders when active work begins
                if (progressEvent.id.startsWith("strategy_agent")) {
                  next = next.filter((e) => e.id !== "strategy_agent_pending")
                } else if (progressEvent.id.startsWith("prd_agent")) {
                  next = next.filter((e) => e.id !== "prd_agent_pending")
                } else if (progressEvent.id.startsWith("delivery_agent")) {
                  next = next.filter((e) => e.id !== "delivery_agent_pending")
                } else if (progressEvent.id.startsWith("orchestrator")) {
                  next = next.filter((e) => e.id !== "orchestrator_pending")
                }
                
                return [...next, progressEvent]
              })
              // Update notice if message is present
              if (progressEvent.message) {
                setNotice(`[分析进度] ${progressEvent.step}：${progressEvent.message}`)
              }
            } else if (eventName === "completed") {
              completedData = eventData
            } else if (eventName === "error") {
              throw new AnalyzeError(
                eventData.message || "流式分析过程中发生错误。",
                eventData.fix || "请重试或切换至 Mock 模式。",
                eventData.trace
              )
            }
          }
        }
      }

      if (!completedData) {
        throw new Error("流式分析未正常完成，缺少结果数据。")
      }

      const payload = completedData as {
        result: AgentResult
        run: AgentRun
        savedRun: SavedAgentRun
      }
      setAgentRun(payload.run)
      setDraftResult(payload.run.result)
      setTraceEvents(payload.run.result.trace)
      setApprovalStatus("draft_generated")
      setSendStatusMessage("AI 草稿生成完毕，请确认或修改后再派发。")
      setTapdStatusMessage("已生成对应研发工单，审核确认后即可一键同步至 TAPD。")
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
      setNotice("Agent 智能分析分析流程异常中断。")
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
        setRunHistoryError(payload.error?.message || "本地运行历史同步失败。")
      }
    } catch (error) {
      setRunHistoryError(error instanceof Error ? error.message : "本地运行历史同步失败。")
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
      setSendStatusMessage("历史评审消息摘要复制成功。")
    } catch (error) {
      setSendStatusMessage(error instanceof Error ? error.message : "历史摘要复制失败。")
    }
  }

  async function handleDeleteRun(id: string) {
    const confirmed = window.confirm("确认要删除本地该会话的归档记录吗？此操作无法恢复。")

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
      setNotice("归档历史会话删除成功。")
    } catch (error) {
      setUploadError({
        title: "历史归档删除失败",
        message: error instanceof Error ? error.message : "无法删除所选归档会话记录。",
        fix: "请刷新历史列表后，重新尝试删除操作。",
      })
    }
  }

  async function handleSendFeishu() {
    if (!draftResult?.feishuReviewMessage || !agentRun) {
      setApprovalStatus("failed")
      setSendStatusMessage("发布失败：暂无就绪的评审摘要草稿。")
      return
    }

    if (approvalStatus !== "approved" && approvalStatus !== "failed") {
      setSendStatusMessage("操作拦截：请先点击下方“核对并通过”通过草稿。")
      return
    }

    setApprovalStatus("sending")
    setSendStatusMessage("正在向飞书群组发布评审摘要...")
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
      setSendStatusMessage("✓ 飞书群评审摘要消息已成功发布！")
    } catch (error) {
      if (error instanceof SendFeishuError && error.trace?.length) {
        setTraceEvents(error.trace)
      } else {
        setTraceEvents(markSendTraceFailed(visibleTrace, toErrorMessage(error)))
      }

      setApprovalStatus("failed")
      setSendStatusMessage(error instanceof SendFeishuError ? `${error.message} ${error.fix ?? ""}`.trim() : "同步至飞书时发生网络异常。")
    }
  }

  async function handleCopySummary() {
    const message = draftResult?.feishuReviewMessage ?? ""

    if (!message.trim()) {
      setSendStatusMessage("复制失败：当前预览消息为空。")
      return
    }

    try {
      await navigator.clipboard.writeText(message)
      setSendStatusMessage("✓ 评审摘要已成功复制到剪贴板！")
    } catch {
      setSendStatusMessage("复制失败，您的浏览器可能不支持剪贴板写入 API，请手动选中复制。")
    }
  }

  function handleCancelSend() {
    setApprovalStatus("cancelled")
    setTraceEvents(markApprovalTrace(visibleTrace, "approval_cancelled", "已取消发送，草稿仍保留。"))
    setSendStatusMessage("操作取消：当前会话已被重置为草稿状态。")
  }

  function handleApproveDraft() {
    if (!draftResult?.feishuReviewMessage.trim()) {
      setSendStatusMessage("核对失败：飞书摘要为空。")
      return
    }

    setApprovalStatus("approved")
    setTraceEvents(markApprovalTrace(visibleTrace, "approval_confirmed", "用户已核对并通过飞书摘要。"))
    setSendStatusMessage("✓ 草稿已审核通过！现在可以派发飞书或同步交付 TAPD。")
  }

  async function handleCreatePrdDocument() {
    if (!draftResult || !agentRun) {
      setSendStatusMessage("操作拦截：请先运行分析流程生成草稿。")
      return
    }

    if (approvalStatus !== "approved" && approvalStatus !== "sent" && approvalStatus !== "failed") {
      setSendStatusMessage("操作拦截：请先点击“核对并通过”确认草稿细节。")
      return
    }

    setIsCreatingPrdDoc(true)
    setSendStatusMessage("正在与飞书文档服务器交互，生成云端 PRD...")
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
      setSendStatusMessage(payload.document.url ? "✓ 飞书云 PRD 文档创建完毕，链接已动态追加至群评审摘要。" : "✓ 飞书云 PRD 文档创建成功！")
    } catch (error) {
      if (error instanceof CreatePrdDocumentError && error.trace?.length) {
        setTraceEvents(error.trace)
      } else {
        setTraceEvents(markPrdDocTraceFailed(visibleTrace, toErrorMessage(error)))
      }

      setSendStatusMessage(error instanceof CreatePrdDocumentError ? `${error.message} ${error.fix ?? ""}`.trim() : "飞书文档服务通信异常，请重试。")
    } finally {
      setIsCreatingPrdDoc(false)
    }
  }

  async function handleCreateTapdWorkItems() {
    if (!draftResult || !agentRun) {
      setTapdStatusMessage("操作拦截：请先运行分析流程生成研发工单。")
      return
    }

    if (approvalStatus !== "approved" && approvalStatus !== "sent" && approvalStatus !== "failed") {
      setTapdStatusMessage("操作拦截：请先核对并通过评审摘要。")
      return
    }

    if (selectedTapdTaskIndexes.length === 0) {
      setTapdStatusMessage("操作拦截：请勾选至少一个工单任务。")
      return
    }

    setIsCreatingTapd(true)
    setTapdStatusMessage("正在建立 API 握手，同步创建 TAPD 需求和工单...")
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
        tapdWorkItems: {
          story: payload.created.story,
          tasks: payload.created.tasks,
        },
        engineeringTasks: payload.created.updatedTasks || draftResult.engineeringTasks,
      })
      setTraceEvents(payload.trace)
      setApprovalStatus("approved")
      setTapdStatusMessage(`✓ 同步成功！已创建 1 个 TAPD 需求故事和 ${payload.created.tasks.length} 个关联任务，链接已追加至群摘要。`)
    } catch (error) {
      if (error instanceof CreateTapdWorkItemsError && error.trace?.length) {
        setTraceEvents(error.trace)
      } else {
        setTraceEvents(markTapdTraceFailed(visibleTrace, toErrorMessage(error)))
      }

      setTapdStatusMessage(error instanceof CreateTapdWorkItemsError ? `${error.message} ${error.fix ?? ""}`.trim() : "与 TAPD 服务器通信失败，请检查网络和凭证。")
    } finally {
      setIsCreatingTapd(false)
    }
  }

  async function handleSyncTapdStatus() {
    if (!agentRun) {
      setTapdStatusMessage("操作拦截：没有处于活动状态的分析会话。")
      return
    }

    setIsSyncingTapdStatus(true)
    setTapdStatusMessage("正在向 TAPD 发送请求，同步最新任务状态...")
    setTraceEvents(markTapdTraceRunning(visibleTrace))

    try {
      const response = await fetch("/api/tapd/sync-status", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: agentRun.runId,
        }),
      })
      const payload = await response.json()

      if (!payload.ok) {
        throw new Error(payload.error.message || "同步 TAPD 状态失败。")
      }

      setDraftResult((current) => {
        const base = current ?? agentRun.result
        if (!base) return null
        return {
          ...base,
          engineeringTasks: payload.run.result.engineeringTasks,
        }
      })
      setTraceEvents(payload.trace)
      setTapdStatusMessage("✓ TAPD 最新任务执行状态同步成功！")
      setNotice("TAPD 状态同步已完成。")
    } catch (error) {
      setTraceEvents(markTapdTraceFailed(visibleTrace, toErrorMessage(error)))
      setTapdStatusMessage(error instanceof Error ? error.message : "拉取 TAPD 状态发生异常，请重试。")
    } finally {
      setIsSyncingTapdStatus(false)
    }
  }

  function getEventOrderScore(event: TraceEvent): number {
    const id = event.id.toLowerCase()
    const step = event.step.toLowerCase()
    
    if (id.includes("feedback_loaded")) return 10
    if (id.includes("business_context")) return 20
    if (id.includes("mock_mode_enabled")) return 30
    
    if (id.includes("research_agent") || step.includes("research agent")) return 40
    if (id.includes("strategy_agent") || step.includes("strategy agent")) return 50
    if (id.includes("prd_agent") || step.includes("prd agent")) return 60
    if (id.includes("delivery_agent") || step.includes("delivery agent")) return 70
    
    if (
      id.includes("critic_agent") || 
      id.includes("critic_completed") || 
      id.includes("critic_feedback") || 
      step.includes("critic agent") || 
      step.includes("自我反思")
    ) {
      return 80
    }
    
    if (id.includes("orchestrator") || step.includes("orchestrator")) return 90
    if (id.includes("waiting_for_approval") || step.includes("等待审批")) return 100
    
    if (id.includes("send_feishu") || id.includes("feishu_message") || step.includes("发送飞书")) return 110
    if (id.includes("feishu_prd_document") || step.includes("创建飞书 prd")) return 120
    if (id.includes("tapd_work_items") || step.includes("tapd")) return 130
    if (id.includes("rebuild_vectors") || step.includes("向量")) return 140
    
    return 1000
  }

  function sortTraceEvents(events: TraceEvent[]): TraceEvent[] {
    const withIndices = events.map((event, idx) => ({ event, idx }))
    withIndices.sort((a, b) => {
      const scoreA = getEventOrderScore(a.event)
      const scoreB = getEventOrderScore(b.event)
      if (scoreA !== scoreB) {
        return scoreA - scoreB
      }
      return a.idx - b.idx
    })
    return withIndices.map((item) => item.event)
  }

  const agentResult = draftResult ?? agentRun?.result
  const rawTrace = traceEvents.length > 0 ? traceEvents : agentResult?.trace ?? []
  const visibleTrace = sortTraceEvents(rawTrace)
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
  const canCreatePrdDoc = Boolean(
    hasApprovalDraft &&
    feishuDocumentConfigured &&
    ["approved", "sent", "failed"].includes(approvalStatus) &&
    !isCreatingPrdDoc
  )
  const canCreateTapd = Boolean(
    hasApprovalDraft &&
    tapdConfigured &&
    tapdWorkspaceReady &&
    ["approved", "sent", "failed"].includes(approvalStatus) &&
    selectedTapdTaskIndexes.length > 0 &&
    !isCreatingTapd
  )
  const canSendFeishu = Boolean(
    hasApprovalDraft &&
    draftResult?.feishuReviewMessage.trim() &&
    webhookConfigured &&
    ["approved", "failed"].includes(approvalStatus)
  )

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8 max-w-[1600px] mx-auto transition-colors duration-300">
      {/* 1. Header cockpit */}
      <header className="mb-6 rounded-2xl glass-panel p-6 border border-slate-800/80 shadow-soft">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-400 font-mono text-xs uppercase tracking-wider font-semibold">
              <Cpu size={14} className="animate-spin" />
              <span>AI Product Operations Console</span>
            </div>
            <h1 className="mt-2.5 text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400">
              PMOpsAgent
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              面向大中华区敏捷研发团队的 AI 产品协理。导入用户反馈，Agent 自动完成需求聚类、MVP 划定、RICE 计算、Notion 式 PRD 构建和 TAPD/飞书交付包同步。
            </p>
          </div>

          {/* Quick Metrics slots */}
          <div className="grid grid-cols-3 gap-4 min-w-[320px] lg:min-w-[400px]">
            <MetricSlot label="解析反馈" value={String(feedbackItems.length)} icon={<Database size={15} className="text-indigo-400" />} />
            <MetricSlot label="聚类主题" value={String(agentResult?.demandClusters.length ?? 0)} icon={<Award size={15} className="text-emerald-450" />} />
            <MetricSlot label="拆解工单" value={String(agentResult?.engineeringTasks.length ?? 0)} icon={<Terminal size={15} className="text-purple-400" />} />
          </div>
        </div>

        {/* Global Notice Banner */}
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-850 bg-[#0e1320]/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs leading-relaxed text-slate-400 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping"></span>
            <span>系统日志：{notice}</span>
          </p>
          <span className="shrink-0 rounded-lg bg-[#121826] border border-slate-800 px-3.5 py-1 text-xs font-mono font-bold text-slate-400">
            {agentRun?.runId ? `RUN_ID: ${agentRun.runId.slice(0, 8).toUpperCase()}` : "SYS_STATUS: WAITING"}
          </span>
        </div>
      </header>

      {/* 2. Main Workstation Grid */}
      <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)] items-start">
        {/* Left Control Columns */}
        <aside className="space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-60px)] xl:overflow-y-auto pr-1">
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
          <VectorStorePanel
            configured={Boolean(runtimeConfig?.embeddingConfigured)}
            engine={runtimeConfig?.embeddingEngine ?? "Sparse VSM (Local)"}
            model={runtimeConfig?.embeddingModel ?? "TF-IDF Unigram/Bigram"}
            isRebuilding={isRebuildingVectors}
            onRebuild={handleRebuildVectors}
          />
          <RunHistory
            runs={savedRuns}
            isLoading={isLoadingRuns}
            errorMessage={runHistoryError}
            activeRunId={agentRun?.runId}
            onRefresh={loadRunHistory}
            onCopySummary={handleCopyHistorySummary}
            onDelete={handleDeleteRun}
          />
        </aside>

        {/* Right Output Workspaces */}
        <section className="space-y-6">
          {agentResult ? (
            <div className="space-y-6">
              {agentRun ? <ResultModeBanner agentRun={agentRun} /> : null}

              {/* Workspace Navigation Tabs */}
              <div className="rounded-xl glass-panel p-2 border border-slate-800/80 shadow-soft flex items-center justify-between">
                <nav className="flex space-x-1.5">
                  <TabButton active={activeTab === "insights"} onClick={() => setActiveTab("insights")}>
                    <Layout size={14} />
                    <span>聚类与优先级 (Insights)</span>
                  </TabButton>
                  <TabButton active={activeTab === "prd"} onClick={() => setActiveTab("prd")}>
                    <BookOpen size={14} />
                    <span>PRD 文档预览 (PRD Draft)</span>
                  </TabButton>
                  <TabButton active={activeTab === "tasks"} onClick={() => setActiveTab("tasks")}>
                    <Terminal size={14} />
                    <span>研发任务 (Tasks)</span>
                  </TabButton>
                  <TabButton active={activeTab === "sync"} onClick={() => setActiveTab("sync")}>
                    <GitMerge size={14} />
                    <span>同步交付 (TAPD Integration)</span>
                  </TabButton>
                </nav>
                <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-slate-500 bg-[#0d101a] py-1 px-3.5 border border-slate-850 rounded-lg">
                  <span>活动面板：</span>
                  <span className="font-bold text-indigo-400">{activeTab.toUpperCase()}</span>
                </div>
              </div>

              {/* Tab Workspace split-screen grid */}
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] items-start">
                <div className="space-y-6">
                  {/* Insights Tab content */}
                  {activeTab === "insights" && (
                    <InsightCards
                      clusters={agentResult.demandClusters}
                      mvpScope={agentResult.mvpScope}
                      riceItems={agentResult.ricePrioritization}
                    />
                  )}

                  {/* PRD Tab content */}
                  {activeTab === "prd" && (
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
                  )}

                  {/* Tasks Tab content */}
                  {activeTab === "tasks" && (
                    <EditableTasks
                      tasks={agentResult.engineeringTasks}
                      onChange={(engineeringTasks) =>
                        updateDraftResult({
                          engineeringTasks,
                        })
                      }
                    />
                  )}

                  {/* Sync Tab content */}
                  {activeTab === "sync" && (
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
                      isSyncingStatus={isSyncingTapdStatus}
                      onSyncStatus={handleSyncTapdStatus}
                    />
                  )}
                </div>

                {/* Persistent Approval panel co-pilot */}
                <div className="sticky top-6">
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
          ) : (
            <div className="space-y-6">
              <ResultEmptyState />
            </div>
          )}
        </section>
      </div>
    </main>
  )

  function updateDraftResult(patch: Partial<AgentResult>) {
    setDraftResult((current) => {
      const base = current ?? agentRun?.result
      if (!base) return null
      return {
        ...base,
        ...patch,
        ...("prd" in patch || "engineeringTasks" in patch ? { prdDocumentUrl: undefined, tapdWorkItems: undefined } : {}),
      }
    })
    if ("engineeringTasks" in patch && patch.engineeringTasks) {
      setSelectedTapdTaskIndexes(patch.engineeringTasks.map((_, index) => index))
      setTapdStatusMessage("研发工单已修改，请重新核对确认后再同步 TAPD。")
    }
    setApprovalStatus("user_editing")
    setSendStatusMessage("草稿已被用户编辑修改，请重新核对确认。")
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


type TabButtonProps = {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold tracking-tight transition-all duration-200 ${
        active
          ? "bg-[#182030] text-indigo-400 border border-slate-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
          : "text-slate-400 hover:text-slate-200 hover:bg-[#121826]/40 border border-transparent"
      }`}
    >
      {children}
    </button>
  )
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
  embeddingConfigured?: boolean
  embeddingEngine?: string
  embeddingModel?: string
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
      embeddingConfigured?: boolean
      embeddingEngine?: string
      embeddingModel?: string
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
        updatedTasks?: EngineeringTask[]
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
    <section className="rounded-xl border border-slate-800 bg-[#121826]/40 p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <div>
            <p className="text-sm font-bold text-slate-200 tracking-tight">{agentRun.isMock ? "会话模式：演示 Sandbox (Mock)" : "会话模式：大模型连接 (LLM)"}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{agentRun.message}</p>
          </div>
        </div>
        <span className={`rounded-lg border px-3 py-1.5 text-xs font-mono font-bold ${
          agentRun.isMock 
            ? "bg-amber-500/10 border-amber-500/20 text-amber-400" 
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
        }`}>
          MODE: {agentRun.mode.toUpperCase()}
        </span>
      </div>
    </section>
  )
}

function ResultEmptyState() {
  return (
    <section className="glass-panel rounded-2xl p-8 border border-slate-800/80 shadow-soft text-center max-w-3xl mx-auto mt-12 py-16">
      <div className="mx-auto h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/35 flex text-indigo-400 mb-6 shadow-[0_0_20px_rgba(99,102,241,0.15)] animate-pulse">
        <Layout size={32} />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono block">Workplace Panel</span>
      <h2 className="mt-3 text-xl font-extrabold text-slate-100 tracking-tight">等待 AI 产品分析结果</h2>
      <p className="mt-2.5 max-w-xl mx-auto text-xs leading-relaxed text-slate-400">
        载入数据集并点击“开始 AI 自动分析”后，AI 智能协同引擎将全面解析需求反馈，在此区域以步骤式卡片形式呈现聚类主题、划定 MVP 范畴、推演 RICE 决策、以及一键生成 PRD 与研发任务。
      </p>
      
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {["1. 聚类分析主题", "2. 生成 PRD 草稿", "3. 拆解研发工单"].map((item, index) => (
          <div key={item} className="rounded-xl border border-slate-850 bg-[#121826]/20 px-4 py-4 text-xs text-slate-500 flex flex-col justify-center items-center">
            <span className="text-slate-600 font-bold mb-1 font-mono">STEP_0{index+1}</span>
            <span className="text-slate-450 font-semibold">{item}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function VectorStorePanel({
  configured,
  engine,
  model,
  isRebuilding,
  onRebuild,
}: {
  configured: boolean
  engine: string
  model: string
  isRebuilding: boolean
  onRebuild: (force?: boolean) => void
}) {
  return (
    <div className="rounded-2xl glass-panel p-5 border border-slate-800/80 shadow-soft bg-[#0c101b]/70 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
        <Database size={50} className="text-indigo-400" />
      </div>

      <div className="flex items-center gap-2">
        <Database size={16} className={isRebuilding ? "text-indigo-400 animate-pulse" : "text-indigo-400"} />
        <h3 className="text-sm font-bold tracking-wide text-slate-200">
          向量长效知识库 (Vector DB)
        </h3>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        已升级语义相似度检索，支持长效记忆追问。增量写入伴生向量，无缝兼容飞书/网页端。
      </p>

      <div className="mt-4 rounded-xl border border-slate-850 bg-[#121726]/40 px-3.5 py-2.5 space-y-2">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-slate-500 font-medium">引擎状态</span>
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-450">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            活动中
          </span>
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-slate-500 font-medium">相似度算法</span>
          <span className="font-mono text-slate-300 font-semibold">{engine}</span>
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-slate-500 font-medium">基础特征模型</span>
          <span className="font-mono text-indigo-300 font-semibold">{model}</span>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onRebuild(false)}
          disabled={isRebuilding}
          className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-850 py-2 text-xs font-bold text-white transition duration-205 shadow-soft disabled:text-slate-500 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {isRebuilding ? "重建中..." : "增量重建向量库"}
        </button>
        <button
          onClick={() => {
            if (confirm("确定要清空全部现有向量索引并重新分析重建吗？")) {
              onRebuild(true)
            }
          }}
          disabled={isRebuilding}
          title="完全清空向量索引目录并重构"
          className="px-3 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-xs font-bold text-slate-400 hover:text-slate-200 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          全新重构
        </button>
      </div>
    </div>
  )
}

function MetricSlot({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-850 bg-[#0e1320]/40 px-4 py-3 flex items-center justify-between hover:border-slate-800 transition-all">
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold text-slate-200 mt-1.5 font-mono">{value}</p>
      </div>
      <div className="rounded-lg bg-slate-900 border border-slate-800 p-2 shrink-0">
        {icon}
      </div>
    </div>
  )
}

function toUploadError(error: unknown): UploadError {
  if (error instanceof CsvParseError) {
    return {
      title: "CSV 数据解析失败",
      message: error.message,
      fix: error.fix,
    }
  }

  if (error instanceof Error) {
    return {
      title: "数据读入失败",
      message: error.message,
      fix: "请检查 CSV 文件编码格式 (支持 UTF-8 与 GB18030) 与字段包含项后重试。",
    }
  }

  return {
    title: "数据读入失败",
    message: "内部发生未知解析错误。",
    fix: "请检查本地 CSV 文件的行格式，或使用“加载示例反馈”进行演示。",
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
      title: "指标数据解析失败",
      message: error.message,
      fix: error.fix,
    }
  }

  if (error instanceof Error) {
    return {
      title: "读取业务指标失败",
      message: error.message,
      fix: "请确保文件符合格式且包含 metric 和 value 表头参数项。",
    }
  }

  return {
    title: "读取业务指标失败",
    message: "指标数据校验异常。",
    fix: "请重新核实指标 CSV，或者留空暂不填写继续执行分析。",
  }
}

function toAnalyzeUploadError(error: unknown): UploadError {
  if (error instanceof AnalyzeError) {
    return {
      title: "Agent 分析异常",
      message: error.message,
      fix: error.fix || "请检查网络状况。如果本地未配置 DeepSeek 密钥，系统将自动降级使用 Mock 模式演示。",
    }
  }

  if (error instanceof Error) {
    return {
      title: "Agent 分析异常",
      message: error.message,
      fix: "请核对 API 服务端端口状态或稍后重试。",
    }
  }

  return {
    title: "Agent 分析异常",
    message: "服务端接口响应失败。",
    fix: "请检查服务器后台报错日志或网络连接。",
  }
}

function toFeishuBitableUploadError(error: unknown): UploadError {
  if (error instanceof FeishuBitableReadError) {
    return {
      title: "飞书多维表格连接失败",
      message: error.message,
      fix: error.fix || "请确保飞书后台的 App ID 权限已开通，并已将本表格的阅读权授权给对应机器人账户。",
    }
  }

  if (error instanceof Error) {
    return {
      title: "飞书多维表格读取异常",
      message: error.message,
      fix: "连接网络可能不稳定，请稍后再次尝试拉取。",
    }
  }

  return {
    title: "飞书多维表格连接失败",
    message: "内部认证协议建立失败。",
    fix: "请核对本地 .env.local 中的飞书多维表格环境变量设置。",
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
    return "沙盒环境 (MOCK)"
  }

  if (agentRun && !agentRun.isMock) {
    return `大模型服务 (${runtimeConfig?.model ?? "DeepSeek"})`
  }

  if (!runtimeConfig) {
    return "正在检测服务端环境..."
  }

  if (runtimeConfig.deepseekConfigured) {
    return `大模型服务已就绪 (${runtimeConfig.model})`
  }

  return "检测到 DeepSeek API 未配置，执行分析将自动进入 Mock 沙盒模式。"
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
  const nextTrace = trace.filter((event) => event.id !== "feishu_message" && event.id !== "send_feishu")

  return [
    ...nextTrace,
    createClientTraceEvent("feishu_message", "发送飞书", "running", "用户已确认，正在发送飞书评审摘要。"),
  ]
}

function markSendTraceFailed(trace: TraceEvent[], message: string): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "feishu_message" && event.id !== "send_feishu")

  return [
    ...nextTrace,
    createClientTraceEvent("feishu_message", "发送飞书", "failed", message),
  ]
}

function markPrdDocTraceRunning(trace: TraceEvent[]): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "feishu_prd_document")

  return [
    ...nextTrace,
    createClientTraceEvent("feishu_prd_document", "创建飞书 PRD", "running", "正在创建飞书 PRD 文档。"),
  ]
}

function markPrdDocTraceFailed(trace: TraceEvent[], message: string): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "feishu_prd_document")

  return [
    ...nextTrace,
    createClientTraceEvent("feishu_prd_document", "创建飞书 PRD", "failed", message),
  ]
}

function markTapdTraceRunning(trace: TraceEvent[]): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "tapd_work_items")

  return [
    ...nextTrace,
    createClientTraceEvent("tapd_work_items", "创建 TAPD 任务", "running", "正在创建 TAPD 需求与任务。"),
  ]
}

function markTapdTraceFailed(trace: TraceEvent[], message: string): TraceEvent[] {
  const nextTrace = trace.filter((event) => event.id !== "tapd_work_items")

  return [
    ...nextTrace,
    createClientTraceEvent("tapd_work_items", "创建 TAPD 任务", "failed", message),
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
