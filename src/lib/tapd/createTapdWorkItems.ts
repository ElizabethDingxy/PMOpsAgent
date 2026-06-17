import type { AgentResult, EngineeringTask } from "@/types/product"

const defaultTapdApiBaseUrl = "https://api.tapd.cn"
const defaultTapdWebBaseUrl = "https://www.tapd.cn"

type TapdErrorCode =
  | "TAPD_CONFIG_MISSING"
  | "TAPD_REQUEST_FAILED"
  | "TAPD_LIST_PROJECTS_FAILED"
  | "TAPD_CREATE_STORY_FAILED"
  | "TAPD_CREATE_TASK_FAILED"
  | "TAPD_TIMEOUT"

export class TapdError extends Error {
  code: TapdErrorCode
  fix: string

  constructor(code: TapdErrorCode, message: string, fix: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "TapdError"
    this.code = code
    this.fix = fix
  }
}

export type CreatedTapdWorkItems = {
  story: CreatedTapdItem
  tasks: CreatedTapdItem[]
  updatedTasks?: EngineeringTask[]
}

export type CreatedTapdItem = {
  id: string
  title: string
  url: string
}

export type TapdProject = {
  id: string
  name: string
  status?: string
  category?: string
  memberCount?: number
  url: string
}

export type TapdWorkItemsConfigInput = {
  workspaceId?: string
  owner?: string
  creator?: string
  iterationId?: string
}

type TapdConfig = {
  apiBaseUrl: string
  webBaseUrl: string
  apiUser: string
  apiPassword: string
  workspaceId: string
  owner?: string
  creator?: string
  iterationId?: string
}

type TapdCredentialConfig = {
  apiBaseUrl: string
  webBaseUrl: string
  apiUser: string
  apiPassword: string
}

type TapdResponse<T> = {
  status?: number
  info?: string
  data?: T
}

type TapdStoryPayload = {
  Story?: {
    id?: string
    name?: string
  }
}

type TapdTaskPayload = {
  Task?: {
    id?: string
    name?: string
  }
}

type TapdProjectPayload = unknown

type TapdProjectRecord = {
  Workspace?: {
    id?: string | number
    name?: string
    status?: string
    category?: string
    member_count?: number | string
  }
  id?: string | number
  name?: string
  status?: string
  category?: string
  member_count?: number | string
}

export function getTapdRuntimeConfig() {
  return {
    configured: Boolean(
      process.env.TAPD_API_USER?.trim() &&
        process.env.TAPD_API_PASSWORD?.trim(),
    ),
    companyConfigured: Boolean(process.env.TAPD_COMPANY_ID?.trim()),
    workspaceConfigured: Boolean(process.env.TAPD_WORKSPACE_ID?.trim()),
    ownerConfigured: Boolean(process.env.TAPD_OWNER?.trim()),
    iterationConfigured: Boolean(process.env.TAPD_ITERATION_ID?.trim()),
  }
}

export async function listTapdProjects(): Promise<TapdProject[]> {
  const config = getTapdCredentialConfig()
  const companyId = process.env.TAPD_COMPANY_ID?.trim()

  if (!companyId) {
    throw new TapdError(
      "TAPD_CONFIG_MISSING",
      "缺少 TAPD 公司 ID。",
      "请在 .env.local 中配置 TAPD_COMPANY_ID，然后重启 npm run dev。这个 ID 用于查询该公司下有哪些 TAPD 项目，不是项目 workspace_id。",
    )
  }

  const params = new URLSearchParams({
    company_id: companyId,
  })
  const payload = await getTapd<TapdProjectPayload>(
    config,
    `workspaces/projects?${params.toString()}`,
    "TAPD_LIST_PROJECTS_FAILED",
    "查询 TAPD 项目列表失败。",
  )

  return normalizeTapdProjectPayload(payload.data)
    .map((item) => normalizeTapdProject(item, config.webBaseUrl))
    .filter((project): project is TapdProject => Boolean(project))
}

