# AGENTS.md

# PMOpsAgent 最小 Demo 开发说明

你是本项目的 AI Coding Agent。请按照本文档构建第一个最小可演示版本，不要扩大范围，不要擅自接入复杂平台。目标是在本地跑通一个“从用户反馈到 PRD 与任务草稿，并发送飞书评审摘要”的 AI 产品经理 Agent demo。

本项目面向面试作品展示，重点不是功能多，而是展示 Agent 产品的核心能力：

1. 能读取用户反馈。
2. 能分析需求主题。
3. 能判断 MVP 范围。
4. 能生成 PRD 草稿。
5. 能拆解研发任务。
6. 能展示执行过程 trace。
7. 能在写入飞书前请求用户确认。
8. 能通过飞书群机器人发送评审摘要。

---

## 1. 项目一句话定位

PMOpsAgent 是一个面向中国团队的 AI 产品经理助手。用户上传一批用户反馈后，Agent 会自动聚类需求、提炼产品机会、判断 MVP 范围、生成 PRD 草稿、拆解研发任务，并在用户确认后把评审摘要发送到飞书群。

---

## 2. 第一版只做什么

第一版只做最小闭环：

```text
CSV 用户反馈上传
↓
Agent 分析用户反馈
↓
生成需求主题
↓
生成 MVP 范围
↓
生成 RICE 优先级
↓
生成 PRD 草稿
↓
生成研发任务草稿
↓
展示 trace
↓
用户点击确认
↓
发送飞书群机器人消息
```

第一版只接入一个真实外部工具：

```text
飞书自定义机器人 webhook
```

不要在第一版接入：

```text
飞书自建应用
飞书 OAuth
飞书多维表格 API
飞书文档 API
飞书任务 API
TAPD
Gitee
MasterGo
Pixso
神策
GrowingIO
日历
事件订阅
飞书卡片交互
```

这些都属于第二阶段或第三阶段。

---

## 3. 第一版技术栈

请优先使用一个简单、容易本地运行的全栈方案。

推荐：

```text
Next.js App Router
TypeScript
Tailwind CSS
API Routes
DeepSeek API 或兼容 OpenAI 格式的 LLM API
飞书群机器人 webhook
本地 JSON 文件或内存状态保存 trace
```

不要引入复杂后端，除非已有项目结构要求。

第一版不需要数据库。可以把每次运行的结果保存在内存中，或者保存到 `data/runs/*.json`。

---

## 4. 环境变量

请创建 `.env.example`，包含：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

FEISHU_BOT_WEBHOOK=
FEISHU_BOT_SECRET=

NEXT_PUBLIC_APP_NAME=PMOpsAgent
```

要求：

1. 不要把真实密钥写进代码。
2. 不要提交 `.env`。
3. 如果 `DEEPSEEK_API_KEY` 缺失，允许进入 demo mock mode，但 UI 必须明确显示“当前为 Mock 模式”。
4. 如果 `FEISHU_BOT_WEBHOOK` 缺失，发送按钮要禁用，并提示用户配置 webhook。
5. `FEISHU_BOT_SECRET` 第一版可以先不实现签名校验，但代码结构要预留。

---

## 5. 推荐目录结构

请按下面结构组织代码：

```text
src/
  app/
    page.tsx
    api/
      analyze/
        route.ts
      send-feishu/
        route.ts
  components/
    UploadPanel.tsx
    AgentTrace.tsx
    InsightCards.tsx
    PrdPreview.tsx
    TaskPreview.tsx
    ApprovalPanel.tsx
  lib/
    agent/
      runAgent.ts
      prompts.ts
      schemas.ts
      mockResult.ts
    llm/
      deepseekClient.ts
    feishu/
      sendWebhook.ts
    csv/
      parseFeedbackCsv.ts
    trace/
      traceTypes.ts
      traceStore.ts
  types/
    product.ts
    agent.ts
  data/
    sample-feedback.csv
