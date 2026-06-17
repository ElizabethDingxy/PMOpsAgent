import type {
  DemandCluster,
  EngineeringTask,
  MvpScope,
  PrdDraft,
  RiceItem,
  RiskItem,
} from "@/types/product"

export type ResearchAgentOutput = {
  productName: string
  summary: string
  demandClusters: DemandCluster[]
  risks: RiskItem[]
  openQuestions: string[]
}

export type StrategyAgentOutput = {
  mvpScope: MvpScope
  ricePrioritization: RiceItem[]
}

export type PrdAgentOutput = {
  prd: PrdDraft
}

export type DeliveryAgentOutput = {
  engineeringTasks: EngineeringTask[]
  feishuReviewMessage: string
}

export type MultiAgentContext = {
  research: ResearchAgentOutput
  strategy: StrategyAgentOutput
  prd: PrdAgentOutput
  delivery: DeliveryAgentOutput
}

export type CriticAgentOutput = {
  passed: boolean
  feedback?: string
  checks: {
    mustHaveCovered: boolean
    outOfScopeExcluded: boolean
    dependenciesLogical: boolean
    risksAddressed: boolean
  }
}