export async function createTapdWorkItems(
  result: AgentResult,
  selectedTaskIndexes: number[],
  configInput: TapdWorkItemsConfigInput = {},
): Promise<CreatedTapdWorkItems> {
  const config = getTapdConfig(configInput)
  
  if (selectedTaskIndexes.length === 0) {
    throw new TapdError("TAPD_CREATE_TASK_FAILED", "没有选择要创建的研发任务。", "请至少选择一个研发任务后再创建 TAPD 任务。")
  }

  // 1. Resolve Story (Incremental)
  let story: CreatedTapdItem
  const existingStory = result.tapdWorkItems?.story

  if (existingStory && existingStory.id) {
    story = existingStory
  } else {
    story = await createTapdStory(config, result)
  }

  const tasks: CreatedTapdItem[] = []
  const updatedTasks = [...result.engineeringTasks]

  // 2. Loop and Sync Tasks (Incremental)
  for (const index of selectedTaskIndexes) {
    const task = updatedTasks[index]
    if (!task) continue

    if (task.tapdTaskId && task.tapdTaskUrl) {
      // Task already synced, skip creating but include in results
      tasks.push({
        id: task.tapdTaskId,
        title: task.title,
        url: task.tapdTaskUrl,
      })
    } else {
      // Create new task
      const createdTask = await createTapdTask(config, task, story.id, result)
      tasks.push(createdTask)

      // Update local task properties
      updatedTasks[index] = {
        ...task,
        tapdTaskId: createdTask.id,
        tapdTaskUrl: createdTask.url,
        tapdTaskStatus: "未开始",
      }
    }
  }

  return {
    story,
    tasks,
    updatedTasks,
  }
}

function getTapdConfig(input: TapdWorkItemsConfigInput): TapdConfig {
  const credentialConfig = getTapdCredentialConfig()
  const workspaceId = input.workspaceId?.trim() || process.env.TAPD_WORKSPACE_ID?.trim()

  if (!workspaceId) {
    throw new TapdError(
      "TAPD_CONFIG_MISSING",
      "TAPD 配置不完整。",
      "请在 .env.local 中配置 TAPD_API_USER、TAPD_API_PASSWORD；项目 ID 可在页面 TAPD 面板填写。",
    )
  }

  return {
    ...credentialConfig,
    workspaceId,
    owner: input.owner?.trim() || process.env.TAPD_OWNER?.trim() || undefined,
    creator: input.creator?.trim() || process.env.TAPD_CREATOR?.trim() || undefined,
    iterationId: input.iterationId?.trim() || process.env.TAPD_ITERATION_ID?.trim() || undefined,
  }
}

function getTapdCredentialConfig(): TapdCredentialConfig {
  const apiUser = process.env.TAPD_API_USER?.trim()
  const apiPassword = process.env.TAPD_API_PASSWORD?.trim()

  if (!apiUser || !apiPassword) {
    throw new TapdError(
      "TAPD_CONFIG_MISSING",
      "TAPD API 账号配置不完整。",
      "请在 .env.local 中配置 TAPD_API_USER 和 TAPD_API_PASSWORD，然后重启 npm run dev。",
    )
  }

  return {
    apiBaseUrl: normalizeBaseUrl(process.env.TAPD_API_BASE_URL, defaultTapdApiBaseUrl),
    webBaseUrl: normalizeBaseUrl(process.env.TAPD_WEB_BASE_URL, defaultTapdWebBaseUrl),
    apiUser,
    apiPassword,
  }
}

