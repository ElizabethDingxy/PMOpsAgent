import type { FeedbackItem } from "@/types/product"

const feishuBaseUrl = "https://open.feishu.cn/open-apis"
const maxPageSize = 500

type FeishuBitableErrorCode =
  | "FEISHU_BITABLE_CONFIG_MISSING"
  | "FEISHU_BITABLE_URL_INVALID"
  | "FEISHU_BITABLE_WORKSPACE_INDEX_MISSING"
  | "FEISHU_BITABLE_TABLE_NOT_FOUND"
  | "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS"
  | "FEISHU_TOKEN_REQUEST_FAILED"
  | "FEISHU_BITABLE_REQUEST_FAILED"
  | "FEISHU_BITABLE_EMPTY"
  | "FEISHU_BITABLE_MISSING_CONTENT"
  | "FEISHU_BITABLE_TOO_FEW_ROWS"
  | "FEISHU_BITABLE_TIMEOUT"

export class FeishuBitableError extends Error {
  code: FeishuBitableErrorCode
  fix: string

  constructor(code: FeishuBitableErrorCode, message: string, fix: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "FeishuBitableError"
    this.code = code
    this.fix = fix
  }
}

type TenantAccessTokenResponse = {
  code?: number
  msg?: string
  tenant_access_token?: string
  expire?: number
}

type BitableSearchResponse = {
  code?: number
  msg?: string
  data?: {
    has_more?: boolean
    page_token?: string
    total?: number
    items?: BitableRecord[]
  }
}

type BitableTableListResponse = {
  code?: number
  msg?: string
  data?: {
    has_more?: boolean
    page_token?: string
    items?: BitableTable[]
  }
}

type BitableAppMetaResponse = {
  code?: number
  msg?: string
  data?: {
    app?: {
      name?: string
      app_token?: string
    }
    name?: string
    app_token?: string
  }
}

export type FeishuBitableTable = {
  tableId: string
  name: string
}

export type FeishuBitableWorkspaceTable = FeishuBitableTable & {
  appToken: string
  baseName: string
}

export type FeishuBitableOAuthTable = FeishuBitableWorkspaceTable & {
  baseUrl?: string
}

type BitableTable = {
  table_id?: string
  name?: string
  revision?: number
}

type BitableRecord = {
  record_id?: string
  fields?: Record<string, unknown>
}

type BitableConfig = {
  appToken: string
  tableId: string
  viewId?: string
  fieldMap: FieldMap
}

type BitableBaseConfig = {
  appToken: string
  fieldMap: FieldMap
}

type BitableTenantConfig = BitableConfig & {
  appId: string
  appSecret: string
}

type BitableTenantBaseConfig = BitableBaseConfig & {
  appId: string
  appSecret: string
  appToken: string
}

type BitableSourceOverride = {
  appToken?: string
  tableId?: string
  viewId?: string
  sourceLabel?: string
}

type BitableBaseRef = {
  appToken: string
  label?: string
}

type FieldMap = {
  id?: string
  userType?: string
  source?: string
  content?: string
  createdAt?: string
}

let cachedToken:
  | {
      value: string
      expiresAt: number
    }
  | undefined

export async function readFeedbackFromFeishuBitable(): Promise<FeedbackItem[]> {
  const config = getFeishuBitableConfig()
  const token = await getTenantAccessToken(config)
  const records = await searchAllRecords(config, token)
  const feedbackItems = recordsToFeedbackItems(records, config.fieldMap)

  validateFeedbackItems(feedbackItems)

  return feedbackItems
}

export async function readFeedbackFromFeishuBitableUrl(urlText: string): Promise<{ feedbackItems: FeedbackItem[]; sourceLabel: string }> {
  const source = parseFeishuBitableUrl(urlText)
  const config = getFeishuBitableConfig(source)
  const token = await getTenantAccessToken(config)
  const records = await searchAllRecords(config, token)
  const feedbackItems = recordsToFeedbackItems(records, config.fieldMap)

  validateFeedbackItems(feedbackItems)

  return {
    feedbackItems,
    sourceLabel: source.sourceLabel || "飞书多维表格链接",
  }
}

