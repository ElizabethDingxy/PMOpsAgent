"use client"

import { Plus, Trash2 } from "lucide-react"
import type { EngineeringTask } from "@/types/product"

type EditableTasksProps = {
  tasks: EngineeringTask[]
  onChange: (tasks: EngineeringTask[]) => void
}

const taskTypes: EngineeringTask["type"][] = ["Epic", "Story", "Task"]
const priorities: EngineeringTask["priority"][] = ["P0", "P1", "P2"]

export function EditableTasks({ tasks, onChange }: EditableTasksProps) {
  function updateTask(index: number, task: EngineeringTask) {
    const next = [...tasks]
    next[index] = task
    onChange(next)
  }

  function addTask() {
    onChange([
      ...tasks,
      {
        type: "Task",
        title: "新增任务",
        description: "补充任务说明。",
        acceptanceCriteria: ["补充验收标准"],
        priority: "P1",
      },
    ])
  }

  function deleteTask(index: number) {
    onChange(tasks.filter((_, taskIndex) => taskIndex !== index))
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">研发任务草稿</h2>
          <p className="mt-1 text-sm text-slate-500">可编辑任务内容，但不会自动创建真实任务。</p>
        </div>
        <button
          type="button"
          onClick={addTask}
          className="inline-flex items-center gap-2 rounded-md bg-pine px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} aria-hidden="true" />
          新增
        </button>
      </div>

      <div className="mt-5 max-h-[620px] space-y-4 overflow-y-auto pr-1 xl:max-h-[52vh]">
        {tasks.map((task, index) => (
          <article key={`${task.title}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-semibold text-ink">类型</span>
                <select
                  value={task.type}
                  onChange={(event) =>
                    updateTask(index, {
                      ...task,
                      type: event.target.value as EngineeringTask["type"],
                    })
                  }
                  className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {taskTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink">优先级</span>
                <select
                  value={task.priority}
                  onChange={(event) =>
                    updateTask(index, {
                      ...task,
                      priority: event.target.value as EngineeringTask["priority"],
                    })
                  }
                  className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => deleteTask(index)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600"
                >
                  <Trash2 size={16} aria-hidden="true" />
                  删除
                </button>
              </div>
            </div>

            <TextInput
              label="标题"
              value={task.title}
              onChange={(value) =>
                updateTask(index, {
                  ...task,
                  title: value,
                })
              }
            />
            <TextArea
              label="描述"
              value={task.description}
              onChange={(value) =>
                updateTask(index, {
                  ...task,
                  description: value,
                })
              }
            />
            <ListEditor
              label="验收标准"
              items={task.acceptanceCriteria}
              onChange={(items) =>
                updateTask(index, {
                  ...task,
                  acceptanceCriteria: items,
                })
              }
            />
            <ListEditor
              label="依赖"
              items={task.dependsOn ?? []}
              onChange={(items) =>
                updateTask(index, {
                  ...task,
                  dependsOn: items.length > 0 ? items : undefined,
                })
              }
            />
          </article>
        ))}
      </div>
    </section>
  )
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-4 block">
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
    <label className="mt-4 block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
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
    <label className="mt-4 block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <textarea
        value={items.join("\n")}
        onChange={(event) => onChange(splitLines(event.target.value))}
        rows={Math.min(5, Math.max(2, items.length))}
        className="mt-2 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-pine"
      />
    </label>
  )
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}
