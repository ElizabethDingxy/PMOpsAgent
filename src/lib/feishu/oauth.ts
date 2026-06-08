import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import crypto from "node:crypto"
import path from "node:path"

const feishuBaseUrl = "https://open.feishu.cn/open-apis"
const oauthAuthorizeUrl = "https://accounts.feishu.cn/open-apis/authen/v1/authorize"
const tokenPath = path.join(process.cwd(), "data", "feishu-oauth-token.json")
const statePath = path.join(process.cwd(), "data", "feishu-oauth-state.json")
const defaultOAuthScopes = "auth:user.id:read search:docs:read drive:drive:readonly bitable:app:readonly offline_access"
const requiredOAuthScopes = ["search:docs:read", "drive:drive:readonly", "bitable:app:readonly"]

type FeishuOAuthErrorCode =
  | "FEISHU_OAUTH_CONFIG_MISSING"
  | "FEISHU_OAUTH_STATE_INVALID"
  | "FEISHU_OAUTH_TOKEN_MISSING"
  | "FEISHU_OAUTH_TOKEN_FAILED"
  | "FEISHU_OAUTH_REFRESH_FAILED"
  | "FEISHU_OAUTH_SEARCH_FAILED"
  | "FEISHU_OAUTH_TIMEOUT"

export class FeishuOAuthError extends Error {
  code: FeishuOAuthErrorCode
  fix: string

  constructor(code: FeishuOAuthErrorCode, message: string, fix: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "FeishuOAuthError"
    this.code = code
    this.fix = fix
  }
}

type FeishuOAuthConfig = {
  appId: string
  appSecret: string
  redirectUri: string
  scopes?: string
}

type UserAccessTokenResponse = {
  code?: number
  msg?: string
  error?: string
  error_description?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  refresh_expires_in?: number
  token_type?: string
  scope?: string
}

type StoredUserToken = {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  refreshExpiresAt?: number
  tokenType?: string
  scope?: string
  updatedAt: string
}

type StoredOAuthState = {
  state: string
  createdAt: number
}

type SearchDocumentsResponse = {
  code?: number
  msg?: string
  data?: unknown
}

type RootFolderMetaResponse = {
  code?: number
  msg?: string
  data?: unknown
}

type DriveFileListResponse = {
  code?: number
  msg?: string
  data?: unknown
}

export type FeishuOAuthStatus = {
  authorized: boolean
  scope?: string
  updatedAt?: string
  missingScopes: string[]
}

export type FeishuBitableBaseSearchResult = {
  appToken: string
  title: string
  url?: string
}

type FeishuDriveFile = {
  token?: string
  name?: string
  type?: string
  url?: string
}

export function getFeishuOAuthRuntimeConfig() {
  const redirectUri = getConfiguredRedirectUri()

  return {
    configured: Boolean(process.env.FEISHU_APP_ID?.trim() && process.env.FEISHU_APP_SECRET?.trim() && redirectUri),
    redirectUriConfigured: Boolean(redirectUri),
    tokenFileConfigured: true,
  }
}

export function getDefaultFeishuBitableBaseSearchKey() {
  return process.env.FEISHU_OAUTH_DEFAULT_SEARCH_KEY?.trim() || "反馈"
}

export async function createFeishuOAuthAuthorizeUrl() {
  const config = getFeishuOAuthConfig()
  const state = crypto.randomBytes(16).toString("hex")
  await saveOAuthState(state)

  const url = new URL(oauthAuthorizeUrl)
  url.searchParams.set("client_id", config.appId)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("state", state)

  if (config.scopes) {
    url.searchParams.set("scope", config.scopes)
  }

  return url.toString()
}

