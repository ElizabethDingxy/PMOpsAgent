"use client"

import { Kanban, Plus, Trash2 } from "lucide-react"
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
    <section className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <Kanban className="text-indigo-400" size={18} />
          <div>
            <h2 className="text-md font-bold text-slate-100 tracking-tight">研发任务拆解 / Tasks Backlog</h2>
            <p className="mt-1 text-xs text-slate-400">AI 自动拆解的 Epic 史诗、Story 故事与 Task 任务。可手动添加或调整依赖。</p>
          </div>
        </div>
        <button
          type="button"
          onClick={addTask}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/15 hover:bg-indigo-500/25 px-4 py-2 text-xs font-bold text-indigo-300 hover:text-indigo-200 transition-all shadow-sm"
        >
          <Plus size={14} aria-hidden="true" />
          新增工单
        </button>
      </div>

      <div className="mt-5 max-h-[760px] space-y-4 overflow-y-auto pr-1">
        {tasks.map((task, index) => {
          const isEpic = task.type === "Epic"
          const isStory = task.type === "Story"

          return (
            <article key={`${task.title}-${index}`} className="rounded-xl border border-slate-850 bg-[#121826]/30 hover:border-slate-800 p-5 transition-all relative group">
              <div className="grid gap-4 sm:grid-cols-3 border-b border-slate-850 pb-4 mb-4">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">工单类型 (Type)</span>
                  <select
                    value={task.type}
                    onChange={(event) =>
                      updateTask(index, {
                        ...task,
                        type: event.target.value as EngineeringTask["type"],
                      })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-850 bg-[#0e121e] px-3 py-2 text-xs text-slate-200 focus:border-indigo-500/50 outline-none transition-all"
                  >
                    {taskTypes.map((type) => (
                      <option key={type} value={type}>
                        {type === 'Epic' ? 'Epic 史诗' : type === 'Story' ? 'Story 故事' : 'Task 任务'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">优先级 (Priority)</span>
                  <select
                    value={task.priority}
                    onChange={(event) =>
                      updateTask(index, {
                        ...task,
                        priority: event.target.value as EngineeringTask["priority"],
                      })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-850 bg-[#0e121e] px-3 py-2 text-xs text-slate-200 focus:border-indigo-500/50 outline-none transition-all"
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
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-semibold text-rose-400 hover:text-rose-300 py-2.5 transition-all shadow-sm"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    删除此任务
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <TextInput
                  label="工单标题 / Title"
                  value={task.title}
                  placeholder="任务标题..."
                  onChange={(value) =>
                    updateTask(index, {
                      ...task,
                      title: value,
                    })
                  }
                />
                <TextArea
                  label="工单描述 / Description"
                  value={task.description}
                  placeholder="补充任务执行细节描述..."
                  onChange={(value) =>
                    updateTask(index, {
                      ...task,
                      description: value,
                    })
                  }
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <ListEditor
                    label="验收标准 (Acceptance Criteria, 每行一条)"
                    items={task.acceptanceCriteria}
                    onChange={(items) =>
                      updateTask(index, {
                        ...task,
                        acceptanceCriteria: items,
                      })
                    }
                  />
                  <ListEditor
                    label="前置依赖工单 (Depends On, 每行一个标题)"
                    items={task.dependsOn ?? []}
                    onChange={(items) =>
                      updateTask(index, {
                        ...task,
                        dependsOn: items.length > 0 ? items : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function TextInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="block w-full">
      <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-850 bg-[#0e121e] px-3.5 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
      />
    </label>
  )
}

function TextArea({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="block w-full">
      <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
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
      <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">{label}</span>
      <textarea
        value={items.join("\n")}
        onChange={(event) => onChange(splitLines(event.target.value))}
        rows={Math.min(5, Math.max(2, items.length))}
        placeholder="输入内容，按回车添加多条记录"
        className="mt-1.5 w-full resize-none rounded-lg border border-slate-850 bg-[#0e121e] px-3.5 py-2.5 text-xs leading-relaxed text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-sans"
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