export async function listFeishuBitableTables(appToken?: string): Promise<FeishuBitableTable[]> {
  const config = getFeishuBitableBaseConfig(appToken)
  const token = await getTenantAccessToken(config)

  return listAllTables(config, token)
}

export async function listFeishuBitableWorkspaceTables(): Promise<FeishuBitableWorkspaceTable[]> {
  const baseRefs = getConfiguredWorkspaceBaseRefs()
  const allTables: FeishuBitableWorkspaceTable[] = []

  for (const baseRef of baseRefs) {
    const config = getFeishuBitableBaseConfig(baseRef.appToken)
    const token = await getTenantAccessToken(config)
    const baseName = baseRef.label || (await getBitableBaseName(config, token))
    const tables = await listAllTables(config, token)

    allTables.push(
      ...tables.map((table) => ({
        ...table,
        appToken: config.appToken,
        baseName,
      })),
    )
  }

  return allTables
}

export async function readFeedbackFromFeishuBitableTableName(tableName: string): Promise<{ feedbackItems: FeedbackItem[]; sourceLabel: string }> {
  const config = getFeishuBitableBaseConfig()
  const token = await getTenantAccessToken(config)
  const tables = await listAllTables(config, token)
  const table = matchBitableTable(tables, tableName)
  const records = await searchAllRecords(
    {
      ...config,
      tableId: table.tableId,
    },
    token,
  )
  const feedbackItems = recordsToFeedbackItems(records, config.fieldMap)

  validateFeedbackItems(feedbackItems)

  return {
    feedbackItems,
    sourceLabel: `飞书表格 ${table.name}`,
  }
}

export async function readFeedbackFromFeishuWorkspaceTableName(tableName: string): Promise<{ feedbackItems: FeedbackItem[]; sourceLabel: string }> {
  const tables = await listFeishuBitableWorkspaceTables()
  const table = matchWorkspaceTable(tables, tableName)
  const config = getFeishuBitableConfig({
    appToken: table.appToken,
    tableId: table.tableId,
    sourceLabel: `飞书空间 ${table.baseName}/${table.name}`,
  })
  const token = await getTenantAccessToken(config)
  const records = await searchAllRecords(config, token)
  const feedbackItems = recordsToFeedbackItems(records, config.fieldMap)

  validateFeedbackItems(feedbackItems)

  return {
    feedbackItems,
    sourceLabel: `飞书空间 ${table.baseName}/${table.name}`,
  }
}

export function getFeishuBitableRuntimeConfig() {
  const appIdConfigured = Boolean(process.env.FEISHU_APP_ID?.trim())
  const appSecretConfigured = Boolean(process.env.FEISHU_APP_SECRET?.trim())
  const appTokenConfigured = Boolean(process.env.FEISHU_BITABLE_APP_TOKEN?.trim())
  const tableIdConfigured = Boolean(process.env.FEISHU_BITABLE_TABLE_ID?.trim())

  return {
    configured: appIdConfigured && appSecretConfigured && appTokenConfigured && tableIdConfigured,
    baseConfigured: appIdConfigured && appSecretConfigured && appTokenConfigured,
    workspaceConfigured: appIdConfigured && appSecretConfigured && getConfiguredWorkspaceBaseRefs({ allowEmpty: true }).length > 0,
    appIdConfigured,
    appSecretConfigured,
    appTokenConfigured,
    tableIdConfigured,
    viewIdConfigured: Boolean(process.env.FEISHU_BITABLE_VIEW_ID?.trim()),
  }
}

