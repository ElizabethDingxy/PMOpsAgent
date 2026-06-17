import { NextResponse } from "next/server"
import { getFeishuBitableRuntimeConfig } from "@/lib/feishu/bitableFeedback"
import { getFeishuDocumentRuntimeConfig } from "@/lib/feishu/createPrdDocument"
import { getFeishuEventBotRuntimeConfig } from "@/lib/feishu/eventBot"
import { getFeishuOAuthRuntimeConfig, hasFeishuOAuthToken } from "@/lib/feishu/oauth"
import { getFeishuWebhookConfig } from "@/lib/feishu/sendWebhook"
import { getTapdRuntimeConfig } from "@/lib/tapd/createTapdWorkItems"
import { getEmbeddingEngineStatus } from "@/lib/llm/embeddingClient"

export async function GET() {
  const feishuConfig = getFeishuWebhookConfig()
  const bitableConfig = getFeishuBitableRuntimeConfig()
  const documentConfig = getFeishuDocumentRuntimeConfig()
  const eventBotConfig = getFeishuEventBotRuntimeConfig()
  const oauthConfig = getFeishuOAuthRuntimeConfig()
  const tapdConfig = getTapdRuntimeConfig()
  const embeddingStatus = getEmbeddingEngineStatus()

  return NextResponse.json({
    ok: true,
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    feishuWebhookConfigured: feishuConfig.webhookConfigured,
    feishuSecretConfigured: feishuConfig.secretConfigured,
    feishuBitableConfigured: bitableConfig.configured,
    feishuBitableBaseConfigured: bitableConfig.baseConfigured,
    feishuBitableWorkspaceConfigured: bitableConfig.workspaceConfigured,
    feishuBitableViewConfigured: bitableConfig.viewIdConfigured,
    feishuDocumentConfigured: documentConfig.configured,
    feishuDocumentFolderConfigured: documentConfig.folderTokenConfigured,
    feishuDocumentBaseUrlConfigured: documentConfig.baseUrlConfigured,
    feishuEventBotConfigured: eventBotConfig.configured,
    feishuEventVerificationTokenConfigured: eventBotConfig.verificationTokenConfigured,
    feishuOAuthConfigured: oauthConfig.configured,
    feishuOAuthRedirectUriConfigured: oauthConfig.redirectUriConfigured,
    feishuOAuthAuthorized: await hasFeishuOAuthToken(),
    tapdConfigured: tapdConfig.configured,
    tapdCompanyConfigured: tapdConfig.companyConfigured,
    tapdWorkspaceConfigured: tapdConfig.workspaceConfigured,
    tapdOwnerConfigured: tapdConfig.ownerConfigured,
    tapdIterationConfigured: tapdConfig.iterationConfigured,
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    embeddingConfigured: embeddingStatus.configured,
    embeddingEngine: embeddingStatus.engine,
    embeddingModel: embeddingStatus.model,
  })
}
