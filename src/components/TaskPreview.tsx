import { Layers3 } from "lucide-react"
import type { EngineeringTask } from "@/types/product"

type TaskPreviewProps = {
  tasks: EngineeringTask[]
}

const taskTone: Record<EngineeringTask["type"], string> = {
  Epic: "bg-pine/10 text-pine",
  Story: "bg-amber/15 text-amber",
  Task: "bg-coral/10 text-coral",
}

export function TaskPreview({ tasks }: TaskPreviewProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-mist p-2 text-pine">
          <Layers3 size={19} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink">研发任务草稿</h2>
          <p className="mt-1 text-sm text-slate-500">先拆成 Epic、Story、Task，后续不自动创建任务。</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {tasks.map((task) => (
          <article key={task.title} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${taskTone[task.type]}`}>
                  {task.type}
                </span>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                  {task.priority}
                </span>
              </div>
              {task.dependsOn?.length ? (
                <span className="text-xs text-slate-400">依赖：{task.dependsOn.join(", ")}</span>
              ) : null}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-ink">{task.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{task.description}</p>
            <ul className="mt-3 space-y-2">
              {task.acceptanceCriteria.map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-6 text-slate-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pine" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