function getFeishuBitableBaseConfig(appTokenOverride?: string): BitableTenantBaseConfig {
  const appId = process.env.FEISHU_APP_ID?.trim()
  const appSecret = process.env.FEISHU_APP_SECRET?.trim()
  const appToken = appTokenOverride?.trim() || process.env.FEISHU_BITABLE_APP_TOKEN?.trim()

  if (!appId || !appSecret || !appToken) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_CONFIG_MISSING",
      "飞书多维表格 Base 配置不完整。",
      "请在 .env.local 中配置 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_BITABLE_APP_TOKEN，并重启 npm run dev。",
    )
  }

  return {
    appId,
    appSecret,
    appToken,
    fieldMap: getConfiguredFieldMap(),
  }
}

function getFeishuBitableConfig(override?: BitableSourceOverride): BitableTenantConfig {
  const appId = process.env.FEISHU_APP_ID?.trim()
  const appSecret = process.env.FEISHU_APP_SECRET?.trim()
  const appToken = override?.appToken || process.env.FEISHU_BITABLE_APP_TOKEN?.trim()
  const tableId = override?.tableId || process.env.FEISHU_BITABLE_TABLE_ID?.trim()

  if (!appId || !appSecret || !appToken || !tableId) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_CONFIG_MISSING",
      "飞书多维表格配置不完整。",
      "请在 .env.local 中配置 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_BITABLE_APP_TOKEN、FEISHU_BITABLE_TABLE_ID，并重启 npm run dev。",
    )
  }

  return {
    appId,
    appSecret,
    appToken,
    tableId,
    viewId: override?.viewId || process.env.FEISHU_BITABLE_VIEW_ID?.trim() || undefined,
    fieldMap: getConfiguredFieldMap(),
  }
}

export async function listFeishuBitableTablesByAppToken(appToken: string, token: string): Promise<FeishuBitableTable[]> {
  return listAllTables(
    {
      appToken,
      fieldMap: getConfiguredFieldMap(),
    },
    token,
  )
}

export async function readFeedbackFromFeishuBitableWithToken(input: {
  appToken: string
  tableId: string
  token: string
  viewId?: string
  sourceLabel?: string
}): Promise<{ feedbackItems: FeedbackItem[]; sourceLabel: string }> {
  const config = {
    appToken: input.appToken,
    tableId: input.tableId,
    viewId: input.viewId,
    fieldMap: getConfiguredFieldMap(),
  }
  const records = await searchAllRecords(config, input.token)
  const feedbackItems = recordsToFeedbackItems(records, config.fieldMap)

  validateFeedbackItems(feedbackItems)

  return {
    feedbackItems,
    sourceLabel: input.sourceLabel || `飞书表格 ${input.appToken}/${input.tableId}`,
  }
}

function getConfiguredFieldMap(): FieldMap {
  return {
    id: process.env.FEISHU_BITABLE_FIELD_ID?.trim() || undefined,
    userType: process.env.FEISHU_BITABLE_FIELD_USER_TYPE?.trim() || undefined,
    source: process.env.FEISHU_BITABLE_FIELD_SOURCE?.trim() || undefined,
    content: process.env.FEISHU_BITABLE_FIELD_CONTENT?.trim() || undefined,
    createdAt: process.env.FEISHU_BITABLE_FIELD_CREATED_AT?.trim() || undefined,
  }
}

function parseFeishuBitableUrl(urlText: string): BitableSourceOverride {
  let url: URL

  try {
    url = new URL(urlText.trim())
  } catch (error) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_URL_INVALID",
      "飞书多维表格链接不合法。",
      "请在群聊中发送形如“@PMOpsAgent 分析 https://xxx.feishu.cn/base/app_token?table=tblxxx&view=vewxxx”的链接。",
      { cause: error },
    )
  }

  const pathParts = url.pathname.split("/").filter(Boolean)
  const baseIndex = pathParts.findIndex((part) => part === "base")
  const appToken = baseIndex >= 0 ? pathParts[baseIndex + 1] : undefined
  const tableId = url.searchParams.get("table") || undefined
  const viewId = url.searchParams.get("view") || undefined

  if (!appToken || !tableId) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_URL_INVALID",
      "飞书多维表格链接缺少 app_token 或 table_id。",
      "请从浏览器地址栏复制完整多维表格链接，链接中应包含 /base/app_token 和 ?table=tblxxx。",
    )
  }

  return {
    appToken,
    tableId,
    viewId,
    sourceLabel: `飞书表格 ${appToken}/${tableId}${viewId ? `/${viewId}` : ""}`,
  }
}

