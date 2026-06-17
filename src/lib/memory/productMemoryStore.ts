import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import type { DemandCluster, EngineeringTask, FeedbackItem, RiceItem, SavedAgentRun } from "@/types/product"
import {
  rankProductMemories,
  rankMemoryContext,
  upsertProjectVectorsFromMemory,
} from "./vectorStore"

const memoryDir = path.join(process.cwd(), "data", "product-memory")
const runsDir = path.join(process.cwd(), "data", "runs")

export type ProductMemory = {
  key: string
  displayName: string
  aliases: string[]
  sourceLabels: string[]
  runIds: string[]
  latestRunId: string
  summary: string
  artifacts: {
    prdTitle: string
    mvpMustHave: string[]
    mvpShouldHave: string[]
    topRisks: string[]
    openQuestions: string[]
  }
  decisions: ProductMemoryDecision[]
  evidence: ProductMemoryEvidence[]
  createdAt: string
  updatedAt: string
}

export type ProductMemoryDecision = {
  kind: "task" | "rice" | "cluster"
  title: string
  description: string
  priority?: string
  rationale?: string
  evidenceFeedbackIds: string[]
  runId: string
  updatedAt: string
}

export type ProductMemoryEvidence = Pick<FeedbackItem, "id" | "userType" | "source" | "content" | "createdAt"> & {
  runId: string
}

export type ProductMemorySearchResult = {
  memory: ProductMemory
  score: number
  matchedFields: string[]
}

export type ProductMemoryContextSearchResult = {
  memory: Pick<ProductMemory, "key" | "displayName" | "aliases" | "sourceLabels" | "latestRunId" | "summary" | "artifacts">
  decisions: Array<ProductMemoryDecision & { score: number }>
  evidence: Array<ProductMemoryEvidence & { score: number }>
}

export type ProductMemoryDuplicateGroup = {
  title: string
  confidence: number
  reason: string
  memories: Array<Pick<ProductMemory, "key" | "displayName" | "aliases" | "sourceLabels" | "latestRunId" | "summary" | "updatedAt">>
}

export type ProductMemoryComparison = {
  memories: ProductMemory[]
  similarity: number
  duplicateLikely: boolean
  recommendedTargetKey?: string
  reasons: string[]
  mergeRisks: string[]
}

export async function upsertProductMemoryFromSavedRun(savedRun: SavedAgentRun): Promise<ProductMemory> {
  await ensureMemoryDir()

  const key = deriveProjectKey(savedRun)
  const now = new Date().toISOString()
  const existing = await readProductMemoryByKey(key).catch(() => undefined)
  const result = savedRun.run.result
  const aliases = uniqueStrings([
    result.productName,
    result.prd.title,
    savedRun.sourceLabel,
    ...splitSourceLabel(savedRun.sourceLabel),
  ])
  const sourceLabels = uniqueStrings([...(existing?.sourceLabels ?? []), savedRun.sourceLabel])
  const decisions = mergeDecisions(existing?.decisions ?? [], buildDecisions(savedRun))
  const evidence = mergeEvidence(existing?.evidence ?? [], buildEvidence(savedRun))

  const memory: ProductMemory = {
    key,
    displayName: existing?.displayName || result.productName,
    aliases: uniqueStrings([...(existing?.aliases ?? []), ...aliases]),
    sourceLabels,
    runIds: uniqueStrings([...(existing?.runIds ?? []), savedRun.id]),
    latestRunId: savedRun.id,
    summary: result.summary,
    artifacts: {
      prdTitle: result.prd.title,
      mvpMustHave: result.mvpScope.mustHave.slice(0, 8).map(formatScopeItem),
      mvpShouldHave: result.mvpScope.shouldHave.slice(0, 8).map(formatScopeItem),
      topRisks: result.risks.slice(0, 5).map((risk) => `${risk.risk}（${risk.level}）`),
      openQuestions: result.openQuestions.slice(0, 8),
    },
    decisions,
    evidence,
    createdAt: existing?.createdAt || savedRun.createdAt || now,
    updatedAt: now,
  }

  await writeFile(getMemoryPath(key), JSON.stringify(memory, null, 2), "utf8")

  // Generate and save vectors in the background
  await upsertProjectVectorsFromMemory(memory).catch((err) => {
    console.error(`[VectorStore] Failed to generate/save vectors for project ${key}:`, err)
  })

  return memory
}

