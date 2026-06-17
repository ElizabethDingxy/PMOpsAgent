import type {
  DeliveryAgentOutput,
  PrdAgentOutput,
  ResearchAgentOutput,
  StrategyAgentOutput,
  CriticAgentOutput,
} from "@/lib/agent/multiAgentTypes"
import type {
  AgentResult,
  DemandCluster,
  EngineeringTask,
  MvpScope,
  PrdDraft,
  RiceItem,
  RiskItem,
} from "@/types/product"
import type { TraceEvent } from "@/types/agent"

export class AgentResultValidationError extends Error {
  issues: string[]

  constructor(issues: string[]) {
    super(`AgentResult 校验失败：${issues.join("；")}`)
    this.name = "AgentResultValidationError"
    this.issues = issues
  }
}

export function parseAgentResultJson(jsonText: string): AgentResult {
  const cleanedText = stripJsonFence(jsonText)
  let parsed: unknown

  try {
    parsed = JSON.parse(cleanedText)
  } catch {
    throw new AgentResultValidationError(["模型返回内容不是合法 JSON"])
  }

  return assertAgentResult(parsed)
}

export function parseResearchAgentJson(jsonText: string): ResearchAgentOutput {
  const parsed = parseJsonObject(jsonText)
  return assertResearchAgentOutput(parsed)
}

export function parseStrategyAgentJson(jsonText: string): StrategyAgentOutput {
  const parsed = parseJsonObject(jsonText)
  return assertStrategyAgentOutput(parsed)
}

export function parsePrdAgentJson(jsonText: string): PrdAgentOutput {
  const parsed = parseJsonObject(jsonText)
  return assertPrdAgentOutput(parsed)
}

export function parseDeliveryAgentJson(jsonText: string): DeliveryAgentOutput {
  const parsed = parseJsonObject(jsonText)
  return assertDeliveryAgentOutput(parsed)
}

export function assertAgentResult(value: unknown): AgentResult {
  const issues = validateAgentResult(value)

  if (issues.length > 0) {
    throw new AgentResultValidationError(issues)
  }

  return value as AgentResult
}

export function assertResearchAgentOutput(value: unknown): ResearchAgentOutput {
  const issues = validateResearchAgentOutput(value)

  if (issues.length > 0) {
    throw new AgentResultValidationError(issues)
  }

  return value as ResearchAgentOutput
}

export function assertStrategyAgentOutput(value: unknown): StrategyAgentOutput {
  const issues = validateStrategyAgentOutput(value)

  if (issues.length > 0) {
    throw new AgentResultValidationError(issues)
  }

  return value as StrategyAgentOutput
}

export function assertPrdAgentOutput(value: unknown): PrdAgentOutput {
  const issues = validatePrdAgentOutput(value)

  if (issues.length > 0) {
    throw new AgentResultValidationError(issues)
  }

  return value as PrdAgentOutput
}

export function assertDeliveryAgentOutput(value: unknown): DeliveryAgentOutput {
  const issues = validateDeliveryAgentOutput(value)

  if (issues.length > 0) {
    throw new AgentResultValidationError(issues)
  }

  return value as DeliveryAgentOutput
}

export function validateAgentResult(value: unknown): string[] {
  const issues: string[] = []
  const result = asRecord(value)

  if (!result) {
    return ["结果必须是对象"]
  }

  requireString(result, "productName", issues)
  requireString(result, "summary", issues)
  requireArray(result, "demandClusters", issues, validateDemandCluster)
  validateMvpScope(result.mvpScope, "mvpScope", issues)
  requireArray(result, "ricePrioritization", issues, validateRiceItem)
  validatePrdDraft(result.prd, "prd", issues)
  requireArray(result, "engineeringTasks", issues, validateEngineeringTask)
  requireString(result, "feishuReviewMessage", issues)
  requireArray(result, "risks", issues, validateRiskItem)
  requireStringArray(result, "openQuestions", issues)
  requireArray(result, "trace", issues, validateTraceEvent)

  return issues
}

export function validateResearchAgentOutput(value: unknown): string[] {
  const issues: string[] = []
  const result = asRecord(value)

  if (!result) {
    return ["Research Agent 输出必须是对象"]
  }

  requireString(result, "productName", issues)
  requireString(result, "summary", issues)
  requireArray(result, "demandClusters", issues, validateDemandCluster)
  requireArray(result, "risks", issues, validateRiskItem)
  requireStringArray(result, "openQuestions", issues)

  return issues
}

export function validateStrategyAgentOutput(value: unknown): string[] {
  const issues: string[] = []
  const result = asRecord(value)

  if (!result) {
    return ["Strategy Agent 输出必须是对象"]
  }

  validateMvpScope(result.mvpScope, "mvpScope", issues)
  requireArray(result, "ricePrioritization", issues, validateRiceItem)

  return issues
}

export function validatePrdAgentOutput(value: unknown): string[] {
  const issues: string[] = []
  const result = asRecord(value)

  if (!result) {
    return ["PRD Agent 输出必须是对象"]
  }

  validatePrdDraft(result.prd, "prd", issues)

  return issues
}