export async function exchangeFeishuOAuthCode(code: string, state?: string) {
  await assertOAuthState(state)

  const config = getFeishuOAuthConfig()
  const payload = await fetchJsonWithTimeout<UserAccessTokenResponse>(
    `${feishuBaseUrl}/authen/v2/oauth/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: config.appId,
        client_secret: config.appSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    },
    "FEISHU_OAUTH_TOKEN_FAILED",
    "获取飞书 user_access_token 失败。",
  )

  if (payload.code !== 0 || !payload.access_token) {
    throw new FeishuOAuthError(
      "FEISHU_OAUTH_TOKEN_FAILED",
      formatFeishuMessage("获取飞书 user_access_token 失败。", payload),
      "请确认飞书应用 OAuth 重定向 URL 配置正确，授权码未过期，且应用已发布。",
    )
  }

  const now = Date.now()
  const storedToken: StoredUserToken = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: now + Math.max(payload.expires_in ?? 7200, 60) * 1000,
    refreshExpiresAt: getRefreshExpiresAt(payload, now),
    tokenType: payload.token_type,
    scope: payload.scope,
    updatedAt: new Date().toISOString(),
  }

  await saveStoredUserToken(storedToken)
  await clearOAuthState()

  return storedToken
}

export async function hasFeishuOAuthToken() {
  try {
    await readStoredUserToken()
    return true
  } catch {
    return false
  }
}

export async function getFeishuOAuthStatus(): Promise<FeishuOAuthStatus> {
  try {
    const token = await readStoredUserToken()
    return {
      authorized: true,
      scope: token.scope,
      updatedAt: token.updatedAt,
      missingScopes: getMissingOAuthScopes(token.scope),
    }
  } catch {
    return {
      authorized: false,
      missingScopes: requiredOAuthScopes,
    }
  }
}

export async function getValidFeishuUserAccessToken() {
  const token = await readStoredUserToken()
  const now = Date.now()
  assertTokenHasRequiredScopes(token.scope)

  if (token.expiresAt > now + 60_000) {
    return token.accessToken
  }

  if (!token.refreshToken || (token.refreshExpiresAt && token.refreshExpiresAt <= now + 60_000)) {
    throw new FeishuOAuthError(
      "FEISHU_OAUTH_TOKEN_MISSING",
      "飞书 OAuth 授权已过期。",
      "请在群聊中发送“@PMOpsAgent 授权链接”，重新打开链接完成授权。",
    )
  }

  return refreshFeishuUserAccessToken(token.refreshToken)
}

export async function searchFeishuBitableBases(query?: string): Promise<FeishuBitableBaseSearchResult[]> {
  const accessToken = await getValidFeishuUserAccessToken()
  const searchKey = query?.trim() || getDefaultFeishuBitableBaseSearchKey()
  const payload = await fetchJsonWithTimeout<SearchDocumentsResponse>(
    `${feishuBaseUrl}/search/v2/doc_wiki/search`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        query: searchKey,
        count: 50,
        offset: 0,
        docs_types: ["bitable"],
      }),
    },
    "FEISHU_OAUTH_SEARCH_FAILED",
    "搜索飞书云文档失败。",
  )

  if (payload.code !== 0) {
    throw new FeishuOAuthError(
      "FEISHU_OAUTH_SEARCH_FAILED",
      formatFeishuMessage("搜索飞书云文档失败。", payload),
      "请确认应用已申请云文档搜索或云空间读取权限，并且授权用户能访问目标多维表格。",
    )
  }

  return parseBitableBasesFromSearchPayload(payload.data)
}

export async function listFeishuBitableBases(): Promise<FeishuBitableBaseSearchResult[]> {
  const accessToken = await getValidFeishuUserAccessToken()
  const rootFolderToken = await getFeishuRootFolderToken(accessToken)
  const bases: FeishuBitableBaseSearchResult[] = []
  const foldersToVisit = [rootFolderToken]
  const visitedFolders = new Set<string>()
  let scannedFiles = 0

  while (foldersToVisit.length > 0 && visitedFolders.size < 80 && scannedFiles < 2000) {
    const folderToken = foldersToVisit.shift()
    if (!folderToken || visitedFolders.has(folderToken)) continue
    visitedFolders.add(folderToken)

    const files = await listFeishuDriveFolderFiles(accessToken, folderToken)
    scannedFiles += files.length

    for (const file of files) {
      const type = file.type?.toLowerCase()
      if (type === "folder" && file.token) {
        foldersToVisit.push(file.token)
        continue
      }

      if (type === "bitable" && file.token) {
        bases.push({
          appToken: file.token,
          title: file.name || file.token,
          url: file.url,
        })
      }
    }
  }

  return dedupeBases(bases)
}

async function refreshFeishuUserAccessToken(refreshToken: string) {
  const config = getFeishuOAuthConfig()
  const payload = await fetchJsonWithTimeout<UserAccessTokenResponse>(
    `${feishuBaseUrl}/authen/v2/oauth/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: config.appId,
        client_secret: config.appSecret,
        refresh_token: refreshToken,
      }),
    },
    "FEISHU_OAUTH_REFRESH_FAILED",
    "刷新飞书 user_access_token 失败。",
  )

  if (payload.code !== 0 || !payload.access_token) {
    throw new FeishuOAuthError(
      "FEISHU_OAUTH_REFRESH_FAILED",
      formatFeishuMessage("刷新飞书 user_access_token 失败。", payload),
      "请在群聊中发送“@PMOpsAgent 授权链接”，重新打开链接完成授权。",
    )
  }

  const now = Date.now()
  const storedToken: StoredUserToken = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || refreshToken,
    expiresAt: now + Math.max(payload.expires_in ?? 7200, 60) * 1000,
    refreshExpiresAt: getRefreshExpiresAt(payload, now),
    tokenType: payload.token_type,
    scope: payload.scope,
    updatedAt: new Date().toISOString(),
  }

  await saveStoredUserToken(storedToken)

  return storedToken.accessToken
}