async function getTenantAccessToken(config: Pick<BitableTenantBaseConfig, "appId" | "appSecret" | "appToken">) {
  const now = Date.now()

  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value
  }

  const payload = await fetchJsonWithTimeout<TenantAccessTokenResponse>(
    `${feishuBaseUrl}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
    },
    "FEISHU_TOKEN_REQUEST_FAILED",
    "获取飞书 tenant_access_token 失败。",
  )

  if (payload.code !== 0 || !payload.tenant_access_token) {
    throw new FeishuBitableError(
      "FEISHU_TOKEN_REQUEST_FAILED",
      payload.msg || "获取飞书 tenant_access_token 失败。",
      "请确认 FEISHU_APP_ID 和 FEISHU_APP_SECRET 来自同一个飞书自建应用，且应用已启用。",
    )
  }

  cachedToken = {
    value: payload.tenant_access_token,
    expiresAt: now + Math.max((payload.expire ?? 7200) - 300, 60) * 1000,
  }

  return payload.tenant_access_token
}

async function searchAllRecords(config: BitableConfig, token: string) {
  const records: BitableRecord[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${feishuBaseUrl}/bitable/v1/apps/${encodeURIComponent(config.appToken)}/tables/${encodeURIComponent(config.tableId)}/records/search`)
    url.searchParams.set("page_size", String(maxPageSize))

    if (pageToken) {
      url.searchParams.set("page_token", pageToken)
    }

    const payload = await fetchJsonWithTimeout<BitableSearchResponse>(
      url.toString(),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(config.viewId ? { view_id: config.viewId } : {}),
      },
      "FEISHU_BITABLE_REQUEST_FAILED",
      "读取飞书多维表格记录失败。",
    )

    if (payload.code !== 0) {
      throw new FeishuBitableError(
        "FEISHU_BITABLE_REQUEST_FAILED",
        payload.msg || "读取飞书多维表格记录失败。",
        "请确认应用权限、表格 app_token、table_id、view_id 正确，并且多维表格已授权给该应用。",
      )
    }

    records.push(...(payload.data?.items ?? []))
    pageToken = payload.data?.has_more ? payload.data.page_token : undefined
  } while (pageToken)

  return records
}

async function listAllTables(config: BitableBaseConfig, token: string) {
  const tables: FeishuBitableTable[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${feishuBaseUrl}/bitable/v1/apps/${encodeURIComponent(config.appToken)}/tables`)
    url.searchParams.set("page_size", "100")

    if (pageToken) {
      url.searchParams.set("page_token", pageToken)
    }

    const payload = await fetchJsonWithTimeout<BitableTableListResponse>(
      url.toString(),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
      },
      "FEISHU_BITABLE_REQUEST_FAILED",
      "列出飞书多维表格数据表失败。",
    )

    if (payload.code !== 0) {
      throw new FeishuBitableError(
        "FEISHU_BITABLE_REQUEST_FAILED",
        payload.msg || "列出飞书多维表格数据表失败。",
        "请确认应用拥有多维表格读取权限，并且该 Base 已授权给应用。",
      )
    }

    tables.push(
      ...(payload.data?.items ?? [])
        .filter((table): table is Required<Pick<BitableTable, "table_id" | "name">> => Boolean(table.table_id && table.name))
        .map((table) => ({
          tableId: table.table_id,
          name: table.name,
        })),
    )
    pageToken = payload.data?.has_more ? payload.data.page_token : undefined
  } while (pageToken)

  return tables
}

async function getBitableBaseName(config: BitableBaseConfig, token: string) {
  const payload = await fetchJsonWithTimeout<BitableAppMetaResponse>(
    `${feishuBaseUrl}/bitable/v1/apps/${encodeURIComponent(config.appToken)}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
    },
    "FEISHU_BITABLE_REQUEST_FAILED",
    "获取飞书多维表格元数据失败。",
  )

  if (payload.code !== 0) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_REQUEST_FAILED",
      payload.msg || "获取飞书多维表格元数据失败。",
      "请确认应用拥有多维表格读取权限，并且该 Base 已授权给应用。",
    )
  }

  return payload.data?.app?.name || payload.data?.name || config.appToken
}