export function validateDeliveryAgentOutput(value: unknown): string[] {
  const issues: string[] = []
  const result = asRecord(value)

  if (!result) {
    return ["Delivery Agent 输出必须是对象"]
  }

  requireArray(result, "engineeringTasks", issues, validateEngineeringTask)
  requireString(result, "feishuReviewMessage", issues)

  return issues
}

function parseJsonObject(jsonText: string): unknown {
  const cleanedText = stripJsonFence(jsonText)

  try {
    return JSON.parse(cleanedText)
  } catch {
    throw new AgentResultValidationError(["模型返回内容不是合法 JSON"])
  }
}

function validateDemandCluster(value: unknown, path: string, issues: string[]) {
  const item = requireObject(value, path, issues) as Partial<DemandCluster> | null
  if (!item) return

  requireString(item, "title", issues, path)
  requireString(item, "description", issues, path)
  requireStringArray(item, "evidenceFeedbackIds", issues, path)
  if (item.evidenceQuotes !== undefined) {
    requireArray(item, "evidenceQuotes", issues, (quote, quotePath, quoteIssues) => {
      const record = requireObject(quote, quotePath, quoteIssues)
      if (!record) return

      requireString(record, "feedbackId", quoteIssues, quotePath)
      requireString(record, "quote", quoteIssues, quotePath)
    }, path)
  }
  requireNumber(item, "frequency", issues, path)
  requireString(item, "userPain", issues, path)
  requireString(item, "productOpportunity", issues, path)
  requireNumber(item, "confidence", issues, path)
  if (item.confidenceReason !== undefined) {
    requireString(item, "confidenceReason", issues, path)
  }
}

function validateMvpScope(value: unknown, path: string, issues: string[]) {
  const scope = requireObject(value, path, issues) as Partial<MvpScope> | null
  if (!scope) return

  requireArray(scope, "mustHave", issues, validateMvpScopeItem, path)
  requireArray(scope, "shouldHave", issues, validateMvpScopeItem, path)
  requireArray(scope, "outOfScope", issues, (item, itemPath, itemIssues) => {
    const record = requireObject(item, itemPath, itemIssues)
    if (!record) return

    requireString(record, "feature", itemIssues, itemPath)
    requireString(record, "reason", itemIssues, itemPath)
    if (record.evidenceFeedbackIds !== undefined) {
      requireStringArray(record, "evidenceFeedbackIds", itemIssues, itemPath)
    }
  }, path)
}

function validateMvpScopeItem(value: unknown, path: string, issues: string[]) {
  if (typeof value === "string" && value.trim()) return

  const record = requireObject(value, path, issues)
  if (!record) return

  requireString(record, "feature", issues, path)
  requireString(record, "reason", issues, path)
  if (record.evidenceFeedbackIds !== undefined) {
    requireStringArray(record, "evidenceFeedbackIds", issues, path)
  }
}

function validateRiceItem(value: unknown, path: string, issues: string[]) {
  const item = requireObject(value, path, issues) as Partial<RiceItem> | null
  if (!item) return

  requireString(item, "feature", issues, path)
  requireNumber(item, "reach", issues, path)
  requireNumber(item, "impact", issues, path)
  requireNumber(item, "confidence", issues, path)
  requireNumber(item, "effort", issues, path)
  requireNumber(item, "score", issues, path)
  requireEnum(item, "priority", ["P0", "P1", "P2", "Out"], issues, path)
  requireString(item, "rationale", issues, path)
  if (item.formula !== undefined) {
    requireString(item, "formula", issues, path)
  }
  if (item.evidenceFeedbackIds !== undefined) {
    requireStringArray(item, "evidenceFeedbackIds", issues, path)
  }
}

function validatePrdDraft(value: unknown, path: string, issues: string[]) {
  const prd = requireObject(value, path, issues) as Partial<PrdDraft> | null
  if (!prd) return

  requireString(prd, "title", issues, path)
  requireString(prd, "background", issues, path)
  requireStringArray(prd, "targetUsers", issues, path)
  requireString(prd, "problemStatement", issues, path)
  requireStringArray(prd, "goals", issues, path)
  requireStringArray(prd, "nonGoals", issues, path)
  requireStringArray(prd, "userStories", issues, path)
  requireStringArray(prd, "functionalRequirements", issues, path)
  requireStringArray(prd, "successMetrics", issues, path)
  requireArray(prd, "trackingPlan", issues, (item, itemPath, itemIssues) => {
    const record = requireObject(item, itemPath, itemIssues)
    if (!record) return

    requireString(record, "eventName", itemIssues, itemPath)
    requireString(record, "trigger", itemIssues, itemPath)
    requireStringArray(record, "properties", itemIssues, itemPath)
    requireString(record, "purpose", itemIssues, itemPath)
  }, path)
}

