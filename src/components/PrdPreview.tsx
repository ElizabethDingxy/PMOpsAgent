import type { PrdDraft, RiskItem } from "@/types/product"

type PrdPreviewProps = {
  prd: PrdDraft
  risks: RiskItem[]
  openQuestions: string[]
}

export function PrdPreview({ prd, risks, openQuestions }: PrdPreviewProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-pine">PRD Draft</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">{prd.title}</h2>
      </div>

      <div className="mt-5 space-y-5">
        <PreviewBlock title="背景" content={prd.background} />
        <PreviewBlock title="用户问题" content={prd.problemStatement} />

        <ListBlock title="目标用户" items={prd.targetUsers} />
        <ListBlock title="目标" items={prd.goals} />
        <ListBlock title="非目标" items={prd.nonGoals} />
        <ListBlock title="用户故事" items={prd.userStories} />
        <ListBlock title="功能需求" items={prd.functionalRequirements} />
        <ListBlock title="成功指标" items={prd.successMetrics} />

        <div>
          <h3 className="text-sm font-semibold text-ink">埋点方案</h3>
          <div className="mt-3 space-y-3">
            {prd.trackingPlan.map((event) => (
              <article key={event.eventName} className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-semibold text-pine">{event.eventName}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{event.trigger}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Properties: {event.properties.join(", ")}
                </p>
                <p className="mt-1 text-xs text-slate-500">{event.purpose}</p>
              </article>
            ))}
          </div>
        </div>

        <ListBlock title="开放问题" items={openQuestions} />

        <div>
          <h3 className="text-sm font-semibold text-ink">风险</h3>
          <div className="mt-3 grid gap-3">
            {risks.map((item) => (
              <article key={item.risk} className="rounded-lg bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{item.risk}</p>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-coral">
                    {item.level}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.mitigation}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function PreviewBlock({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{content}</p>
    </div>
  )
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-slate-600">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pine" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