function getFeishuOAuthConfig(): FeishuOAuthConfig {
  const appId = process.env.FEISHU_APP_ID?.trim()
  const appSecret = process.env.FEISHU_APP_SECRET?.trim()
  const redirectUri = getConfiguredRedirectUri()

  if (!appId || !appSecret || !redirectUri) {
    throw new FeishuOAuthError(
      "FEISHU_OAUTH_CONFIG_MISSING",
      "飞书 OAuth 配置不完整。",
      "请在 .env.local 中配置 FEISHU_APP_ID、FEISHU_APP_SECRET，并配置 FEISHU_OAUTH_REDIRECT_URI 或 FEISHU_PUBLIC_BASE_URL。",
    )
  }

  return {
    appId,
    appSecret,
    redirectUri,
    scopes: process.env.FEISHU_OAUTH_SCOPES?.trim() || defaultOAuthScopes,
  }
}

function getConfiguredRedirectUri() {
  const explicitRedirectUri = process.env.FEISHU_OAUTH_REDIRECT_URI?.trim()
  if (explicitRedirectUri) return explicitRedirectUri

  const publicBaseUrl = process.env.FEISHU_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, "")
  if (!publicBaseUrl) return undefined

  return `${publicBaseUrl}/api/feishu/oauth/callback`
}

function assertTokenHasRequiredScopes(scope: string | undefined) {
  const missingScopes = getMissingOAuthScopes(scope)

  if (missingScopes.length === 0) return

  throw new FeishuOAuthError(
    "FEISHU_OAUTH_TOKEN_MISSING",
    `当前飞书 OAuth 授权缺少必要权限：${missingScopes.join("、")}。`,
    "请确认这些权限已在飞书开放平台以“用户身份权限”申请并发布审批，然后在群聊中发送“@PMOpsAgent 授权链接”重新授权。旧 token 不会自动获得新增权限。",
  )
}

function getMissingOAuthScopes(scope: string | undefined) {
  const scopeSet = new Set((scope || "").split(/\s+/).filter(Boolean))

  return requiredOAuthScopes.filter((requiredScope) => !scopeSet.has(requiredScope))
}

async function getFeishuRootFolderToken(accessToken: string) {
  const payload = await fetchJsonWithTimeout<RootFolderMetaResponse>(
    `${feishuBaseUrl}/drive/explorer/v2/root_folder/meta`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
    },
    "FEISHU_OAUTH_SEARCH_FAILED",
    "获取飞书我的空间根目录失败。",
  )

  if (payload.code !== 0) {
    throw new FeishuOAuthError(
      "FEISHU_OAUTH_SEARCH_FAILED",
      formatFeishuMessage("获取飞书我的空间根目录失败。", payload),
      "请确认应用已申请云空间读取权限，并且用户已重新完成 OAuth 授权。",
    )
  }

  const token = findFirstStringByKeys(payload.data, ["token", "folder_token", "file_token", "id"])
  if (!token) {
    throw new FeishuOAuthError(
      "FEISHU_OAUTH_SEARCH_FAILED",
      "飞书没有返回我的空间根目录 token。",
      "请确认应用拥有云空间读取权限，或改用“搜索 Base 关键词”入口。",
    )
  }

  return token
}