function validateEngineeringTask(value: unknown, path: string, issues: string[]) {
  const task = requireObject(value, path, issues) as Partial<EngineeringTask> | null
  if (!task) return

  requireEnum(task, "type", ["Epic", "Story", "Task"], issues, path)
  requireString(task, "title", issues, path)
  requireString(task, "description", issues, path)
  requireStringArray(task, "acceptanceCriteria", issues, path)
  requireEnum(task, "priority", ["P0", "P1", "P2"], issues, path)

  if (task.dependsOn !== undefined && !isStringArray(task.dependsOn)) {
    issues.push(`${path}.dependsOn 必须是字符串数组`)
  }
}

function validateRiskItem(value: unknown, path: string, issues: string[]) {
  const risk = requireObject(value, path, issues) as Partial<RiskItem> | null
  if (!risk) return

  requireString(risk, "risk", issues, path)
  requireEnum(risk, "level", ["low", "medium", "high"], issues, path)
  requireString(risk, "mitigation", issues, path)
}

function validateTraceEvent(value: unknown, path: string, issues: string[]) {
  const event = requireObject(value, path, issues) as Partial<TraceEvent> | null
  if (!event) return

  requireString(event, "id", issues, path)
  requireString(event, "step", issues, path)
  requireEnum(event, "status", ["pending", "running", "success", "failed", "waiting_approval"], issues, path)
  requireString(event, "message", issues, path)
  requireString(event, "timestamp", issues, path)

  if (event.metadata !== undefined && !asRecord(event.metadata)) {
    issues.push(`${path}.metadata 必须是对象`)
  }
}

function stripJsonFence(text: string) {
  const trimmed = text.trim()
  const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fencedJson?.[1]?.trim() ?? trimmed
}

function requireObject(value: unknown, path: string, issues: string[]) {
  const record = asRecord(value)
  if (!record) {
    issues.push(`${path} 必须是对象`)
  }
  return record
}

function requireString(record: Record<string, unknown>, key: string, issues: string[], path = "") {
  const fieldPath = path ? `${path}.${key}` : key
  if (typeof record[key] !== "string" || record[key] === "") {
    issues.push(`${fieldPath} 必须是非空字符串`)
  }
}

function requireNumber(record: Record<string, unknown>, key: string, issues: string[], path = "") {
  const fieldPath = path ? `${path}.${key}` : key
  if (typeof record[key] !== "number" || Number.isNaN(record[key])) {
    issues.push(`${fieldPath} 必须是数字`)
  }
}

function requireEnum(
  record: Record<string, unknown>,
  key: string,
  allowedValues: string[],
  issues: string[],
  path = "",
) {
  const fieldPath = path ? `${path}.${key}` : key
  if (typeof record[key] !== "string" || !allowedValues.includes(record[key])) {
    issues.push(`${fieldPath} 必须是 ${allowedValues.join(" | ")} 之一`)
  }
}

function requireStringArray(record: Record<string, unknown>, key: string, issues: string[], path = "") {
  const fieldPath = path ? `${path}.${key}` : key
  if (!isStringArray(record[key])) {
    issues.push(`${fieldPath} 必须是字符串数组`)
  }
}

function requireArray(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
  validateItem: (item: unknown, path: string, issues: string[]) => void,
  path = "",
) {
  const fieldPath = path ? `${path}.${key}` : key
  const value = record[key]

  if (!Array.isArray(value)) {
    issues.push(`${fieldPath} 必须是数组`)
    return
  }

  value.forEach((item, index) => {
    validateItem(item, `${fieldPath}[${index}]`, issues)
  })
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

export function parseCriticAgentJson(jsonText: string): CriticAgentOutput {
  const parsed = parseJsonObject(jsonText)
  return assertCriticAgentOutput(parsed)
}

export function assertCriticAgentOutput(value: unknown): CriticAgentOutput {
  const issues = validateCriticAgentOutput(value)

  if (issues.length > 0) {
    throw new AgentResultValidationError(issues)
  }

  return value as CriticAgentOutput
}

export function validateCriticAgentOutput(value: unknown): string[] {
  const issues: string[] = []
  const result = asRecord(value)

  if (!result) {
    return ["Critic Agent 输出必须是对象"]
  }

  if (typeof result.passed !== "boolean") {
    issues.push("passed 必须是布尔值")
  }
  if (result.feedback !== undefined && typeof result.feedback !== "string") {
    issues.push("feedback 必须是字符串")
  }

  const checks = asRecord(result.checks)
  if (!checks) {
    issues.push("checks 必须是对象")
  } else {
    if (typeof checks.mustHaveCovered !== "boolean") {
      issues.push("checks.mustHaveCovered 必须是布尔值")
    }
    if (typeof checks.outOfScopeExcluded !== "boolean") {
      issues.push("checks.outOfScopeExcluded 必须是布尔值")
    }
    if (typeof checks.dependenciesLogical !== "boolean") {
      issues.push("checks.dependenciesLogical 必须是布尔值")
    }
    if (typeof checks.risksAddressed !== "boolean") {
      issues.push("checks.risksAddressed 必须是布尔值")
    }
  }

  return issues
}