function getConfiguredWorkspaceBaseRefs(options?: { allowEmpty?: boolean; includeFallback?: boolean }) {
  const raw = process.env.FEISHU_BITABLE_WORKSPACE_BASES?.trim()
  const fallbackAppToken = process.env.FEISHU_BITABLE_APP_TOKEN?.trim()
  const refs = raw
    ? raw
        .split(/[\n,;]+/)
        .map(parseWorkspaceBaseRef)
        .filter((ref): ref is BitableBaseRef => Boolean(ref?.appToken))
    : []

  if (refs.length === 0 && fallbackAppToken && options?.includeFallback) {
    refs.push({
      appToken: fallbackAppToken,
      label: process.env.FEISHU_BITABLE_WORKSPACE_NAME?.trim() || undefined,
    })
  }

  const deduped = dedupeBaseRefs(refs)

  if (deduped.length === 0 && !options?.allowEmpty) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_WORKSPACE_INDEX_MISSING",
      "飞书多维表格空间索引未配置。",
      "请在 .env.local 中配置 FEISHU_BITABLE_WORKSPACE_BASES，填入该空间下需要搜索的 Base 链接或 app_token，多个用英文逗号或换行分隔。",
    )
  }

  return deduped
}

function parseWorkspaceBaseRef(value: string): BitableBaseRef | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const [tokenOrUrl, label] = trimmed.split("|").map((part) => part.trim())
  const appToken = parseBitableAppToken(tokenOrUrl)

  if (!appToken) return undefined

  return {
    appToken,
    label: label || undefined,
  }
}

function parseBitableAppToken(tokenOrUrl: string) {
  if (!/^https?:\/\//i.test(tokenOrUrl)) return tokenOrUrl.trim()

  try {
    const url = new URL(tokenOrUrl.trim())
    const pathParts = url.pathname.split("/").filter(Boolean)
    const baseIndex = pathParts.findIndex((part) => part === "base")
    const appToken = baseIndex >= 0 ? pathParts[baseIndex + 1] : undefined

    if (!appToken || appToken === "workspace") return undefined
    return appToken
  } catch {
    return undefined
  }
}

function dedupeBaseRefs(refs: BitableBaseRef[]) {
  const seen = new Set<string>()
  const deduped: BitableBaseRef[] = []

  for (const ref of refs) {
    if (seen.has(ref.appToken)) continue
    seen.add(ref.appToken)
    deduped.push(ref)
  }

  return deduped
}

function matchBitableTable(tables: FeishuBitableTable[], tableName: string) {
  const query = normalizeTableName(tableName)

  if (!query) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NOT_FOUND",
      "没有识别到要分析的数据表名称。",
      `请发送“@PMOpsAgent 列出表格”查看可选表格，再发送“@PMOpsAgent 分析 表名”。${formatTableOptions(tables)}`,
    )
  }

  const exactMatches = tables.filter((table) => normalizeTableName(table.name) === query)
  if (exactMatches.length === 1) return exactMatches[0]

  const fuzzyMatches = tables.filter((table) => normalizeTableName(table.name).includes(query) || query.includes(normalizeTableName(table.name)))
  const matches = exactMatches.length > 0 ? exactMatches : fuzzyMatches

  if (matches.length === 1) return matches[0]

  if (matches.length > 1) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS",
      `找到多个名称接近“${tableName}”的数据表。`,
      `请使用更完整的表名重新发送。候选：${matches.map((table) => table.name).join("、")}`,
    )
  }

  throw new FeishuBitableError(
    "FEISHU_BITABLE_TABLE_NOT_FOUND",
    `没有找到名为“${tableName}”的数据表。`,
    `请发送“@PMOpsAgent 列出表格”查看可选表格。${formatTableOptions(tables)}`,
  )
}