export async function listProductMemories(): Promise<ProductMemory[]> {
  await ensureMemoryDir()
  await backfillProductMemoriesFromRuns()

  const files = await readdir(memoryDir).catch(() => [])
  const memories = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        try {
          return await readProductMemoryByKey(file.replace(/\.json$/, ""))
        } catch {
          return null
        }
      }),
  )

  return memories
    .filter((memory): memory is ProductMemory => Boolean(memory))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function searchProductMemories(query: string, limit = 8): Promise<ProductMemorySearchResult[]> {
  const memories = await listProductMemories()
  if (memories.length === 0) return []

  const ranked = await rankProductMemories(query, memories)

  return ranked
    .map((item) => ({
      memory: item.memory,
      score: item.score,
      matchedFields: ["vector_similarity"],
    }))
    .filter((item) => item.score > 0 || !query.trim())
    .slice(0, limit)
}

export async function readProductMemoryByKey(key: string): Promise<ProductMemory> {
  const safeKey = sanitizeMemoryKey(key)
  const raw = await readFile(getMemoryPath(safeKey), "utf8")

  return JSON.parse(raw) as ProductMemory
}

export async function findDuplicateProductMemories(query?: string): Promise<ProductMemoryDuplicateGroup[]> {
  const memories = query?.trim()
    ? (await searchProductMemories(query, 20)).map((match) => match.memory)
    : await listProductMemories()
  const groups: ProductMemoryDuplicateGroup[] = []
  const usedKeys = new Set<string>()

  for (const memory of memories) {
    if (usedKeys.has(memory.key)) continue

    const matches = memories
      .filter((candidate) => candidate.key !== memory.key && !usedKeys.has(candidate.key))
      .map((candidate) => ({
        memory: candidate,
        score: scoreDuplicateMemory(memory, candidate),
      }))
      .filter((item) => item.score >= 72)
      .sort((a, b) => b.score - a.score)

    if (matches.length === 0) continue

    const grouped = [memory, ...matches.map((match) => match.memory)]
    grouped.forEach((item) => usedKeys.add(item.key))
    groups.push({
      title: pickDuplicateGroupTitle(grouped),
      confidence: Math.min(0.98, Math.max(...matches.map((match) => match.score)) / 100),
      reason: buildDuplicateReason(grouped, matches[0].score),
      memories: grouped.map(compactMemoryForDuplicate),
    })
  }

  return groups.sort((a, b) => b.confidence - a.confidence)
}

export async function compareProductMemories(keys: string[]): Promise<ProductMemoryComparison> {
  const uniqueKeys = uniqueStrings(keys)
  const memories = await Promise.all(uniqueKeys.map((key) => readProductMemoryByKey(key)))

  if (memories.length < 2) {
    return {
      memories,
      similarity: 0,
      duplicateLikely: false,
      reasons: ["至少需要两个项目才能比较是否重复。"],
      mergeRisks: ["候选项目不足，不能生成合并方案。"],
    }
  }

  const pairScores = memories.flatMap((memory, index) =>
    memories.slice(index + 1).map((candidate) => scoreDuplicateMemory(memory, candidate)),
  )
  const similarity = Math.round(pairScores.reduce((sum, score) => sum + score, 0) / Math.max(1, pairScores.length))
  const recommendedTarget = [...memories].sort((a, b) => {
    const runDelta = b.runIds.length - a.runIds.length
    if (runDelta !== 0) return runDelta
    return b.updatedAt.localeCompare(a.updatedAt)
  })[0]

  return {
    memories,
    similarity,
    duplicateLikely: similarity >= 45 || hasStrongSemanticOverlap(memories),
    recommendedTargetKey: recommendedTarget?.key,
    reasons: buildComparisonReasons(memories, similarity),
    mergeRisks: buildMergeRisks(memories),
  }
}

