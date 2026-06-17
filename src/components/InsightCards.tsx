import type { DemandCluster, MvpScope, MvpScopeItem, RiceItem } from "@/types/product"
import { AlertTriangle, Award, CheckCircle, HelpCircle, Info, Target, Zap } from "lucide-react"

type InsightCardsProps = {
  clusters: DemandCluster[]
  mvpScope: MvpScope
  riceItems: RiceItem[]
}

export function InsightCards({ clusters, mvpScope, riceItems }: InsightCardsProps) {
  return (
    <section className="space-y-6">
      {/* 1. Demand Clusters */}
      <div className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Target className="text-indigo-400" size={18} />
            <h2 className="text-md font-bold text-slate-100 tracking-tight">聚类需求主题 / Demand Clusters</h2>
          </div>
          <span className="rounded-full bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 text-xs font-semibold text-indigo-400">
            {clusters.length} 个核心主题
          </span>
        </div>

        <div className="grid gap-4 max-h-[500px] overflow-y-auto pr-1">
          {clusters.map((cluster) => {
            const isLowConfidence = cluster.confidence < 0.7
            const confidencePercent = Math.round(cluster.confidence * 100)

            return (
              <article
                key={cluster.title}
                className={`rounded-xl border p-5 transition-all ${
                  isLowConfidence
                    ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
                    : "border-slate-800 bg-[#121826]/30 hover:border-slate-700/60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-200">{cluster.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{cluster.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <span className="rounded-full bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-0.5 text-xs font-bold text-indigo-400">
                      频次：{cluster.frequency} 次
                    </span>
                    {isLowConfidence ? (
                      <span className="rounded-full bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 text-xs font-bold text-amber-400 flex items-center gap-1">
                        <AlertTriangle size={11} /> 低置信度
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Evidence feedback IDs */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {cluster.evidenceFeedbackIds.map((id) => (
                    <span key={id} className="rounded bg-[#0d101a] border border-slate-800/80 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-500">
                      {id}
                    </span>
                  ))}
                </div>

                {/* Quotes */}
                {cluster.evidenceQuotes?.length ? (
                  <div className="mb-4 space-y-2 rounded-lg bg-[#0c0f18]/60 border border-slate-850 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Info size={12} className="text-indigo-400" /> 证据原文摘录
                    </p>
                    {cluster.evidenceQuotes.slice(0, 3).map((quote) => (
                      <blockquote
                        key={`${cluster.title}-${quote.feedbackId}`}
                        className="text-xs leading-relaxed text-slate-400 border-l border-slate-700 pl-2.5"
                      >
                        <span className="font-mono font-semibold text-indigo-400">{quote.feedbackId}</span>: “{quote.quote}”
                      </blockquote>
                    ))}
                  </div>
                ) : null}

                {/* Pain and opportunity */}
                <dl className="grid gap-4 text-xs sm:grid-cols-2 border-t border-slate-850 pt-3">
                  <div className="rounded-lg bg-slate-900/40 p-3 border border-slate-850">
                    <dt className="font-bold text-slate-400 flex items-center gap-1 mb-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span> 用户痛点
                    </dt>
                    <dd className="leading-relaxed text-slate-300">{cluster.userPain}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-900/40 p-3 border border-slate-850">
                    <dt className="font-bold text-slate-400 flex items-center gap-1 mb-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> 产品机会
                    </dt>
                    <dd className="leading-relaxed text-slate-300">{cluster.productOpportunity}</dd>
                  </div>
                </dl>

                {/* Confidence Bar */}
                <div className="mt-4 flex items-center gap-3 border-t border-slate-850 pt-3.5">
                  <span className="text-[11px] font-bold text-slate-400">分析置信度</span>
                  <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isLowConfidence ? "bg-gradient-to-r from-amber-500 to-yellow-400" : "bg-gradient-to-r from-indigo-500 to-emerald-400"
                      }`}
                      style={{ width: `${confidencePercent}%` }}
                    ></div>
                  </div>
                  <span className={`text-xs font-mono font-bold ${isLowConfidence ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {confidencePercent}%
                  </span>
                  {cluster.confidenceReason ? (
                    <span className="text-[10px] text-slate-500 truncate max-w-[50%]">({cluster.confidenceReason})</span>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {/* 2. MVP Scope */}
      <div className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-4">
          <Zap className="text-emerald-400" size={18} />
          <h2 className="text-md font-bold text-slate-100 tracking-tight">产品 MVP 范围划分 / Scope Configuration</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ScopeColumn title="Must Have / 必做 (P0)" items={mvpScope.mustHave} tone="emerald" icon={<CheckCircle size={14} className="text-emerald-400" />} />
          <ScopeColumn title="Should Have / 可选 (P1)" items={mvpScope.shouldHave} tone="cyan" icon={<HelpCircle size={14} className="text-cyan-400" />} />
          
          <div className="rounded-xl bg-[#121826]/30 border border-slate-850 p-4 hover:border-slate-800 transition-all">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
              <AlertTriangle size={14} className="text-rose-400" />
              <h3 className="text-xs font-bold tracking-tight text-rose-350">Out of Scope / 暂不做</h3>
            </div>
            <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
              {mvpScope.outOfScope.map((item) => (
                <div key={item.feature} className="border-b border-slate-800/50 pb-3 last:border-0 last:pb-0">
                  <p className="text-xs font-bold text-slate-200">{item.feature}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-450">{item.reason}</p>
                  {item.evidenceFeedbackIds?.length ? (
                    <p className="mt-1.5 text-[9px] font-mono text-slate-500">
                      反馈依据：{item.evidenceFeedbackIds.join(", ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. RICE Prioritization */}
      <div className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-4">
          <Award className="text-purple-400" size={18} />
          <h2 className="text-md font-bold text-slate-100 tracking-tight">RICE 优先级决策矩阵 / Prioritization</h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-850 bg-[#121826]/20">
          <table className="min-w-full divide-y divide-slate-850">
            <thead>
              <tr className="bg-slate-900/60 text-[10px] font-bold uppercase tracking-wider text-slate-450 text-left">
                <th scope="col" className="px-4 py-3">核心功能特性</th>
                <th scope="col" className="px-4 py-3 w-24">排级</th>
                <th scope="col" className="px-4 py-3 w-28 text-center">RICE 评分</th>
                <th scope="col" className="px-4 py-3 w-24 text-center">估时 (人天)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-xs">
              {riceItems.map((item) => {
                const isP0 = item.priority === "P0"
                const isP1 = item.priority === "P1"

                return (
                  <tr key={item.feature} className="hover:bg-[#121826]/40 transition-all">
                    <td className="px-4 py-4">
                      <p className="font-bold text-slate-200">{item.feature}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.rationale}</p>
                      {item.evidenceFeedbackIds?.length ? (
                        <p className="mt-1.5 text-[9px] font-mono text-slate-500">
                          覆盖反馈：{item.evidenceFeedbackIds.join(", ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${
                        isP0 
                          ? "bg-rose-500/10 border border-rose-500/30 text-rose-400" 
                          : isP1 
                          ? "bg-indigo-500/10 border border-indigo-500/30 text-indigo-450" 
                          : "bg-slate-800 border border-slate-700 text-slate-400"
                      }`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center align-top">
                      <span className="font-mono font-bold text-slate-200 text-sm">{item.score}</span>
                      {item.formula ? (
                        <code className="block mt-1 text-[9px] font-mono text-slate-500 bg-[#0d101a] py-0.5 px-1.5 rounded truncate max-w-32 mx-auto">
                          {item.formula}
                        </code>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-center align-top">
                      <span className="font-mono text-slate-300 font-medium text-sm">{item.effort} d</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function ScopeColumn({
  title,
  items,
  tone,
  icon,
}: {
  title: string
  items: Array<MvpScopeItem | string>
  tone: "emerald" | "cyan"
  icon: React.ReactNode
}) {
  const dotColor = tone === "emerald" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
  const borderTone = tone === "emerald" ? "border-emerald-500/20" : "border-cyan-500/20"

  return (
    <div className={`rounded-xl bg-[#121826]/30 border ${borderTone} p-4 hover:border-opacity-50 transition-all`}>
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
        {icon}
        <h3 className="text-xs font-bold tracking-tight text-slate-200">{title}</h3>
      </div>
      <ul className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
        {items.map((item) => (
          <li key={getScopeFeature(item)} className="flex items-start gap-2.5 text-xs">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
            <div className="min-w-0">
              <span className="font-bold text-slate-200">{getScopeFeature(item)}</span>
              {getScopeReason(item) ? (
                <span className="block mt-0.5 text-[11px] leading-relaxed text-slate-450">{getScopeReason(item)}</span>
              ) : null}
              {getScopeEvidence(item).length ? (
                <span className="block mt-1 text-[9px] font-mono text-slate-500">
                  反馈依据：{getScopeEvidence(item).join(", ")}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function getScopeFeature(item: MvpScopeItem | string) {
  return typeof item === "string" ? item : item.feature
}

function getScopeReason(item: MvpScopeItem | string) {
  return typeof item === "string" ? undefined : item.reason
}

function getScopeEvidence(item: MvpScopeItem | string) {
  return typeof item === "string" ? [] : item.evidenceFeedbackIds ?? []
}