function matchWorkspaceTable(tables: FeishuBitableWorkspaceTable[], tableName: string) {
  const query = normalizeTableName(tableName)

  if (!query) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NOT_FOUND",
      "没有识别到要分析的数据表名称。",
      `请发送“@PMOpsAgent 列出空间表格”查看可选表格，再发送“@PMOpsAgent 分析 表名”。${formatWorkspaceTableOptions(tables)}`,
    )
  }

  const tableFullName = (table: FeishuBitableWorkspaceTable) => normalizeTableName(`${table.baseName}/${table.name}`)
  const exactMatches = tables.filter((table) => normalizeTableName(table.name) === query || tableFullName(table) === query)
  if (exactMatches.length === 1) return exactMatches[0]

  const fuzzyMatches = tables.filter((table) => {
    const normalizedName = normalizeTableName(table.name)
    const normalizedFullName = tableFullName(table)
    return normalizedName.includes(query) || normalizedFullName.includes(query) || query.includes(normalizedName)
  })
  const matches = exactMatches.length > 0 ? exactMatches : fuzzyMatches

  if (matches.length === 1) return matches[0]

  if (matches.length > 1) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS",
      `找到多个名称接近“${tableName}”的数据表。`,
      `请使用“Base名/表名”重新发送。候选：${matches.map((table) => `${table.baseName}/${table.name}`).join("、")}`,
    )
  }

  throw new FeishuBitableError(
    "FEISHU_BITABLE_TABLE_NOT_FOUND",
    `没有找到名为“${tableName}”的数据表。`,
    `请发送“@PMOpsAgent 列出空间表格”查看可选表格。${formatWorkspaceTableOptions(tables)}`,
  )
}

function normalizeTableName(tableName: string) {
  return tableName.trim().toLowerCase().replace(/\s+/g, "")
}

function formatTableOptions(tables: FeishuBitableTable[]) {
  if (tables.length === 0) return "当前 Base 下没有读取到数据表。"
  return `当前可选表格：${tables.slice(0, 10).map((table) => table.name).join("、")}${tables.length > 10 ? " 等" : ""}`
}

