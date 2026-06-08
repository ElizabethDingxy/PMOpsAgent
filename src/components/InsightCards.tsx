import type { DemandCluster, MvpScope, MvpScopeItem, RiceItem } from "@/types/product"

type InsightCardsProps = {
  clusters: DemandCluster[]
  mvpScope: MvpScope
  riceItems: RiceItem[]
}

export function InsightCards({ clusters, mvpScope, riceItems }: InsightCardsProps) {
  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-base font-semibold text-ink">需求主题</h2>
        <div className="mt-4 max-h-[420px] grid gap-3 overflow-y-auto pr-1">
          {clusters.map((cluster) => {
            const isLowConfidence = cluster.confidence < 0.7

            return (
            <article key={cluster.title} className={`rounded-lg border p-4 ${isLowConfidence ? "border-amber bg-amber/10" : "border-slate-100 bg-slate-50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{cluster.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{cluster.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-pine">
                    频次 {cluster.frequency}
                  </span>
                  {isLowConfidence ? (
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-amber">
                      低置信度
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {cluster.evidenceFeedbackIds.map((id) => (
                  <span key={id} className="rounded-md bg-mist px-2 py-1 text-xs font-medium text-slate-600">
                    {id}
                  </span>
                ))}
              </div>
              {cluster.evidenceQuotes?.length ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500">证据原文</p>
                  {cluster.evidenceQuotes.slice(0, 3).map((quote) => (
                    <blockquote key={`${cluster.title}-${quote.feedbackId}`} className="rounded-md bg-white px-3 py-2 text-sm leading-6 text-slate-600">
                      <span className="font-semibold text-pine">{quote.feedbackId}</span>：{quote.quote}
                    </blockquote>
                  ))}
                </div>
              ) : null}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">用户痛点</dt>
                  <dd className="mt-1 leading-6 text-slate-700">{cluster.userPain}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">产品机会</dt>
                  <dd className="mt-1 leading-6 text-slate-700">{cluster.productOpportunity}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs font-semibold text-pine">
                置信度 {(cluster.confidence * 100).toFixed(0)}%
              </p>
              {cluster.confidenceReason ? (
                <p className="mt-1 text-xs leading-5 text-slate-500">{cluster.confidenceReason}</p>
              ) : null}
            </article>
          )})}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-base font-semibold text-ink">MVP 范围</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ScopeColumn title="必须做" items={mvpScope.mustHave} tone="pine" />
          <ScopeColumn title="可以做" items={mvpScope.shouldHave} tone="amber" />
          <div className="rounded-lg bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-700">暂不做</h3>
            <div className="mt-3 space-y-3">
              {mvpScope.outOfScope.map((item) => (
                <div key={item.feature}>
                  <p className="text-sm font-medium text-ink">{item.feature}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{item.reason}</p>
                  {item.evidenceFeedbackIds?.length ? (
                    <p className="mt-1 text-xs text-slate-400">证据：{item.evidenceFeedbackIds.join("、")}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-base font-semibold text-ink">RICE 优先级</h2>
        <div className="mt-4 max-h-[420px] overflow-y-auto rounded-lg border border-slate-100">
          <div className="grid grid-cols-[1.2fr_72px_72px_72px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
            <span>功能</span>
            <span>优先级</span>
            <span>分数</span>
            <span>投入</span>
          </div>
          {riceItems.map((item) => (
            <div
              key={item.feature}
              className="grid grid-cols-[1.2fr_72px_72px_72px] border-t border-slate-100 px-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-ink">{item.feature}</p>
                <p className="mt-1 leading-6 text-slate-500">{item.rationale}</p>
                {item.formula ? <p className="mt-1 text-xs text-slate-400">RICE：{item.formula}</p> : null}
                {item.evidenceFeedbackIds?.length ? (
                  <p className="mt-1 text-xs text-slate-400">证据：{item.evidenceFeedbackIds.join("、")}</p>
                ) : null}
              </div>
              <span className="font-semibold text-pine">{item.priority}</span>
              <span>{item.score}</span>
              <span>{item.effort}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ScopeColumn({
  title,
  items,
  tone,
}: {
  title: string
  items: Array<MvpScopeItem | string>
  tone: "pine" | "amber"
}) {
  const marker = tone === "pine" ? "bg-pine" : "bg-amber"

  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={getScopeFeature(item)} className="flex gap-2 text-sm leading-6 text-slate-700">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${marker}`} />
            <span>
              <span className="font-medium text-ink">{getScopeFeature(item)}</span>
              {getScopeReason(item) ? <span className="block text-slate-500">{getScopeReason(item)}</span> : null}
              {getScopeEvidence(item).length ? (
                <span className="block text-xs text-slate-400">证据：{getScopeEvidence(item).join("、")}</span>
              ) : null}
            </span>
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