async function createTapdStory(config: TapdConfig, result: AgentResult): Promise<CreatedTapdItem> {
  const payload = await postTapd<TapdStoryPayload>(
    config,
    "stories",
    {
      workspace_id: config.workspaceId,
      name: result.prd.title || result.productName || "PMOpsAgent 需求",
      description: formatStoryDescription(result),
      priority_label: priorityToTapdLabel(getStoryPriority(result.engineeringTasks)),
      label: "PMOpsAgent|AI生成",
      ...(config.owner ? { owner: config.owner } : {}),
      ...(config.creator ? { creator: config.creator } : {}),
      ...(config.iterationId ? { iteration_id: config.iterationId } : {}),
    },
    "TAPD_CREATE_STORY_FAILED",
    "创建 TAPD 需求失败。",
  )

  const id = payload.data?.Story?.id

  if (!id) {
    throw new TapdError("TAPD_CREATE_STORY_FAILED", "TAPD 需求创建成功但未返回 ID。", "请刷新 TAPD 项目需求列表确认是否已创建。")
  }

  return {
    id,
    title: payload.data?.Story?.name || result.prd.title,
    url: `${config.webBaseUrl}/${config.workspaceId}/prong/stories/view/${id}`,
  }
}

async function createTapdTask(config: TapdConfig, task: EngineeringTask, storyId: string, result: AgentResult): Promise<CreatedTapdItem> {
  const payload = await postTapd<TapdTaskPayload>(
    config,
    "tasks",
    {
      workspace_id: config.workspaceId,
      name: `[${task.type}] ${task.title}`,
      description: formatTaskDescription(task, result),
      story_id: storyId,
      priority_label: priorityToTapdLabel(task.priority),
      label: `PMOpsAgent|${task.type}|${task.priority}`,
      ...(config.owner ? { owner: config.owner } : {}),
      ...(config.creator ? { creator: config.creator } : {}),
      ...(config.iterationId ? { iteration_id: config.iterationId } : {}),
    },
    "TAPD_CREATE_TASK_FAILED",
    `创建 TAPD 任务失败：${task.title}`,
  )

  const id = payload.data?.Task?.id

  if (!id) {
    throw new TapdError("TAPD_CREATE_TASK_FAILED", `TAPD 任务创建成功但未返回 ID：${task.title}`, "请刷新 TAPD 项目任务列表确认是否已创建。")
  }

  return {
    id,
    title: payload.data?.Task?.name || task.title,
    url: `${config.webBaseUrl}/${config.workspaceId}/prong/tasks/view/${id}`,
  }
}