export async function mergeProductMemories(input: {
  targetKey: string
  sourceKeys: string[]
}): Promise<ProductMemory> {
  await ensureMemoryDir()

  const target = await readProductMemoryByKey(input.targetKey)
  const sources = await Promise.all(input.sourceKeys.filter((key) => key !== input.targetKey).map((key) => readProductMemoryByKey(key)))
  const now = new Date().toISOString()
  const merged: ProductMemory = {
    ...target,
    aliases: uniqueStrings([target.displayName, ...target.aliases, ...sources.flatMap((memory) => [memory.displayName, ...memory.aliases])]),
    sourceLabels: uniqueStrings([...target.sourceLabels, ...sources.flatMap((memory) => memory.sourceLabels)]),
    runIds: uniqueStrings([...target.runIds, ...sources.flatMap((memory) => memory.runIds)]),
    latestRunId: [target, ...sources].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].latestRunId,
    summary: pickMergedSummary(target, sources),
    artifacts: {
      prdTitle: target.artifacts.prdTitle,
      mvpMustHave: uniqueStrings([...target.artifacts.mvpMustHave, ...sources.flatMap((memory) => memory.artifacts.mvpMustHave)]).slice(0, 12),
      mvpShouldHave: uniqueStrings([...target.artifacts.mvpShouldHave, ...sources.flatMap((memory) => memory.artifacts.mvpShouldHave)]).slice(0, 12),
      topRisks: uniqueStrings([...target.artifacts.topRisks, ...sources.flatMap((memory) => memory.artifacts.topRisks)]).slice(0, 8),
      openQuestions: uniqueStrings([...target.artifacts.openQuestions, ...sources.flatMap((memory) => memory.artifacts.openQuestions)]).slice(0, 12),
    },
    decisions: mergeDecisions(target.decisions, sources.flatMap((memory) => memory.decisions)),
    evidence: mergeEvidence(target.evidence, sources.flatMap((memory) => memory.evidence)),
    updatedAt: now,
  }

  await writeFile(getMemoryPath(target.key), JSON.stringify(merged, null, 2), "utf8")

  for (const source of sources) {
    await unlink(getMemoryPath(source.key)).catch(() => undefined)
  }

  return merged
}

export async function searchProductMemoryContext(input: {
  query: string
  projectQuery?: string
  limit?: number
}): Promise<ProductMemoryContextSearchResult[]> {
  const projectMatches = input.projectQuery
    ? await searchProductMemories(input.projectQuery, input.limit ?? 5)
    : await searchProductMemories(input.query, input.limit ?? 5)
  const memories = projectMatches.length > 0 ? projectMatches.map((match) => match.memory) : await listProductMemories()
  const query = input.query

  const results = await Promise.all(
    memories.slice(0, input.limit ?? 5).map(async (memory) => {
      const ranked = await rankMemoryContext(query, memory)
      return {
        memory: {
          key: memory.key,
          displayName: memory.displayName,
          aliases: memory.aliases,
          sourceLabels: memory.sourceLabels,
          latestRunId: memory.latestRunId,
          summary: memory.summary,
          artifacts: memory.artifacts,
        },
        decisions: ranked.decisions,
        evidence: ranked.evidence,
      }
    })
  )

  return results
}

export function deriveProjectKey(savedRun: SavedAgentRun) {
  const basis = savedRun.sourceLabel?.trim() || savedRun.run.result.productName || savedRun.run.result.prd.title || savedRun.id
  const hash = createHash("sha1").update(normalizeMemoryText(basis)).digest("hex").slice(0, 16)

  return `project_${hash}`
}

