import { CheckSquare, ExternalLink, Square, UploadCloud } from "lucide-react"
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
}: TapdTaskPanelProps) {
  const selectedSet = new Set(selectedIndexes)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-pine">TAPD Sync</p>
          <h2 className="mt-1 text-base font-semibold text-ink">创建 TAPD 需求/任务</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">确认草稿后，将 PRD 作为 TAPD 需求创建，并把选中的研发任务创建为关联任务。</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={!canCreate || isCreating}
          title={getDisabledReason(tapdConfigured, defaultWorkspaceConfigured, projectConfig.workspaceId, selectedIndexes.length, canCreate)}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-pine px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <UploadCloud size={16} aria-hidden="true" />
          {isCreating ? "创建中" : "创建 TAPD"}
        </button>
      </div>

      <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {tapdConfigured
          ? "TAPD API 账号已配置。项目 ID 可在下方填写并记住；留空时使用 .env.local 中的默认项目。"
          : "TAPD API 账号未配置，创建按钮已禁用。"}
      </div>
      {statusMessage ? <p className="mt-3 rounded-md bg-pine/10 px-3 py-2 text-sm text-pine">{statusMessage}</p> : null}

      <div className="mt-4 grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
        <TextInput
          label="TAPD 项目 ID"
          value={projectConfig.workspaceId}
          placeholder={defaultWorkspaceConfigured ? "留空使用默认项目" : "例如 12345678"}
          required={!defaultWorkspaceConfigured}
          onChange={(workspaceId) =>
            onProjectConfigChange({
              ...projectConfig,
              workspaceId,
            })
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput
            label="负责人"
            value={projectConfig.owner}
            placeholder="可选"
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
            label="迭代 ID"
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink"
        >
          全选
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500"
        >
          清空
        </button>
        <span className="rounded-md bg-mist px-3 py-1.5 text-xs font-semibold text-pine">
          已选 {selectedIndexes.length} / {tasks.length}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {tasks.map((task, index) => {
          const selected = selectedSet.has(index)

          return (
            <button
              key={`${task.title}-${index}`}
              type="button"
              onClick={() => onToggleTask(index)}
              className="flex w-full items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-left transition hover:border-pine"
            >
              <span className="mt-0.5 text-pine">
                {selected ? <CheckSquare size={17} aria-hidden="true" /> : <Square size={17} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  [{task.type}] {task.title}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {task.priority} · {task.acceptanceCriteria.length} 条验收标准
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {created ? (
        <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-ink">已创建 TAPD 链接</h3>
          <div className="mt-3 space-y-2 text-sm">
            <TapdLink label={`需求：${created.story.title}`} url={created.story.url} />
            {created.tasks.map((task) => (
              <TapdLink key={task.id} label={`任务：${task.title}`} url={task.url} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function TapdLink({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-pine">
      <ExternalLink size={14} aria-hidden="true" />
      <span className="truncate">{label}</span>
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
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">
        {label}
        {required ? <span className="text-coral"> *</span> : null}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-pine"
      />
    </label>
  )
}

function getDisabledReason(tapdConfigured: boolean, defaultWorkspaceConfigured: boolean, workspaceId: string, selectedCount: number, canCreate: boolean) {
  if (!tapdConfigured) return "请先配置 TAPD_API_USER 和 TAPD_API_PASSWORD。"
  if (!workspaceId.trim() && !defaultWorkspaceConfigured) return "请填写 TAPD 项目 ID。"
  if (selectedCount === 0) return "请至少选择一个研发任务。"
  if (!canCreate) return "请先点击“确认通过”。"
  return "创建 TAPD 需求/任务"
}