function formatWorkspaceTableOptions(tables: FeishuBitableWorkspaceTable[]) {
  if (tables.length === 0) return "当前空间索引下没有读取到数据表。"
  return `当前可选表格：${tables
    .slice(0, 10)
    .map((table) => `${table.baseName}/${table.name}`)
    .join("、")}${tables.length > 10 ? " 等" : ""}`
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  errorCode: Exclude<FeishuBitableErrorCode, "FEISHU_BITABLE_CONFIG_MISSING" | "FEISHU_BITABLE_URL_INVALID" | "FEISHU_BITABLE_WORKSPACE_INDEX_MISSING" | "FEISHU_BITABLE_TABLE_NOT_FOUND" | "FEISHU_BITABLE_TABLE_NAME_AMBIGUOUS" | "FEISHU_BITABLE_EMPTY" | "FEISHU_BITABLE_MISSING_CONTENT" | "FEISHU_BITABLE_TOO_FEW_ROWS">,
  message: string,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    const responseText = await response.text()
    const payload = parseJson<T>(responseText)

    if (!response.ok) {
      throw new FeishuBitableError(
        errorCode,
        `${message} HTTP ${response.status}。`,
        "请检查飞书应用权限、表格授权和网络连接。",
      )
    }

    return payload
  } catch (error) {
    if (error instanceof FeishuBitableError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new FeishuBitableError("FEISHU_BITABLE_TIMEOUT", `${message} 请求超时。`, "请检查网络连接，或稍后重试。", {
        cause: error,
      })
    }

    throw new FeishuBitableError(errorCode, `${message} 网络异常。`, "请检查本机是否能访问 open.feishu.cn。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function recordsToFeedbackItems(records: BitableRecord[], fieldMap: FieldMap): FeedbackItem[] {
  return records.reduce<FeedbackItem[]>((items, record, index) => {
    const fields = record.fields ?? {}
    const content = getFieldText(fields, fieldMap.content, ["content", "反馈内容", "用户反馈", "反馈", "内容", "问题描述"])

    if (!content) {
      return items
    }

    items.push({
      id: getFieldText(fields, fieldMap.id, ["id", "ID", "反馈ID", "编号"]) || record.record_id || `F${String(index + 1).padStart(3, "0")}`,
      userType: getFieldText(fields, fieldMap.userType, ["user_type", "用户类型", "用户分层", "用户"]),
      source: getFieldText(fields, fieldMap.source, ["source", "来源", "反馈来源", "渠道"]),
      content,
      createdAt: getFieldText(fields, fieldMap.createdAt, ["created_at", "创建时间", "反馈时间", "日期", "时间"]),
    })

    return items
  }, [])
}

function validateFeedbackItems(feedbackItems: FeedbackItem[]) {
  if (feedbackItems.length === 0) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_EMPTY",
      "飞书多维表格没有读取到可用反馈。",
      "请确认表格中有反馈记录，并且字段名包含 content 或 反馈内容；也可以通过 FEISHU_BITABLE_FIELD_CONTENT 指定字段名。",
    )
  }

  if (feedbackItems.some((item) => !item.content.trim())) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_MISSING_CONTENT",
      "飞书多维表格存在缺少反馈内容的记录。",
      "请补充反馈内容，或调整视图筛选，只读取 content 不为空的记录。",
    )
  }

  if (feedbackItems.length < 3) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_TOO_FEW_ROWS",
      `当前只读取到 ${feedbackItems.length} 条反馈，少于 3 条。`,
      "请在飞书多维表格中补充至少 3 条反馈，再重新读取。",
    )
  }
}

function getFieldText(fields: Record<string, unknown>, configuredName: string | undefined, aliases: string[]) {
  const fieldName = configuredName || findFieldName(fields, aliases)

  if (!fieldName) {
    return undefined
  }

  return normalizeFieldValue(fields[fieldName])
}

function findFieldName(fields: Record<string, unknown>, aliases: string[]) {
  const fieldNames = Object.keys(fields)
  const normalizedAliases = aliases.map(normalizeFieldName)

  return fieldNames.find((fieldName) => normalizedAliases.includes(normalizeFieldName(fieldName)))
}

function normalizeFieldName(fieldName: string) {
  return fieldName.trim().toLowerCase().replace(/\s+/g, "_")
}

function normalizeFieldValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value.trim() || undefined
  if (typeof value === "number" || typeof value === "boolean") return String(value)

  if (Array.isArray(value)) {
    const text = value.map(normalizeFieldValue).filter(Boolean).join(" ").trim()
    return text || undefined
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>

    if (typeof objectValue.text === "string") return objectValue.text.trim() || undefined
    if (typeof objectValue.name === "string") return objectValue.name.trim() || undefined
    if (typeof objectValue.value === "string") return objectValue.value.trim() || undefined

    const text = Object.values(objectValue).map(normalizeFieldValue).filter(Boolean).join(" ").trim()
    return text || undefined
  }

  return undefined
}

function parseJson<T>(text: string): T {
  if (!text.trim()) {
    return {} as T
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new FeishuBitableError(
      "FEISHU_BITABLE_REQUEST_FAILED",
      "飞书接口返回了非 JSON 内容。",
      "请稍后重试；如果持续出现，请检查飞书开放平台接口状态。",
      {
        cause: error,
      },
    )
  }
}
