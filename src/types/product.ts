import type { TraceEvent } from "./agent"

export type FeedbackItem = {
  id: string
  userType?: string
  source?: string
  content: string
  createdAt?: string
}

export type BusinessMetric = {
  metric: string
  value: string
  period?: string
  segment?: string
  note?: string
}

export type BusinessContext = {
  businessGoal?: string
  northStarMetric?: string
  metrics?: BusinessMetric[]
  metricsSourceLabel?: string
}

export type DemandCluster = {
  title: string
  description: string
  evidenceFeedbackIds: string[]
  evidenceQuotes?: {
    feedbackId: string
    quote: string
  }[]
  frequency: number
  userPain: string
  productOpportunity: string
  confidence: number
  confidenceReason?: string
}

export type MvpScope = {
  mustHave: MvpScopeItem[]
  shouldHave: MvpScopeItem[]
  outOfScope: {
    feature: string
    reason: string
    evidenceFeedbackIds?: string[]
  }[]
}

export type MvpScopeItem = {
  feature: string
  reason: string
  evidenceFeedbackIds?: string[]
}

export type RiceItem = {
  feature: string
  reach: number
  impact: number
  confidence: number
  effort: number
  score: number
  priority: "P0" | "P1" | "P2" | "Out"
  rationale: string
  formula?: string
  evidenceFeedbackIds?: string[]
}

export type PrdDraft = {
  title: string
  background: string
  targetUsers: string[]
  problemStatement: string
  goals: string[]
  nonGoals: string[]
  userStories: string[]
  functionalRequirements: string[]
  successMetrics: string[]
  trackingPlan: {
    eventName: string
    trigger: string
    properties: string[]
    purpose: string
  }[]
}

export type EngineeringTask = {
  type: "Epic" | "Story" | "Task"
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: "P0" | "P1" | "P2"
  dependsOn?: string[]
}

export type RiskItem = {
  risk: string
  level: "low" | "medium" | "high"
  mitigation: string
}

export type TapdCreatedItem = {
  id: string
  title: string
  url: string
}

export type TapdCreatedWorkItems = {
  story: TapdCreatedItem
  tasks: TapdCreatedItem[]
}

export type AgentResult = {
  productName: string
  summary: string
  demandClusters: DemandCluster[]
  mvpScope: MvpScope
  ricePrioritization: RiceItem[]
  prd: PrdDraft
  engineeringTasks: EngineeringTask[]
  feishuReviewMessage: string
  prdDocumentUrl?: string
  tapdWorkItems?: TapdCreatedWorkItems
  risks: RiskItem[]
  openQuestions: string[]
  trace: TraceEvent[]
}

export type AgentRunMode = "mock" | "llm"

export type AgentRun = {
  runId?: string
  result: AgentResult
  mode: AgentRunMode
  isMock: boolean
  message: string
  generatedAt: string
}

export type SavedAgentRun = {
  id: string
  sourceLabel?: string
  feedbackItems: FeedbackItem[]
  businessContext?: BusinessContext
  run: AgentRun
  createdAt: string
  updatedAt: string
}

export type SavedAgentRunSummary = {
  id: string
  productName: string
  summary: string
  mode: AgentRunMode
  isMock: boolean
  feedbackCount: number
  clusterCount: number
  taskCount: number
  sourceLabel?: string
  createdAt: string
  updatedAt: string
}
