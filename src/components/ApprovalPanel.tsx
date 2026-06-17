import { CheckCircle2, Copy, ExternalLink, FileText, HelpCircle, Send, ShieldCheck, XCircle } from "lucide-react"

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

  // Workflows Stepper Calculation
  const step1Active = hasDraft
  const step1Complete = status === "approved" || status === "sent" || status === "sending"
  const step2Active = status === "approved" || status === "sending"
  const step2Complete = status === "sent"
  const step3Active = status === "sending" || status === "sent"
  const step3Complete = status === "sent"

  return (
    <section className="glass-panel rounded-xl p-5 border border-slate-800/80 shadow-soft sticky top-5">
      <div className="grid gap-5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-450 block">Approval Center</span>
          <h2 className="mt-1 text-md font-bold text-slate-100 tracking-tight">飞书同步与发布审批</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            在将评审摘要和 PRD 文档发送至飞书团队群前，必须经由产品负责人在此面板核对并授权确认。
          </p>

          {/* Stepper Pipeline */}
          <div className="mt-5 mb-5 rounded-xl bg-[#0e1320]/60 border border-slate-850 p-4">
            <div className="flex items-center justify-between relative">
              <div className="absolute left-0 right-0 top-3 h-0.5 bg-slate-800 z-0">
                <div className={`h-full stepper-line transition-all duration-500 ${
                  status === "sent" ? "w-full" : status === "approved" ? "w-1/2" : "w-0"
                }`}></div>
              </div>

              {/* Step 1 */}
              <div className="flex flex-col items-center z-10">
                <div className={`h-6.5 w-6.5 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                  step1Complete 
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" 
                    : step1Active 
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 animate-pulse-glow" 
                    : "border-slate-800 bg-[#080b11] text-slate-600"
                }`}>
                  1
                </div>
                <span className="text-[9px] mt-1.5 font-semibold text-slate-400">生成草稿</span>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center z-10">
                <div className={`h-6.5 w-6.5 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                  step2Complete 
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" 
                    : step2Active 
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 animate-pulse-glow" 
                    : "border-slate-800 bg-[#080b11] text-slate-600"
                }`}>
                  2
                </div>
                <span className="text-[9px] mt-1.5 font-semibold text-slate-400">评审核对</span>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center z-10">
                <div className={`h-6.5 w-6.5 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                  step3Complete 
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" 
                    : step3Active 
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 animate-pulse-glow" 
                    : "border-slate-800 bg-[#080b11] text-slate-600"
                }`}>
                  3
                </div>
                <span className="text-[9px] mt-1.5 font-semibold text-slate-400">发布群聊</span>
              </div>
            </div>
          </div>

          <div className={`mt-3 rounded-lg px-3.5 py-2.5 text-xs font-bold border flex items-center justify-between ${statusMeta.className}`}>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-current animate-pulse"></span>
              {statusMeta.label}
            </span>
          </div>

          {/* API Credentials Check */}
          <div className="mt-3 grid gap-2 text-[10px] text-slate-450 font-mono">
            <p className="rounded-lg bg-[#0e1320]/60 border border-slate-850 px-3.5 py-2">
              {webhookConfigured ? "✓ 飞书自定义群机器人 Webhook：已就绪" : "✗ 飞书 Webhook 未配置 (发送按钮已禁用)"}
            </p>
            <p className="rounded-lg bg-[#0e1320]/60 border border-slate-850 px-3.5 py-2">
              {feishuDocumentConfigured ? "✓ 飞书云文档 API 配置：已就绪" : "✗ 飞书文档 API 未配置 (创建云文档已禁用)"}
            </p>
          </div>

          {statusMessage ? (
            <div className="mt-3.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3.5 text-xs leading-relaxed text-indigo-300">
              {statusMessage}
            </div>
          ) : null}

          {prdDocumentUrl ? (
            <a
              href={prdDocumentUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3.5 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-3.5 py-2.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-all shadow-sm"
            >
              <ExternalLink size={13} aria-hidden="true" />
              查看已生成的飞书云 PRD 文档
            </a>
          ) : null}
        </div>

        {/* Message preview area */}
        <div className="rounded-xl border border-slate-850 bg-[#0e1320]/40 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-850 pb-2 mb-3 flex items-center gap-2">
            <CheckCircle2 size={13} className="text-indigo-400" /> 飞书群评审摘要消息预览
          </h3>
          <textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            disabled={!hasDraft || status === "sending"}
            placeholder="等待 AI 分析生成飞书评审摘要..."
            rows={8}
            className="w-full resize-none rounded-lg border border-slate-850 bg-[#07090f] p-3.5 text-xs leading-relaxed text-slate-350 placeholder-slate-650 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all disabled:cursor-not-allowed disabled:opacity-40"
          />

          <div className="mt-4 grid gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onApprove}
                disabled={!canApprove || status === "sending" || status === "sent"}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-[#d96c4a] hover:from-rose-600 hover:to-[#c85d3e] text-xs font-bold text-white shadow-[0_0_15px_rgba(244,63,94,0.2)] hover:shadow-[0_0_20px_rgba(244,63,94,0.35)] transition-all duration-300 py-2.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:from-slate-800 disabled:to-slate-900 disabled:shadow-none"
              >
                <ShieldCheck size={14} aria-hidden="true" />
                核对并通过
              </button>
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend || status === "sending"}
                title={sendDisabledReason}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-xs font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all duration-300 py-2.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:from-slate-800 disabled:to-slate-900 disabled:shadow-none"
              >
                <Send size={14} aria-hidden="true" />
                {status === "sending" ? "发布同步中" : "发布至飞书群"}
              </button>
            </div>

            <button
              type="button"
              onClick={onCreatePrdDoc}
              disabled={!canCreatePrdDoc || isCreatingPrdDoc}
              title={getCreateDocDisabledReason(hasDraft, feishuDocumentConfigured, status, canCreatePrdDoc)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#121826] hover:bg-slate-800/60 hover:text-slate-100 hover:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-350 disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-slate-900 transition-all"
            >
              <FileText size={14} aria-hidden="true" />
              {isCreatingPrdDoc ? "正在创建云文档..." : prdDocumentUrl ? "重新生成云 PRD" : "一键生成飞书云 PRD 文档"}
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onCopy}
                disabled={!message.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-[#121826]/80 px-3 py-2 text-xs font-semibold text-slate-450 hover:text-slate-200 hover:bg-[#182033] hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-30 transition-all"
              >
                <Copy size={13} aria-hidden="true" />
                复制摘要
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={!hasDraft || status === "sending"}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-[#121826]/80 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-300 hover:bg-[#182033] hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-30 transition-all"
              >
                <XCircle size={13} aria-hidden="true" />
                重置放弃
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function getCreateDocDisabledReason(hasDraft: boolean, feishuDocumentConfigured: boolean, status: ApprovalStatus, canCreatePrdDoc: boolean) {
  if (!hasDraft) return "请先分析用户反馈并生成 PRD 草稿。"
  if (!feishuDocumentConfigured) return "请配置 FEISHU_APP_ID 与 FEISHU_APP_SECRET 凭证。"
  if (status !== "approved" && status !== "sent" && status !== "failed") return "请先点击“核对并通过”对草稿完成确认授权。"
  if (!canCreatePrdDoc) return "当前状态无法创建云文档。"
  return "点击自动生成飞书云 PRD 文档"
}

function getSendDisabledReason(
  message: string,
  hasDraft: boolean,
  webhookConfigured: boolean,
  canSend: boolean,
  status: ApprovalStatus,
) {
  if (!hasDraft) return "请先分析用户反馈并生成草稿。"
  if (!message.trim()) return "当前预览消息为空。"
  if (!webhookConfigured) return "请配置 FEISHU_BOT_WEBHOOK 自定义群机器人凭证。"
  if (status !== "approved" && status !== "failed") return "请先点击“核对并通过”对草稿完成确认授权。"
  if (!canSend) return "已发送完毕或暂无可发送草稿。"
  return "点击发送评审消息至飞书群"
}

function getStatusMeta(status: ApprovalStatus, hasDraft: boolean) {
  if (!hasDraft) {
    return {
      label: "等待 AI 分析生成草稿...",
      className: "bg-slate-800/40 border-slate-750 text-slate-500",
    }
  }

  const statusMap: Record<ApprovalStatus, { label: string; className: string }> = {
    draft_generated: {
      label: "草稿就绪，等待核对授权",
      className: "bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-[inset_0_0_12px_rgba(245,158,11,0.05)]",
    },
    user_editing: {
      label: "用户编辑中，等待重新核对",
      className: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    },
    approved: {
      label: "已通过审核，可同步/派发",
      className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[inset_0_0_12px_rgba(16,185,129,0.05)]",
    },
    sending: {
      label: "正在向飞书群派发消息...",
      className: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    },
    sent: {
      label: "✓ 评审摘要已发布至飞书群",
      className: "bg-[#10b981]/15 border-[#10b981]/25 text-[#10b981]",
    },
    failed: {
      label: "✗ 飞书群发同步失败，请重试",
      className: "bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[inset_0_0_12px_rgba(244,63,94,0.05)]",
    },
    cancelled: {
      label: "已重置，当前草稿保留在本地",
      className: "bg-slate-800 border-slate-750 text-slate-500",
    },
  }

  return statusMap[status]
}