async function postTapd<T>(
  config: TapdConfig,
  endpoint: "stories" | "tasks",
  body: Record<string, string>,
  errorCode: Exclude<TapdErrorCode, "TAPD_CONFIG_MISSING" | "TAPD_TIMEOUT" | "TAPD_REQUEST_FAILED">,
  message: string,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  const params = new URLSearchParams(body)

  try {
    const response = await fetch(`${config.apiBaseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        authorization: createTapdAuthorizationHeader(config),
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        accept: "application/json",
      },
      body: params.toString(),
      signal: controller.signal,
    })
    const responseText = await response.text()
    const payload = parseTapdJson<T>(responseText)

    if (!response.ok) {
      throw new TapdError(errorCode, `${message} HTTP ${response.status}。${formatTapdMessage(payload)}`, "请检查 TAPD API 账号、项目 ID、接口权限和网络连接。")
    }

    if (payload.status !== 1) {
      throw new TapdError(errorCode, `${message} ${formatTapdMessage(payload)}`, "请检查 TAPD API 账号是否有创建需求/任务权限，且 workspace_id 是否正确。")
    }

    return payload
  } catch (error) {
    if (error instanceof TapdError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new TapdError("TAPD_TIMEOUT", `${message} 请求超时。`, "请检查网络连接，或稍后重试。", {
        cause: error,
      })
    }

    throw new TapdError("TAPD_REQUEST_FAILED", `${message} 网络异常。`, "请检查本机是否能访问 TAPD API。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function getTapd<T>(
  config: TapdCredentialConfig,
  endpoint: string,
  errorCode: Extract<TapdErrorCode, "TAPD_LIST_PROJECTS_FAILED">,
  message: string,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(`${config.apiBaseUrl}/${endpoint}`, {
      method: "GET",
      headers: {
        authorization: createTapdAuthorizationHeader(config),
        accept: "application/json",
      },
      signal: controller.signal,
    })
    const responseText = await response.text()
    const payload = parseTapdJson<T>(responseText)

    if (!response.ok) {
      throw new TapdError(errorCode, `${message} HTTP ${response.status}。${formatTapdMessage(payload)}`, "请检查 TAPD API 账号、公司 ID、接口权限和网络连接。")
    }

    if (payload.status !== 1) {
      throw new TapdError(errorCode, `${message} ${formatTapdMessage(payload)}`, "请确认 TAPD_COMPANY_ID 是公司 ID，且当前 TAPD API 账号有查看该公司项目列表的权限。")
    }

    return payload
  } catch (error) {
    if (error instanceof TapdError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new TapdError("TAPD_TIMEOUT", `${message} 请求超时。`, "请检查网络连接，或稍后重试。", {
        cause: error,
      })
    }

    throw new TapdError("TAPD_REQUEST_FAILED", `${message} 网络异常。`, "请检查本机是否能访问 TAPD API。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function formatStoryDescription(result: AgentResult) {
  return [
    result.summary,
    "",
    "## 背景",
    result.prd.background,
    "",
    "## 用户问题",
    result.prd.problemStatement,
    "",
    "## 目标",
    ...result.prd.goals.map((item) => `- ${item}`),
    "",
    "## 功能需求",
    ...result.prd.functionalRequirements.map((item) => `- ${item}`),
    "",
    "## 成功指标",
    ...result.prd.successMetrics.map((item) => `- ${item}`),
    result.prdDocumentUrl ? `\nPRD 文档：${result.prdDocumentUrl}` : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n")
}

function formatTaskDescription(task: EngineeringTask, result: AgentResult) {
  return [
    task.description,
    "",
    `来源需求：${result.prd.title}`,
    result.prdDocumentUrl ? `PRD 文档：${result.prdDocumentUrl}` : "",
    "",
    "验收标准：",
    ...task.acceptanceCriteria.map((item) => `- ${item}`),
    task.dependsOn?.length ? "\n依赖：" : "",
    ...(task.dependsOn ?? []).map((item) => `- ${item}`),
  ]
    .filter((line) => line !== undefined)
    .join("\n")
}

function getStoryPriority(tasks: EngineeringTask[]) {
  if (tasks.some((task) => task.priority === "P0")) return "P0"
  if (tasks.some((task) => task.priority === "P1")) return "P1"
  return "P2"
}

function priorityToTapdLabel(priority: EngineeringTask["priority"]) {
  if (priority === "P0") return "High"
  if (priority === "P1") return "Middle"
  return "Low"
}

function normalizeTapdProject(item: TapdProjectRecord, webBaseUrl: string): TapdProject | undefined {
  const workspace = item.Workspace ?? item
  const id = normalizeTapdValue(workspace.id)
  const name = normalizeTapdValue(workspace.name)

  if (!id || !name) return undefined

  return {
    id,
    name,
    status: normalizeTapdValue(workspace.status),
    category: normalizeTapdValue(workspace.category),
    memberCount: normalizeTapdNumber(workspace.member_count),
    url: `${webBaseUrl}/${id}`,
  }
}

function normalizeTapdProjectPayload(data: TapdProjectPayload | undefined): TapdProjectRecord[] {
  if (Array.isArray(data)) return data.filter(isTapdProjectRecord)

  if (isRecord(data)) {
    const values = Object.values(data)
    const nestedArray = values.find(Array.isArray)
    if (Array.isArray(nestedArray)) return nestedArray.filter(isTapdProjectRecord)
  }

  return []
}

function normalizeTapdValue(value: unknown) {
  if (typeof value === "number") return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return undefined
}

function normalizeTapdNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function isTapdProjectRecord(value: unknown): value is TapdProjectRecord {
  return Boolean(value && typeof value === "object")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function createTapdAuthorizationHeader(config: TapdCredentialConfig) {
  return `Basic ${Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString("base64")}`
}

function parseTapdJson<T>(text: string): TapdResponse<T> {
  if (!text.trim()) {
    return {}
  }

  try {
    return JSON.parse(text) as TapdResponse<T>
  } catch (error) {
    throw new TapdError("TAPD_REQUEST_FAILED", "TAPD API 返回了非 JSON 内容。", "请检查 TAPD API 地址是否正确。", {
      cause: error,
    })
  }
}

function formatTapdMessage(payload: TapdResponse<unknown>) {
  const parts: string[] = []

  if (typeof payload.status === "number") {
    parts.push(`TAPD status：${payload.status}。`)
  }

  if (payload.info) {
    parts.push(`TAPD 返回：${payload.info}`)
  }

  return parts.join(" ")
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\/$/, "")
}

export type TapdStatusSyncResult = {
  storyStatus?: string
  taskStatuses: Record<string, string>
}

export async function getTapdWorkItemsStatus(
  workspaceId: string,
  storyId?: string,
  taskIds: string[] = [],
): Promise<TapdStatusSyncResult> {
  const isConfigured = getTapdRuntimeConfig().configured
  if (!isConfigured) {
    // Fallback Mock Mode status sync
    const mockStatuses: Record<string, string> = {}
    const possibleStatuses = ["未开始", "进行中", "已解决", "已关闭"]
    taskIds.forEach((id) => {
      const hash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
      mockStatuses[id] = possibleStatuses[hash % possibleStatuses.length]
    })
    return {
      storyStatus: storyId ? "已解决" : undefined,
      taskStatuses: mockStatuses,
    }
  }

  const config = getTapdCredentialConfig()
  let storyStatus: string | undefined = undefined
  const taskStatuses: Record<string, string> = {}

  // 1. Fetch Story Status
  if (storyId) {
    try {
      const storyPayload = await getTapd<any>(
        config,
        `stories?workspace_id=${workspaceId}&id=${storyId}`,
        "TAPD_LIST_PROJECTS_FAILED" as any,
        "获取 TAPD 需求状态失败",
      )
      const storyObj = storyPayload.data?.[0]?.Story ?? storyPayload.data?.Story
      if (storyObj) {
        storyStatus = mapTapdStatusLabel(storyObj.status)
      }
    } catch (e) {
      console.error("Failed to fetch TAPD story status:", e)
    }
  }

  // 2. Fetch Tasks Status
  if (taskIds.length > 0) {
    try {
      const idsParam = taskIds.join(",")
      const taskPayload = await getTapd<any>(
        config,
        `tasks?workspace_id=${workspaceId}&id=${idsParam}`,
        "TAPD_LIST_PROJECTS_FAILED" as any,
        "获取 TAPD 任务状态失败",
      )

      const taskList = Array.isArray(taskPayload.data)
        ? taskPayload.data
        : taskPayload.data
        ? [taskPayload.data]
        : []

      taskList.forEach((item: any) => {
        const taskObj = item?.Task ?? item
        if (taskObj && taskObj.id) {
          taskStatuses[String(taskObj.id)] = mapTapdStatusLabel(taskObj.status)
        }
      })
    } catch (e) {
      console.error("Failed to fetch TAPD tasks status:", e)
    }
  }

  return {
    storyStatus,
    taskStatuses,
  }
}

function mapTapdStatusLabel(tapdStatus: string | undefined): string {
  if (!tapdStatus) return "未开始"
  const statusLower = tapdStatus.toLowerCase()
  if (["open", "new", "未开始"].includes(statusLower)) return "未开始"
  if (["in_progress", "developing", "进行中"].includes(statusLower)) return "进行中"
  if (["resolved", "testing", "已解决"].includes(statusLower)) return "已解决"
  if (["closed", "done", "已关闭"].includes(statusLower)) return "已关闭"
  return tapdStatus
}