function buildDecisions(savedRun: SavedAgentRun): ProductMemoryDecision[] {
  const runId = savedRun.id
  const updatedAt = savedRun.updatedAt || savedRun.createdAt
  const result = savedRun.run.result
  const taskDecisions = result.engineeringTasks.map((task) => taskToDecision(task, runId, updatedAt))
  const riceDecisions = result.ricePrioritization.map((item) => riceToDecision(item, runId, updatedAt))
  const clusterDecisions = result.demandClusters.map((cluster) => clusterToDecision(cluster, runId, updatedAt))

  return [...taskDecisions, ...riceDecisions, ...clusterDecisions]
}

function taskToDecision(task: EngineeringTask, runId: string, updatedAt: string): ProductMemoryDecision {
  return {
    kind: "task",
    title: task.title,
    description: task.description,
    priority: task.priority,
    rationale: task.acceptanceCriteria.join("；"),
    evidenceFeedbackIds: [],
    runId,
    updatedAt,
  }
}

function riceToDecision(item: RiceItem, runId: string, updatedAt: string): ProductMemoryDecision {
  return {
    kind: "rice",
    title: item.feature,
    description: item.rationale,
    priority: item.priority,
    rationale: `RICE ${item.score}：Reach ${item.reach} × Impact ${item.impact} × Confidence ${item.confidence} / Effort ${item.effort}`,
    evidenceFeedbackIds: item.evidenceFeedbackIds ?? [],
    runId,
    updatedAt,
  }
}

function clusterToDecision(cluster: DemandCluster, runId: string, updatedAt: string): ProductMemoryDecision {
  return {
    kind: "cluster",
    title: cluster.title,
    description: `${cluster.userPain} ${cluster.productOpportunity}`,
    rationale: cluster.confidenceReason || `频次 ${cluster.frequency}，置信度 ${cluster.confidence}`,
    evidenceFeedbackIds: cluster.evidenceFeedbackIds,
    runId,
    updatedAt,
  }
}

function buildEvidence(savedRun: SavedAgentRun): ProductMemoryEvidence[] {
  return savedRun.feedbackItems.slice(0, 200).map((item) => ({
    id: item.id,
    userType: item.userType,
    source: item.source,
    content: item.content,
    createdAt: item.createdAt,
    runId: savedRun.id,
  }))
}

function mergeDecisions(existing: ProductMemoryDecision[], incoming: ProductMemoryDecision[]) {
  const merged = new Map<string, ProductMemoryDecision>()

  for (const item of [...existing, ...incoming]) {
    merged.set(`${item.kind}:${normalizeMemoryText(item.title)}:${item.runId}`, item)
  }

  return Array.from(merged.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 300)
}

function mergeEvidence(existing: ProductMemoryEvidence[], incoming: ProductMemoryEvidence[]) {
  const merged = new Map<string, ProductMemoryEvidence>()

  for (const item of [...existing, ...incoming]) {
    merged.set(`${item.runId}:${item.id}`, item)
  }

  return Array.from(merged.values()).slice(-300)
}

