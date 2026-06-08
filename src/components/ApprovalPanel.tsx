import { Copy, ExternalLink, FileText, Send, ShieldCheck, XCircle } from "lucide-react"

export type ApprovalStatus =
  | "draft_generated"
  | "user_editing"
  | "approved"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled"

type ApprovalPanelProps = {
  message: string
  hasDraft: boolean
  canApprove: boolean
  canCreatePrdDoc: boolean
  canSend: boolean
  webhookConfigured: boolean
  feishuDocumentConfigured: boolean
  status: ApprovalStatus
  statusMessage?: string
  isCreatingPrdDoc: boolean
  prdDocumentUrl?: string
  onMessageChange: (message: string) => void
  onApprove: () => void
  onCreatePrdDoc: () => void
  onSend: () => void
  onCopy: () => void
  onCancel: () => void
}

export function ApprovalPanel({
  message,
  hasDraft,
  canApprove,
  canCreatePrdDoc,
  canSend,
  webhookConfigured,
  feishuDocumentConfigured,
  status,
  statusMessage,
  isCreatingPrdDoc,
  prdDocumentUrl,
  onMessageChange,
  onApprove,
  onCreatePrdDoc,
  onSend,
  onCopy,
  onCancel,
}: ApprovalPanelProps) {
  const statusMeta = getStatusMeta(status, hasDraft)
  const sendDisabledReason = getSendDisabledReason(message, hasDraft, webhookConfigured, canSend, status)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="grid gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-coral">Approval Required</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">发送飞书前确认</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Agent 准备发送飞书评审摘要。这会向飞书群发送一条消息，请先确认草稿，再发送。
          </p>
          <div className={`mt-3 rounded-md px-3 py-2 text-sm font-semibold ${statusMeta.className}`}>
            当前状态：{statusMeta.label}
          </div>
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {webhookConfigured
              ? "飞书 webhook 已配置。外部发送动作只会在你确认通过并点击“发送到飞书”后执行。"
              : "飞书 webhook 未配置，发送按钮已禁用。"}
          </p>
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {feishuDocumentConfigured
              ? "飞书文档 API 已配置。创建 PRD 文档需要你先确认草稿并手动点击按钮。"
              : "飞书文档 API 未配置，创建 PRD 文档按钮已禁用。"}
          </p>
          {statusMessage ? (
            <p className="mt-3 rounded-md bg-pine/10 px-3 py-2 text-sm text-pine">{statusMessage}</p>
          ) : null}
          {prdDocumentUrl ? (
            <a
              href={prdDocumentUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-pine"
            >
              <ExternalLink size={15} aria-hidden="true" />
              打开飞书 PRD
            </a>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-ink">飞书评审摘要</h3>
          <textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            disabled={!hasDraft || status === "sending"}
            placeholder="等待 Agent 生成飞书评审摘要。"
            rows={8}
            className="mt-3 max-h-[260px] w-full resize-none rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none focus:border-pine disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onApprove}
              disabled={!canApprove || status === "sending" || status === "sent"}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-coral px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <ShieldCheck size={16} aria-hidden="true" />
              确认通过
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend || status === "sending"}
              title={sendDisabledReason}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-pine px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send size={16} aria-hidden="true" />
              {status === "sending" ? "发送中" : "发送到飞书"}
            </button>
            <button
              type="button"
              onClick={onCreatePrdDoc}
              disabled={!canCreatePrdDoc || isCreatingPrdDoc}
              title={getCreateDocDisabledReason(hasDraft, feishuDocumentConfigured, status, canCreatePrdDoc)}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <FileText size={16} aria-hidden="true" />
              {isCreatingPrdDoc ? "创建中" : prdDocumentUrl ? "重新创建 PRD" : "创建飞书 PRD"}
            </button>
            <button
              type="button"
              onClick={onCopy}
              disabled={!message.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink"
            >
              <Copy size={16} aria-hidden="true" />
              复制摘要
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={!hasDraft || status === "sending"}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <XCircle size={16} aria-hidden="true" />
              取消
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function getCreateDocDisabledReason(hasDraft: boolean, feishuDocumentConfigured: boolean, status: ApprovalStatus, canCreatePrdDoc: boolean) {
  if (!hasDraft) return "请先运行 Agent 并生成 PRD 草稿。"
  if (!feishuDocumentConfigured) return "请先配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。"
  if (status !== "approved") return "请先点击“确认通过”。"
  if (!canCreatePrdDoc) return "当前无法创建飞书 PRD。"
  return "创建飞书 PRD 文档"
}

function getSendDisabledReason(
  message: string,
  hasDraft: boolean,
  webhookConfigured: boolean,
  canSend: boolean,
  status: ApprovalStatus,
) {
  if (!hasDraft) return "请先运行 Agent 并生成评审摘要。"
  if (!message.trim()) return "暂无可发送的飞书摘要。"
  if (!webhookConfigured) return "请先配置 FEISHU_BOT_WEBHOOK。"
  if (status !== "approved") return "请先点击“确认通过”。"
  if (!canSend) return "请先运行 Agent 并生成评审摘要。"
  return "发送到飞书"
}

function getStatusMeta(status: ApprovalStatus, hasDraft: boolean) {
  if (!hasDraft) {
    return {
      label: "等待草稿生成",
      className: "bg-slate-100 text-slate-500",
    }
  }

  const statusMap: Record<ApprovalStatus, { label: string; className: string }> = {
    draft_generated: {
      label: "草稿已生成，等待确认",
      className: "bg-amber/10 text-slate-700",
    },
    user_editing: {
      label: "用户编辑中，等待重新确认",
      className: "bg-amber/10 text-slate-700",
    },
    approved: {
      label: "已确认，可发送",
      className: "bg-pine/10 text-pine",
    },
    sending: {
      label: "发送中",
      className: "bg-amber/10 text-slate-700",
    },
    sent: {
      label: "已发送",
      className: "bg-pine/10 text-pine",
    },
    failed: {
      label: "发送失败",
      className: "bg-red-50 text-red-600",
    },
    cancelled: {
      label: "已取消，草稿保留",
      className: "bg-slate-100 text-slate-500",
    },
  }

  return statusMap[status]
}
