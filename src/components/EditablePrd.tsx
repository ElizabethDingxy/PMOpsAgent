"use client"

import type { PrdDraft, RiskItem } from "@/types/product"

type EditablePrdProps = {
  prd: PrdDraft
  risks: RiskItem[]
  openQuestions: string[]
  onChange: (prd: PrdDraft) => void
}

export function EditablePrd({ prd, risks, openQuestions, onChange }: EditablePrdProps) {
  function update<K extends keyof PrdDraft>(key: K, value: PrdDraft[K]) {
    onChange({
      ...prd,
      [key]: value,
    })
  }

  function updateTrackingPlan(index: number, value: PrdDraft["trackingPlan"][number]) {
    const next = [...prd.trackingPlan]
    next[index] = value
    update("trackingPlan", next)
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-pine">Editable PRD Draft</p>
        <TextInput label="PRD 标题" value={prd.title} onChange={(value) => update("title", value)} />
      </div>

      <div className="mt-5 max-h-[680px] space-y-5 overflow-y-auto pr-1 xl:max-h-[56vh]">
        <TextArea label="背景" value={prd.background} onChange={(value) => update("background", value)} />
        <TextArea label="用户问题" value={prd.problemStatement} onChange={(value) => update("problemStatement", value)} />
        <ListEditor label="目标用户" items={prd.targetUsers} onChange={(items) => update("targetUsers", items)} />
        <ListEditor label="目标" items={prd.goals} onChange={(items) => update("goals", items)} />
        <ListEditor label="非目标" items={prd.nonGoals} onChange={(items) => update("nonGoals", items)} />
        <ListEditor label="用户故事" items={prd.userStories} onChange={(items) => update("userStories", items)} />
        <ListEditor
          label="功能需求"
          items={prd.functionalRequirements}
          onChange={(items) => update("functionalRequirements", items)}
        />
        <ListEditor label="成功指标" items={prd.successMetrics} onChange={(items) => update("successMetrics", items)} />

        <div>
          <h3 className="text-sm font-semibold text-ink">埋点方案</h3>
          <div className="mt-3 space-y-3">
            {prd.trackingPlan.map((event, index) => (
              <article key={`${event.eventName}-${index}`} className="rounded-lg bg-slate-50 p-4">
                <TextInput
                  label="事件名"
                  value={event.eventName}
                  onChange={(value) =>
                    updateTrackingPlan(index, {
                      ...event,
                      eventName: value,
                    })
                  }
                />
                <TextArea
                  label="触发时机"
                  value={event.trigger}
                  onChange={(value) =>
                    updateTrackingPlan(index, {
                      ...event,
                      trigger: value,
                    })
                  }
                />
                <ListEditor
                  label="属性"
                  items={event.properties}
                  onChange={(items) =>
                    updateTrackingPlan(index, {
                      ...event,
                      properties: items,
                    })
                  }
                />
                <TextArea
                  label="目的"
                  value={event.purpose}
                  onChange={(value) =>
                    updateTrackingPlan(index, {
                      ...event,
                      purpose: value,
                    })
                  }
                />
              </article>
            ))}
          </div>
        </div>

        <ReadOnlyList title="开放问题" items={openQuestions} />
        <ReadOnlyRisks risks={risks} />
      </div>
    </section>
  )
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-pine"
      />
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-2 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-pine"
      />
    </label>
  )
}

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <textarea
        value={items.join("\n")}
        onChange={(event) => onChange(splitLines(event.target.value))}
        rows={Math.min(6, Math.max(3, items.length))}
        className="mt-2 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-pine"
      />
    </label>
  )
}

function ReadOnlyList({ title, items }: { title: string; items: string[] }) {
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

function ReadOnlyRisks({ risks }: { risks: RiskItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">风险</h3>
      <div className="mt-3 grid gap-3">
        {risks.map((item) => (
          <article key={item.risk} className="rounded-lg bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{item.risk}</p>
              <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-coral">{item.level}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.mitigation}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}