function splitSourceLabel(sourceLabel: string | undefined) {
  if (!sourceLabel) return []

  return sourceLabel
    .split(/[：:/\\|]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatScopeItem(item: { feature: string; reason?: string } | string) {
  if (typeof item === "string") return item
  return item.reason ? `${item.feature}：${item.reason}` : item.feature
}

function inferMemorySearchQuery(query: string) {
  return query
    .replace(/^(帮我|请|麻烦)?\s*(打开|切换到|查看|搜索|查找|读取|列出|看看)\s*/i, "")
    .replace(/(项目|产品|上下文|记忆|历史|资料|相关信息|当前)+/gi, " ")
    .trim()
}

function scoreMemoryMatch(query: string, candidate: string) {
  const normalizedQuery = normalizeMemoryText(query)
  const normalizedCandidate = normalizeMemoryText(candidate)

  if (!normalizedQuery || !normalizedCandidate) return 0
  if (normalizedCandidate.includes(normalizedQuery)) return normalizedQuery.length * 10 + 60
  if (normalizedQuery.includes(normalizedCandidate)) return normalizedCandidate.length * 6 + 30

  const queryTokens = splitSearchTokens(normalizedQuery)
  const tokenScore = queryTokens.reduce((score, token) => score + (token.length > 1 && normalizedCandidate.includes(token) ? token.length * 5 : 0), 0)
  const charScore = Array.from(new Set(normalizedQuery.split(""))).reduce((score, char) => score + (normalizedCandidate.includes(char) ? 1 : 0), 0)

  return tokenScore + charScore
}

function scoreDuplicateMemory(a: ProductMemory, b: ProductMemory) {
  const nameScore = Math.max(
    scoreMemoryMatch(a.displayName, b.displayName),
    ...a.aliases.map((alias) => scoreMemoryMatch(alias, b.displayName)),
    ...b.aliases.map((alias) => scoreMemoryMatch(alias, a.displayName)),
  )
  const sourceScore = Math.max(...a.sourceLabels.flatMap((source) => b.sourceLabels.map((target) => scoreMemoryMatch(source, target))), 0)
  const contentScore = scoreMemoryMatch(`${a.summary} ${a.artifacts.prdTitle}`, `${b.summary} ${b.artifacts.prdTitle}`)

  return Math.min(100, Math.round(nameScore * 0.5 + sourceScore * 0.2 + contentScore * 0.3))
}

function hasStrongSemanticOverlap(memories: ProductMemory[]) {
  const texts = memories.map((memory) =>
    normalizeMemoryText([
      memory.displayName,
      ...memory.aliases,
      memory.summary,
      memory.artifacts.prdTitle,
      ...memory.artifacts.mvpMustHave,
      ...memory.artifacts.mvpShouldHave,
      ...memory.decisions.slice(0, 20).map((decision) => `${decision.title} ${decision.description}`),
    ].join(" ")),
  )

  const tokenSets = texts.map((text) => new Set(splitSearchTokens(text).filter((token) => token.length >= 2)))
  if (tokenSets.length < 2) return false

  const shared = Array.from(tokenSets[0]).filter((token) => tokenSets.every((set) => set.has(token)))
  return shared.length >= 3
}

function buildComparisonReasons(memories: ProductMemory[], similarity: number) {
  const sharedAliases = findSharedTokens(memories.flatMap((memory) => [memory.displayName, ...memory.aliases]))
  const sharedSources = findSharedTokens(memories.flatMap((memory) => memory.sourceLabels))
  const sharedMvp = findSharedTokens(memories.flatMap((memory) => [...memory.artifacts.mvpMustHave, ...memory.artifacts.mvpShouldHave]))
  const reasons = [`综合相似度 ${similarity}。`]

  if (sharedAliases.length > 0) reasons.push(`名称/别名存在共同语义：${sharedAliases.slice(0, 6).join("、")}。`)
  if (sharedSources.length > 0) reasons.push(`数据来源存在共同语义：${sharedSources.slice(0, 6).join("、")}。`)
  if (sharedMvp.length > 0) reasons.push(`MVP 或需求内容存在共同语义：${sharedMvp.slice(0, 8).join("、")}。`)
  if (reasons.length === 1) reasons.push("项目名或来源差异较大，需要用户确认它们是否确实属于同一产品。")

  return reasons
}

function buildMergeRisks(memories: ProductMemory[]) {
  const productNames = uniqueStrings(memories.map((memory) => memory.displayName))
  const sourceLabels = uniqueStrings(memories.flatMap((memory) => memory.sourceLabels))
  const risks = []

  if (productNames.length > 1) risks.push(`项目名不同：${productNames.join("、")}，合并前需要确认是否只是命名差异。`)
  if (sourceLabels.length > 1) risks.push(`数据来源不同：${sourceLabels.slice(0, 8).join("、")}，合并后来源会合并保留。`)
  if (memories.some((memory) => memory.artifacts.openQuestions.length > 0)) risks.push("开放问题会合并，可能包含不同阶段遗留的问题。")

  return risks.length > 0 ? risks : ["未发现明显合并风险，但仍建议人工确认后写入。"]
}

function findSharedTokens(values: string[]) {
  const tokens = values.flatMap((value) => splitSearchTokens(normalizeMemoryText(value))).filter((token) => token.length >= 2)
  const counts = new Map<string, number>()

  for (const token of Array.from(new Set(tokens))) {
    counts.set(token, values.filter((value) => normalizeMemoryText(value).includes(token)).length)
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([token]) => token)
}

function pickDuplicateGroupTitle(memories: ProductMemory[]) {
  const names = memories.map((memory) => memory.displayName).filter(Boolean)
  const shortest = names.sort((a, b) => a.length - b.length)[0]
  return shortest || "未命名项目"
}

function buildDuplicateReason(memories: ProductMemory[], score: number) {
  const sourceLabels = uniqueStrings(memories.flatMap((memory) => memory.sourceLabels)).slice(0, 4)
  return `名称、来源或摘要高度相似，匹配分 ${score}。来源：${sourceLabels.join("、") || "未知"}`
}

function compactMemoryForDuplicate(memory: ProductMemory): ProductMemoryDuplicateGroup["memories"][number] {
  return {
    key: memory.key,
    displayName: memory.displayName,
    aliases: memory.aliases.slice(0, 6),
    sourceLabels: memory.sourceLabels.slice(0, 6),
    latestRunId: memory.latestRunId,
    summary: memory.summary,
    updatedAt: memory.updatedAt,
  }
}

function pickMergedSummary(target: ProductMemory, sources: ProductMemory[]) {
  const newest = [target, ...sources].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return newest.summary || target.summary
}

function splitSearchTokens(value: string) {
  return value
    .split(/[，。！？、,.!?;；:：/\\|()[\]{}<>"'`~\-_+=\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function normalizeMemoryText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "")
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())))
}

function sanitizeMemoryKey(key: string) {
  const safeKey = key.trim()

  if (!/^project_[a-f0-9]{16}$/.test(safeKey)) {
    throw new Error("项目记忆 key 不合法。")
  }

  return safeKey
}

async function ensureMemoryDir() {
  await mkdir(memoryDir, {
    recursive: true,
  })
}

async function backfillProductMemoriesFromRuns() {
  const runFiles = await readdir(runsDir).catch(() => [])
  if (runFiles.length === 0) return

  const memoryFiles = await readdir(memoryDir).catch(() => [])
  const knownRunIds = await collectKnownRunIds(memoryFiles)

  for (const file of runFiles.filter((item) => item.endsWith(".json"))) {
    const runId = file.replace(/\.json$/, "")
    if (knownRunIds.has(runId)) continue

    try {
      const raw = await readFile(path.join(runsDir, file), "utf8")
      await upsertProductMemoryFromSavedRun(JSON.parse(raw) as SavedAgentRun)
    } catch {
      // A malformed historical run should not prevent memory search from working.
    }
  }
}

async function collectKnownRunIds(memoryFiles: string[]) {
  const knownRunIds = new Set<string>()

  for (const file of memoryFiles.filter((item) => item.endsWith(".json"))) {
    try {
      const raw = await readFile(path.join(memoryDir, file), "utf8")
      const memory = JSON.parse(raw) as ProductMemory
      for (const runId of memory.runIds) {
        knownRunIds.add(runId)
      }
    } catch {
      // Ignore corrupted memory files; normal reads will skip them too.
    }
  }

  return knownRunIds
}

function getMemoryPath(key: string) {
  return path.join(memoryDir, `${key}.json`)
}
