"use client"

import type { PrdDraft, RiskItem } from "@/types/product"
import { AlertCircle, BookOpen, Eye, HelpCircle, ListTodo, Sparkles, Terminal } from "lucide-react"

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
    <section className="glass-panel rounded-xl p-6 border border-slate-800/80 shadow-soft">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-5">
        <BookOpen className="text-indigo-400 animate-pulse" size={20} />
        <div>
          <h2 className="text-md font-bold text-slate-100 tracking-tight">PRD 需求规格文档 / PRD Draft</h2>
          <p className="mt-1 text-xs text-slate-400">AI 自动生成的 PRD 草稿。点击文本框可以直接编辑或补充细节内容。</p>
        </div>
      </div>

      <div>
        <TextInput label="PRD 标题 / PRD Title" value={prd.title} onChange={(value) => update("title", value)} />
      </div>

      <div className="mt-6 max-h-[800px] space-y-6 overflow-y-auto pr-1">
        {/* Section 1: Background & Objectives */}
        <div className="border-t border-slate-850 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 mb-4">
            <Sparkles size={14} /> 一、背景与受众目标
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextArea label="业务背景说明" value={prd.background} onChange={(value) => update("background", value)} />
            </div>
            <div className="sm:col-span-2">
              <TextArea label="核心用户痛点陈述" value={prd.problemStatement} onChange={(value) => update("problemStatement", value)} />
            </div>
            <div className="sm:col-span-2">
              <ListEditor label="目标用户群 (每行一条)" items={prd.targetUsers} onChange={(items) => update("targetUsers", items)} />
            </div>
          </div>
        </div>

        {/* Section 2: Goals & Stories */}
        <div className="border-t border-slate-850 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 mb-4">
            <ListTodo size={14} /> 二、功能边界与用户故事
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <ListEditor label="项目核心目标" items={prd.goals} onChange={(items) => update("goals", items)} />
            </div>
            <div>
              <ListEditor label="非目标 / 排除范围" items={prd.nonGoals} onChange={(items) => update("nonGoals", items)} />
            </div>
            <div className="sm:col-span-2">
              <ListEditor label="主要用户故事 (User Stories)" items={prd.userStories} onChange={(items) => update("userStories", items)} />
            </div>
            <div className="sm:col-span-2">
              <ListEditor label="功能性需求列表 (Functional Requirements)" items={prd.functionalRequirements} onChange={(items) => update("functionalRequirements", items)} />
            </div>
          </div>
        </div>

        {/* Section 3: Metrics & Tracking */}
        <div className="border-t border-slate-850 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 mb-4">
            <Terminal size={14} /> 三、成功指标与埋点方案
          </h3>
          <div className="space-y-4">
            <ListEditor label="项目成功衡量指标 (Success Metrics)" items={prd.successMetrics} onChange={(items) => update("successMetrics", items)} />
            
            <div className="rounded-xl bg-[#0e1320]/40 border border-slate-850 p-4">
              <span className="text-xs font-bold text-slate-350 block mb-3">埋点设计规范 (Tracking Plan)</span>
              <div className="grid gap-4">
                {prd.trackingPlan.map((event, index) => (
                  <article key={`${event.eventName}-${index}`} className="rounded-lg bg-[#0d101d] border border-slate-850 p-4 hover:border-slate-800 transition-all">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextInput
                        label="事件标识名 (Event Name)"
                        value={event.eventName}
                        onChange={(value) =>
                          updateTrackingPlan(index, {
                            ...event,
                            eventName: value,
                          })
                        }
                      />
                      <TextInput
                        label="上报属性 (Properties, 逗号分隔)"
                        value={event.properties.join(", ")}
                        onChange={(value) =>
                          updateTrackingPlan(index, {
                            ...event,
                            properties: value.split(",").map(v => v.trim()).filter(Boolean),
                          })
                        }
                      />
                      <div className="sm:col-span-2">
                        <TextInput
                          label="触发时机 (Trigger Condition)"
                          value={event.trigger}
                          onChange={(value) =>
                            updateTrackingPlan(index, {
                              ...event,
                              trigger: value,
                            })
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <TextInput
                          label="埋点采集目的 (Purpose)"
                          value={event.purpose}
                          onChange={(value) =>
                            updateTrackingPlan(index, {
                              ...event,
                              purpose: value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Risks & Open Questions */}
        <div className="border-t border-slate-850 pt-5 grid gap-4 md:grid-cols-2">
          <ReadOnlyList title="待决开放问题 / Open Questions" items={openQuestions} />
          <ReadOnlyRisks risks={risks} />
        </div>
      </div>
    </section>
  )
}

function TextInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="block w-full">
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-850 bg-[#0e121e] px-3.5 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
      />
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block w-full">
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-1.5 w-full resize-none rounded-lg border border-slate-850 bg-[#0e121e] px-3.5 py-2.5 text-xs leading-relaxed text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
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
    <label className="block w-full">
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <textarea
        value={items.join("\n")}
        onChange={(event) => onChange(splitLines(event.target.value))}
        rows={Math.min(6, Math.max(3, items.length))}
        placeholder="输入内容，按回车添加多条记录"
        className="mt-1.5 w-full resize-none rounded-lg border border-slate-850 bg-[#0e121e] px-3.5 py-2.5 text-xs leading-relaxed text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-sans"
      />
    </label>
  )
}

function ReadOnlyList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-slate-900/40 border border-slate-850 p-4">
      <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-850 pb-2 mb-3">
        <HelpCircle size={14} className="text-amber-400" /> {title}
      </h3>
      {items.length > 0 ? (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-xs leading-relaxed text-slate-400">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-550 leading-relaxed">暂无开放性问题记录。</p>
      )}
    </div>
  )
}

function ReadOnlyRisks({ risks }: { risks: RiskItem[] }) {
  return (
    <div className="rounded-xl bg-slate-900/40 border border-slate-850 p-4">
      <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-850 pb-2 mb-3">
        <AlertCircle size={14} className="text-rose-400 animate-pulse" /> 项目安全边界与风险控制
      </h3>
      {risks.length > 0 ? (
        <div className="grid gap-3 max-h-[220px] overflow-y-auto pr-1">
          {risks.map((item) => (
            <article key={item.risk} className="rounded-lg bg-[#0d101a] border border-slate-850 p-3 hover:border-slate-800 transition-all">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-850 pb-1.5 mb-1.5">
                <p className="text-xs font-bold text-slate-200">{item.risk}</p>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                  item.level === 'high' 
                    ? 'bg-rose-500/10 border border-rose-500/25 text-rose-450' 
                    : 'bg-amber-500/10 border border-amber-500/25 text-amber-400'
                }`}>
                  {item.level.toUpperCase()} 风险
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">规避措施：{item.mitigation}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-550 leading-relaxed">未评估到潜在项目风险。</p>
      )}
    </div>
  )
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}