```

如果项目使用不同框架，也请保持同样的模块边界：

```text
UI
API
Agent orchestration
LLM client
CSV parser
Feishu tool
Trace store
Type definitions
```

---

## 6. 示例 CSV 格式

请在 `data/sample-feedback.csv` 中放一份样例数据，方便本地演示。

字段：

```csv
id,user_type,source,content,created_at
F001,应届生,访谈,我不知道为什么简历投出去没有回应,2026-06-01
F002,转行求职者,社群,每个岗位都要改简历太麻烦了,2026-06-01
F003,应届生,问卷,我看不懂岗位 JD 里哪些要求最重要,2026-06-02
F004,社招,客服,希望知道我的简历和岗位差在哪里,2026-06-02
F005,应届生,访谈,我想要一个匹配评分告诉我能不能投,2026-06-03
F006,海外求职者,社群,不同岗位的关键词不一样，我不知道怎么调整简历,2026-06-03
F007,转行求职者,问卷,我不想让 AI 自动乱改我的简历，只想给建议,2026-06-03
F008,应届生,客服,我希望能导出一份修改建议给自己慢慢改,2026-06-04
```

CSV 解析后转换为：

```ts
type FeedbackItem = {
  id: string
  userType?: string
  source?: string
  content: string
  createdAt?: string
}
```

---

## 7. Agent 输出结构

Agent 的输出必须是结构化 JSON。不要只生成一大段 Markdown。

请定义：

```ts
type AgentResult = {
  productName: string
  summary: string
  demandClusters: DemandCluster[]
  mvpScope: MvpScope
  ricePrioritization: RiceItem[]
  prd: PrdDraft
  engineeringTasks: EngineeringTask[]
  feishuReviewMessage: string
  risks: RiskItem[]
  openQuestions: string[]
  trace: TraceEvent[]
}
```

其中：

```ts
type DemandCluster = {
  title: string
  description: string
  evidenceFeedbackIds: string[]
  frequency: number
  userPain: string
  productOpportunity: string
  confidence: number
}
```

```ts
type MvpScope = {
  mustHave: string[]
  shouldHave: string[]
  outOfScope: {
    feature: string
    reason: string
  }[]
}
```

```ts
type RiceItem = {
  feature: string
  reach: number
  impact: number
  confidence: number
  effort: number
  score: number
  priority: "P0" | "P1" | "P2" | "Out"
  rationale: string
}
```

```ts
type PrdDraft = {
  title: string
  background: string
  targetUsers: string[]
  problemStatement: string
  goals: string[]
  nonGoals: string[]
  userStories: string[]
  functionalRequirements: string[]
  successMetrics: string[]
  trackingPlan: {
    eventName: string
    trigger: string
    properties: string[]
    purpose: string
  }[]
}
```

```ts
type EngineeringTask = {
  type: "Epic" | "Story" | "Task"
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: "P0" | "P1" | "P2"
  dependsOn?: string[]
}
```

```ts
type RiskItem = {
  risk: string
  level: "low" | "medium" | "high"
  mitigation: string
}
```

```ts
type TraceEvent = {
  id: string
  step: string
  status: "pending" | "running" | "success" | "failed" | "waiting_approval"
  message: string
  timestamp: string
  metadata?: Record<string, unknown>
}
```

---

## 8. Agent 运行步骤

`runAgent.ts` 需要实现一个清晰的执行流。

步骤如下：

```text
1. validate input
2. parse feedback
3. create trace event: feedback_loaded
4. call LLM to analyze feedback
5. validate LLM JSON result
6. create trace event: insights_generated
7. create trace event: prd_generated
8. create trace event: tasks_generated
9. create trace event: waiting_for_approval
10. return AgentResult
```

注意：

1. 第一版不需要真正多 Agent。
2. 可以用一个 LLM 调用完成分析。
3. 代码结构上要保留未来拆分成 Research Agent、Strategy Agent、PRD Agent、Delivery Agent 的可能性。
4. 如果 LLM 返回的 JSON 解析失败，需要展示错误，并使用一次 retry。
5. retry 后仍失败，要返回清晰错误，不要白屏。

---

## 9. Prompt 要求

请在 `src/lib/agent/prompts.ts` 中维护 prompt，不要散落在 API route 里。

Prompt 目标：

```text
你是 AI 产品经理 Agent。
你的任务是基于用户反馈，生成产品需求洞察、MVP 范围、RICE 优先级、PRD 草稿、研发任务草稿和飞书评审摘要。
```

Prompt 必须强调：

1. 不要编造不存在的用户反馈。
2. 所有需求主题必须引用 feedback id。
3. 必须区分 MVP 必做、可选、暂不做。
4. 暂不做的功能必须说明原因。
5. 输出必须是合法 JSON。
6. 不要输出 Markdown 包裹。
7. 不要写代码块。
8. 不要生成与用户反馈无关的功能。
9. 如果信息不足，要放入 `openQuestions`。
10. 飞书摘要要简洁，适合发到团队群。

---

## 10. 页面设计

首页只需要一个页面，但要有完整演示感。

页面布局建议：

```text
顶部：产品名 PMOpsAgent
左侧：CSV 上传 + 示例数据按钮 + 运行分析按钮
中间：Agent 工作流 trace
右侧：结果预览
底部：审批与发送飞书按钮
```

组件要求：

### UploadPanel

功能：

1. 上传 CSV。
2. 加载 sample-feedback.csv。
3. 显示已读取的反馈数量。
4. 点击“开始分析”。

### AgentTrace

展示每一步状态：

```text
读取反馈
分析需求
生成 MVP 范围
生成 PRD
拆解任务
等待审批
发送飞书
```

每个 trace event 显示：

```text
状态
步骤名
说明
时间
```

### InsightCards

展示：

1. 需求主题。
2. 频次。
3. 证据 feedback id。
4. 用户痛点。
5. 产品机会。
6. 置信度。

### PrdPreview

展示 PRD 草稿：

1. 背景。
2. 目标用户。
3. 用户问题。
4. 目标。
5. 非目标。
6. 功能需求。
7. 成功指标。
8. 埋点方案。

### TaskPreview

展示研发任务：

1. Epic。
2. Story。
3. Task。
4. 验收标准。
5. 优先级。

### ApprovalPanel

展示：

```text
Agent 准备发送飞书评审摘要。
这会向飞书群发送一条消息。
请确认是否发送。
```

按钮：

```text
发送到飞书
复制摘要
取消
```

写入飞书前必须有用户点击确认。不要自动发送。

---

## 11. API 设计

### POST `/api/analyze`

请求：

```ts
{
  feedbackItems: FeedbackItem[],
  productHint?: string
}
```

返回：

```ts
{
  ok: true,
  result: AgentResult
}
```

失败返回：

```ts
{
  ok: false,
  error: {
    code: string,
    message: string
  }
}
```

### POST `/api/send-feishu`

请求：

```ts
{
  message: string
}
```

行为：

1. 检查 `FEISHU_BOT_WEBHOOK`。
2. 调用飞书自定义机器人 webhook。
3. 返回发送结果。
4. 写入 trace event: feishu_message_sent 或 feishu_message_failed。

返回：

```ts
{
  ok: true
}
```

失败：

```ts
{
  ok: false,
  error: {
    code: string,
    message: string
  }
}
```

---

## 12. 飞书机器人工具

在 `src/lib/feishu/sendWebhook.ts` 中实现。

第一版只支持文本消息即可。

函数：

```ts
export async function sendFeishuTextMessage(message: string): Promise<void>
```

要求：

1. 从环境变量读取 `FEISHU_BOT_WEBHOOK`。
2. 如果没有配置，抛出明确错误。
3. 使用 `fetch` POST。
4. 设置 timeout。
5. 处理飞书返回错误。
6. 不要在日志里打印完整 webhook。
7. 不要把 webhook 暴露给前端。

请求格式先使用飞书文本消息格式：

```json
{
  "msg_type": "text",
  "content": {
    "text": "message"
  }
}
```

如果实现签名校验，放到第二阶段。

---

## 13. Mock 模式

为了保证面试 demo 稳定，允许提供 mock mode，但必须诚实标注。

触发条件：

```text
DEEPSEEK_API_KEY 未配置
或
用户点击“使用示例 Mock 结果”
```

Mock 结果文件：

```text
src/lib/agent/mockResult.ts
```

UI 必须显示：

```text
当前为 Mock 模式：结果用于演示界面流程，不代表真实模型分析。
```

禁止把 mock 结果伪装成真实 LLM 输出。

---

## 14. 错误处理

必须处理这些情况：

1. CSV 为空。
2. CSV 没有 `content` 字段。
3. 用户反馈少于 3 条。
4. LLM API key 缺失。
5. LLM 请求超时。
6. LLM 返回非 JSON。
7. 飞书 webhook 未配置。
8. 飞书发送失败。
9. 网络异常。

错误展示要求：

```text
哪一步失败了
为什么失败
用户可以怎么修复
```

不要只显示：

```text
Something went wrong
```

---

## 15. 安全边界

第一版虽然简单，但必须体现 Agent 安全边界。

规则：

1. Agent 不能自动发送飞书消息。
2. 必须由用户点击“发送到飞书”。
3. 飞书消息发送前要展示完整消息内容。
4. 用户可以复制、取消或发送。
5. 不要上传用户反馈到除 LLM API 之外的任何地方。
6. 不要保存真实密钥。
7. 不要把 webhook 打印到浏览器控制台。
8. 不要在 UI 中显示完整 webhook。
9. 不要做自动创建文档、创建任务、发群消息的链式执行。

---

## 16. 第一个 demo 的演示脚本

完成后，demo 应该能按下面流程演示：

```text
1. 打开本地网页。
2. 点击“加载示例反馈”。
3. 页面显示 8 条用户反馈。
4. 点击“开始分析”。
5. Agent trace 开始变化。
6. 页面展示需求主题。
7. 页面展示 MVP 范围。
8. 页面展示 RICE 优先级。
9. 页面展示 PRD 草稿。
10. 页面展示研发任务草稿。
11. 页面进入“等待审批”状态。
12. 用户查看飞书摘要。
13. 用户点击“发送到飞书”。
14. 飞书群收到评审摘要。
15. 页面显示“已发送”。
```

---

## 17. 验收标准

只有满足以下标准，才算第一个最小 demo 完成。

### 功能验收

* 可以本地启动。
* 可以加载示例 CSV。
* 可以上传 CSV。
* 可以调用 LLM 或 mock mode 生成结果。
* 可以展示 Agent trace。
* 可以展示需求聚类。
* 可以展示 MVP 范围。
* 可以展示 RICE 优先级。
* 可以展示 PRD 草稿。
* 可以展示研发任务草稿。
* 可以在用户确认后发送飞书群机器人消息。
* 飞书 webhook 未配置时，不会崩溃。

### 产品验收

* 用户能一眼看懂 Agent 在做什么。
* 用户能看到每一步过程。
* 用户能看到为什么推荐某些功能。
* 用户能看到哪些功能不建议进入 MVP。
* 用户能在发送飞书前确认内容。
* 不会把普通 PRD 生成器伪装成完整自动化 Agent。

### 代码验收

* TypeScript 无明显类型错误。
* 关键逻辑拆分成模块。
* 没有把密钥写入代码。
* 没有把 webhook 暴露给前端。
* API route 有错误处理。
* README 说明如何运行。
* `.env.example` 完整。

---

## 18. README 需要包含

请创建或更新 `README.md`，包含：

```text
项目介绍
本地运行步骤
环境变量配置
如何创建飞书自定义机器人
如何加载示例数据
如何运行 demo
Mock 模式说明
已实现功能
未实现功能
下一步计划
```

README 中要明确说明：

```text
第一版只接入飞书群机器人 webhook。
飞书多维表格、飞书文档、TAPD、Gitee 属于后续版本。
```

---

## 19. 开发顺序

请按顺序开发，不要跳步。

### Step 1：搭建页面和基础布局

实现：

```text
首页
上传区域
结果区域
trace 区域
审批区域
```

先用静态 mock 数据填充。

### Step 2：实现 CSV 解析

实现：

```text
上传 CSV
加载 sample CSV
解析为 FeedbackItem[]
基础字段校验
```

### Step 3：实现 Agent 结果结构

实现：

```text
AgentResult 类型
mockResult
结果展示组件
```

### Step 4：接入 LLM

实现：

```text
DeepSeek client
prompt
/api/analyze
JSON 解析
一次 retry
错误处理
```

### Step 5：实现 trace

实现：

```text
trace event 类型
前端 trace 展示
运行过程状态变化
失败状态展示
```

### Step 6：实现飞书发送

实现：

```text
sendWebhook.ts
/api/send-feishu
审批按钮
发送成功/失败提示
```

### Step 7：打磨 demo

实现：

```text
README
.env.example
示例数据
空状态
错误提示
加载状态
复制摘要按钮
```

---

## 20. 不要做的事情

为了保证第一个 demo 能完成，请不要做：

1. 不要接飞书 OAuth。
2. 不要接飞书事件订阅。
3. 不要做飞书卡片交互。
4. 不要接飞书多维表格。
5. 不要接飞书文档 API。
6. 不要接 TAPD。
7. 不要接 Gitee。
8. 不要做数据库登录系统。
9. 不要做多用户权限。
10. 不要做复杂多 Agent 调度。
11. 不要做浏览器自动化。
12. 不要做真实任务创建。
13. 不要做自动发送消息。
14. 不要为了视觉效果写死假工具调用。
15. 不要把 mock 结果伪装成真实结果。

---

## 21. 后续版本规划

第一版完成后，后续可以按这个顺序扩展：

### V1.1

```text
飞书多维表格读取用户反馈
```

### V1.2

```text
飞书文档创建 PRD
```

### V1.3

```text
Gitee Issues 创建任务
```

### V1.4

```text
TAPD 需求与任务创建
```

### V1.5

```text
MasterGo / Pixso 设计 Brief
```

### V2.0

```text
完整 PMOpsAgent：
反馈读取
竞品调研
PRD 创建
任务创建
团队通知
审批流
trace 回放
```

---

## 22. 最终目标

第一个 demo 的目标不是做一个完整产品，而是让面试官看到：

1. 这是一个 Agent 工作流，不是普通聊天框。
2. 它能基于用户反馈做产品判断。
3. 它能生成 PRD 和任务。
4. 它有 trace。
5. 它有审批。
6. 它能调用真实外部工具飞书机器人。
7. 它有明确边界和后续扩展路线。

请优先保证这个最小闭环稳定、清楚、可演示。
