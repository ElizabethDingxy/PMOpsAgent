import { CheckSquare, ExternalLink, GitMerge, RefreshCw, Square, UploadCloud } from "lucide-react"
import type { EngineeringTask, TapdCreatedWorkItems } from "@/types/product"

export type TapdProjectConfig = {
  workspaceId: string
  owner: string
  creator: string
  iterationId: string
}

type TapdTaskPanelProps = {
  tasks: EngineeringTask[]
  selectedIndexes: number[]
  projectConfig: TapdProjectConfig
  tapdConfigured: boolean
  defaultWorkspaceConfigured: boolean
  canCreate: boolean
  isCreating: boolean
  created?: TapdCreatedWorkItems
  statusMessage?: string
  onProjectConfigChange: (config: TapdProjectConfig) => void
  onToggleTask: (index: number) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onCreate: () => void
  isSyncingStatus: boolean
  onSyncStatus: () => void
}

export function TapdTaskPanel({
  tasks,
  selectedIndexes,
  projectConfig,
  tapdConfigured,
  defaultWorkspaceConfigured,
  canCreate,
  isCreating,
  created,
  statusMessage,
  onProjectConfigChange,
  onToggleTask,
  onSelectAll,
  onClearSelection,
  onCreate,
  isSyncingStatus,
  onSyncStatus,
}: TapdTaskPanelProps) {
  const selectedSet = new Set(selectedIndexes)

  return (
    <section className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <GitMerge className="text-indigo-400" size={18} />
          <div>
            <h2 className="text-md font-bold text-slate-100 tracking-tight">TAPD 交付集成 / TAPD Sync</h2>
            <p className="mt-1 text-xs text-slate-400">将选中的研发任务与生成的 PRD 同步到 TAPD 需求和工单系统。</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(created || tasks.some((t) => t.tapdTaskId)) ? (
            <button
              type="button"
              onClick={onSyncStatus}
              disabled={isSyncingStatus}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#121826] hover:bg-slate-800/80 hover:text-slate-100 hover:border-slate-700 text-xs font-semibold text-slate-350 px-4 py-2.5 transition-all disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw size={14} className={isSyncingStatus ? "animate-spin" : ""} aria-hidden="true" />
              {isSyncingStatus ? "同步中..." : "同步 TAPD 状态"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreate}
            disabled={!canCreate || isCreating}
            title={getDisabledReason(tapdConfigured, defaultWorkspaceConfigured, projectConfig.workspaceId, selectedIndexes.length, canCreate)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-xs font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all duration-300 px-4.5 py-2.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:from-slate-800 disabled:to-slate-900 disabled:shadow-none disabled:text-slate-500"
          >
            <UploadCloud size={14} aria-hidden="true" />
            {isCreating ? "同步创建中..." : "创建并同步 TAPD"}
          </button>
        </div>
      </div>

      <div className={`rounded-lg px-3.5 py-2 text-xs border ${
        tapdConfigured 
          ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' 
          : 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[inset_0_0_12px_rgba(244,63,94,0.05)]'
      }`}>
        {tapdConfigured
          ? "✓ TAPD API 凭证验证成功。请填写下方项目配置，留空则默认读取环境变量配置的项目。"
          : "✗ TAPD API 凭证未配置。如需使用真实同步功能，请配置 TAPD_API_USER 与 TAPD_API_PASSWORD。"}
      </div>

      {statusMessage ? (
        <p className="mt-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-2.5 text-xs text-indigo-400">
          {statusMessage}
        </p>
      ) : null}

      {/* Inputs Configuration */}
      <div className="mt-4 grid gap-4 rounded-xl border border-slate-850 bg-[#0e1320]/40 p-4">
        <TextInput
          label="TAPD 项目 Workspace ID"
          value={projectConfig.workspaceId}
          placeholder={defaultWorkspaceConfigured ? "留空将读取全局默认项目" : "项目 ID，例如：6738493"}
          required={!defaultWorkspaceConfigured}
          onChange={(workspaceId) =>
            onProjectConfigChange({
              ...projectConfig,
              workspaceId,
            })
          }
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput
            label="默认指派负责人"
            value={projectConfig.owner}
            placeholder="指派人用户名，可选"
            onChange={(owner) =>
              onProjectConfigChange({
                ...projectConfig,
                owner,
              })
            }
          />
          <TextInput
            label="创建人"
            value={projectConfig.creator}
            placeholder="可选"
            onChange={(creator) =>
              onProjectConfigChange({
                ...projectConfig,
                creator,
              })
            }
          />
          <TextInput
            label="目标迭代 ID (Iteration ID)"
            value={projectConfig.iterationId}
            placeholder="可选"
            onChange={(iterationId) =>
              onProjectConfigChange({
                ...projectConfig,
                iterationId,
              })
            }
          />
        </div>
      </div>

      {/* Select Control */}
      <div className="mt-5 flex items-center justify-between border-b border-slate-850 pb-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-lg border border-slate-800 bg-[#121826]/60 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-[#182033] hover:border-slate-700 transition-all"
          >
            全选
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-lg border border-slate-800 bg-[#121826]/60 px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-[#182033] hover:border-slate-700 transition-all"
          >
            清空
          </button>
        </div>
        <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-400 border border-indigo-500/25 font-mono">
          已选：{selectedIndexes.length} / {tasks.length}
        </span>
      </div>

      {/* Backlog Item Select Grid */}
      <div className="mt-4 grid gap-3 max-h-[300px] overflow-y-auto pr-1">
        {tasks.map((task, index) => {
          const isSynced = Boolean(task.tapdTaskId)
          const selected = isSynced || selectedSet.has(index)
          const isEpic = task.type === "Epic"
          const isStory = task.type === "Story"

          return (
            <button
              key={`${task.title}-${index}`}
              type="button"
              onClick={() => {
                if (isSynced) return
                onToggleTask(index)
              }}
              disabled={isSynced}
              className={`flex w-full items-start gap-4.5 rounded-xl border px-4 py-4 text-left transition-all ${
                isSynced
                  ? 'border-emerald-500/20 bg-emerald-500/[0.02] cursor-default'
                  : selected
                  ? 'border-indigo-500/40 bg-indigo-500/5 hover:border-indigo-500/60'
                  : 'border-slate-850 bg-[#121826]/20 hover:border-slate-800 hover:bg-[#121826]/40'
              }`}
            >
              <span className={`mt-0.5 transition-colors ${selected ? 'text-indigo-450' : 'text-slate-600'}`}>
                {isSynced ? (
                  <CheckSquare size={17} className="text-emerald-500/80" />
                ) : selected ? (
                  <CheckSquare size={17} className="text-indigo-500" />
                ) : (
                  <Square size={17} aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-200">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold mr-2 border ${
                    isEpic
                      ? 'bg-purple-500/10 border-purple-500/25 text-purple-400'
                      : isStory
                      ? 'bg-blue-500/10 border-blue-500/25 text-blue-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    {task.type}
                  </span>
                  {task.title}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-mono">
                  {isSynced ? (
                    <>
                      <span className="text-emerald-500 font-bold">已同步</span>
                      {task.tapdTaskStatus ? (
                        <>
                          <span>·</span>
                          {getStatusBadge(task.tapdTaskStatus)}
                        </>
                      ) : null}
                      {task.tapdTaskUrl ? (
                        <>
                          <span>·</span>
                          <a
                            href={task.tapdTaskUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          >
                            查看工单 <ExternalLink size={9} />
                          </a>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-slate-500">未同步</span>
                  )}
                  <span>·</span>
                  <span>优先级：{task.priority}</span>
                  <span>·</span>
                  <span>{task.acceptanceCriteria.length} 条验收标准</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {created ? (
        <div className="mt-5 rounded-xl border border-slate-800 bg-[#0e1320]/60 p-4">
          <h3 className="text-xs font-bold text-slate-350 border-b border-slate-800 pb-2 mb-3">已生成 TAPD 工单索引</h3>
          <div className="space-y-2.5">
            <TapdLink label={`[需求] ${created.story.title}`} url={created.story.url} />
            {created.tasks.map((task) => (
              <TapdLink key={task.id} label={`[任务] ${task.title}`} url={task.url} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function TapdLink({ label, url }: { label: string; url: string }) {
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noreferrer" 
      className="flex items-center justify-between rounded-lg border border-slate-850 bg-[#121826]/30 px-3.5 py-2.5 hover:border-indigo-500/30 hover:bg-indigo-500/5 text-xs text-indigo-400 hover:text-indigo-300 transition-all font-medium"
    >
      <span className="truncate flex-1 pr-3">{label}</span>
      <ExternalLink size={13} className="shrink-0" />
    </a>
  )
}

function TextInput({
  label,
  value,
  placeholder,
  required = false,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  required?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block w-full">
      <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-850 bg-[#0e121e] px-3.5 py-2 text-xs text-slate-200 placeholder-slate-650 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
      />
    </label>
  )
}

function getDisabledReason(tapdConfigured: boolean, defaultWorkspaceConfigured: boolean, workspaceId: string, selectedCount: number, canCreate: boolean) {
  if (!tapdConfigured) return "请配置 TAPD_API_USER 与 TAPD_API_PASSWORD 环境变量。"
  if (!workspaceId.trim() && !defaultWorkspaceConfigured) return "请填写 TAPD 项目 Workspace ID 字段。"
  if (selectedCount === 0) return "请选择勾选研发任务进行增量同步。"
  if (!canCreate) return "请先确认通过上面的飞书评审草稿。"
  return "点击创建并增量同步工单到 TAPD"
}

function getStatusBadge(status: string) {
  let colorClass = "bg-blue-500/10 border-blue-500/25 text-blue-400"
  if (status === "进行中") {
    colorClass = "bg-amber-500/10 border-amber-500/25 text-amber-400"
  } else if (["已解决", "已解决", "已完成", "已关闭"].includes(status)) {
    colorClass = "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.1)]"
  }
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold border font-sans ${colorClass}`}>
      {status}
    </span>
  )
}