async function listFeishuDriveFolderFiles(accessToken: string, folderToken: string) {
  const files: FeishuDriveFile[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${feishuBaseUrl}/drive/v1/files`)
    url.searchParams.set("folder_token", folderToken)
    url.searchParams.set("page_size", "50")
    if (pageToken) {
      url.searchParams.set("page_token", pageToken)
    }

    const payload = await fetchJsonWithTimeout<DriveFileListResponse>(
      url.toString(),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json; charset=utf-8",
        },
      },
      "FEISHU_OAUTH_SEARCH_FAILED",
      "列出飞书云空间文件失败。",
    )

    if (payload.code !== 0) {
      throw new FeishuOAuthError(
        "FEISHU_OAUTH_SEARCH_FAILED",
        formatFeishuMessage("列出飞书云空间文件失败。", payload),
        "请确认应用已申请云空间读取权限，并且用户已重新完成 OAuth 授权。",
      )
    }

    files.push(...parseDriveFiles(payload.data))
    pageToken = getNextPageToken(payload.data)
  } while (pageToken)

  return files
}

function getRefreshExpiresAt(payload: UserAccessTokenResponse, now: number) {
  const refreshExpiresIn = payload.refresh_token_expires_in ?? payload.refresh_expires_in

  return refreshExpiresIn ? now + refreshExpiresIn * 1000 : undefined
}

async function saveOAuthState(state: string) {
  await ensureDataDir()
  const payload: StoredOAuthState = {
    state,
    createdAt: Date.now(),
  }

  await writeFile(statePath, JSON.stringify(payload, null, 2), "utf8")
}

async function assertOAuthState(state: string | undefined) {
  if (!state) {
    throw new FeishuOAuthError("FEISHU_OAUTH_STATE_INVALID", "飞书 OAuth state 缺失。", "请重新从系统生成的授权链接进入。")
  }

  try {
    const raw = await readFile(statePath, "utf8")
    const storedState = JSON.parse(raw) as StoredOAuthState

    if (storedState.state !== state || storedState.createdAt < Date.now() - 10 * 60 * 1000) {
      throw new Error("state mismatch")
    }
  } catch (error) {
    throw new FeishuOAuthError("FEISHU_OAUTH_STATE_INVALID", "飞书 OAuth state 校验失败。", "请重新从系统生成的授权链接进入。", {
      cause: error,
    })
  }
}

async function clearOAuthState() {
  try {
    await unlink(statePath)
  } catch {
    // State file is single-use best effort.
  }
}

async function saveStoredUserToken(token: StoredUserToken) {
  await ensureDataDir()
  await writeFile(tokenPath, JSON.stringify(token, null, 2), "utf8")
}

async function readStoredUserToken() {
  try {
    const raw = await readFile(tokenPath, "utf8")
    const token = JSON.parse(raw) as StoredUserToken

    if (!token.accessToken || !token.expiresAt) {
      throw new Error("token file incomplete")
    }

    return token
  } catch (error) {
    throw new FeishuOAuthError(
      "FEISHU_OAUTH_TOKEN_MISSING",
      "尚未完成飞书 OAuth 授权。",
      "请在群聊中发送“@PMOpsAgent 授权链接”，打开链接并完成授权。",
      { cause: error },
    )
  }
}

function parseBitableBasesFromSearchPayload(data: unknown): FeishuBitableBaseSearchResult[] {
  const rawItems = collectSearchItems(data)
  const bases = rawItems
    .map(normalizeSearchItem)
    .filter((item): item is FeishuBitableBaseSearchResult => Boolean(item?.appToken && item.title))

  return dedupeBases(bases)
}

function collectSearchItems(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return []
  const objectData = data as Record<string, unknown>
  const candidates = [
    objectData.docs_entities,
    objectData.entities,
    objectData.items,
    objectData.files,
    objectData.results,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }

  return []
}

function parseDriveFiles(data: unknown): FeishuDriveFile[] {
  const rawItems = collectDriveItems(data)

  return rawItems
    .map(normalizeDriveFile)
    .filter((file): file is FeishuDriveFile => Boolean(file?.token && file.type))
}

function collectDriveItems(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return []
  const objectData = data as Record<string, unknown>
  const candidates = [
    objectData.files,
    objectData.items,
    objectData.entities,
    objectData.children,
    objectData.list,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }

  return []
}

function normalizeDriveFile(item: unknown): FeishuDriveFile | undefined {
  if (!item || typeof item !== "object") return undefined
  const raw = item as Record<string, unknown>
  const token = firstString(raw.token, raw.file_token, raw.folder_token, raw.obj_token)
  const name = firstString(raw.name, raw.file_name, raw.title)
  const type = firstString(raw.type, raw.file_type, raw.obj_type)
  const url = firstString(raw.url, raw.link)

  if (!token || !type) return undefined

  return {
    token,
    name,
    type,
    url,
  }
}

function getNextPageToken(data: unknown) {
  if (!data || typeof data !== "object") return undefined
  const objectData = data as Record<string, unknown>
  const hasMore = objectData.has_more === true

  if (!hasMore) return undefined

  return firstString(objectData.page_token, objectData.next_page_token)
}

function findFirstStringByKeys(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const objectValue = value as Record<string, unknown>

  for (const key of keys) {
    const direct = firstString(objectValue[key])
    if (direct) return direct
  }

  for (const nested of Object.values(objectValue)) {
    const found = findFirstStringByKeys(nested, keys)
    if (found) return found
  }

  return undefined
}

function normalizeSearchItem(item: unknown): FeishuBitableBaseSearchResult | undefined {
  if (!item || typeof item !== "object") return undefined
  const raw = item as Record<string, unknown>
  const type = String(raw.docs_type || raw.obj_type || raw.type || raw.file_type || "")
  const url = firstString(raw.url, raw.link, raw.docs_url)
  const token = firstString(raw.docs_token, raw.doc_token, raw.token, raw.file_token, raw.obj_token, raw.app_token) || parseAppTokenFromUrl(url)
  const title = firstString(raw.title, raw.name, raw.docs_title, raw.doc_title, raw.file_name) || token

  if (!token) return undefined
  if (type && !type.toLowerCase().includes("bitable") && !type.toLowerCase().includes("base") && !url?.includes("/base/")) return undefined

  return {
    appToken: token,
    title: title || token,
    url,
  }
}

function parseAppTokenFromUrl(url: string | undefined) {
  if (!url) return undefined

  try {
    const parsedUrl = new URL(url)
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean)
    const baseIndex = pathParts.findIndex((part) => part === "base")
    const appToken = baseIndex >= 0 ? pathParts[baseIndex + 1] : undefined

    if (!appToken || appToken === "workspace") return undefined
    return appToken
  } catch {
    return undefined
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  return undefined
}

function dedupeBases(bases: FeishuBitableBaseSearchResult[]) {
  const seen = new Set<string>()
  const deduped: FeishuBitableBaseSearchResult[] = []

  for (const base of bases) {
    if (seen.has(base.appToken)) continue
    seen.add(base.appToken)
    deduped.push(base)
  }

  return deduped
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, errorCode: FeishuOAuthErrorCode, message: string) {
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
      throw new FeishuOAuthError(errorCode, `${message} HTTP ${response.status}。${formatFeishuMessage("", payload as Record<string, unknown>)}`, "请检查飞书应用权限、发布状态和网络连接。")
    }

    return payload
  } catch (error) {
    if (error instanceof FeishuOAuthError) {
      throw error
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new FeishuOAuthError("FEISHU_OAUTH_TIMEOUT", `${message} 请求超时。`, "请检查网络连接，或稍后重试。", {
        cause: error,
      })
    }

    throw new FeishuOAuthError(errorCode, `${message} 网络异常。`, "请检查本机是否能访问 open.feishu.cn。", {
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function parseJson<T>(text: string): T {
  if (!text.trim()) {
    return {} as T
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new FeishuOAuthError("FEISHU_OAUTH_SEARCH_FAILED", "飞书接口返回了非 JSON 内容。", "请稍后重试。", {
      cause: error,
    })
  }
}

function formatFeishuMessage(prefix: string, payload: { code?: number; msg?: string; message?: string; error?: string } | Record<string, unknown>) {
  const parts = [prefix.trim()]
  const code = typeof payload.code === "number" ? payload.code : undefined
  const message = firstString(payload.msg, payload.message, payload.error)

  if (typeof code === "number") {
    parts.push(`飞书错误码：${code}。`)
  }

  if (message) {
    parts.push(`飞书返回：${message}`)
  }

  return parts.filter(Boolean).join(" ")
}

async function ensureDataDir() {
  await mkdir(path.join(process.cwd(), "data"), {
    recursive: true,
  })
}
