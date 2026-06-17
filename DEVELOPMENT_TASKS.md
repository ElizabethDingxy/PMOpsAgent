# PMOps Agent Demo 开发任务清单

本文档用于跟踪第一个最小可演示版本的开发进度，避免后续遗漏范围、边界和验收点。

## 当前目标

本地跑通一个最小闭环：

```text
CSV 用户反馈上传
→ Agent 分析用户反馈
→ 生成需求主题、MVP 范围、RICE 优先级
→ 生成 PRD 草稿与研发任务草稿
→ 展示 trace
→ 用户确认
→ 发送飞书群机器人评审摘要
```

第一版只接入飞书自定义机器人 webhook，不接入飞书 OAuth、多维表格、飞书文档、TAPD、Gitee 或真实任务创建。

后续迭代任务已整理到 `ROADMAP.md`，之后可以按路线图继续逐步执行。

## 开发步骤

### Step 1：搭建页面和基础布局

状态：已完成

已完成：

- [x] 初始化 Next.js App Router + TypeScript + Tailwind CSS 基础结构
- [x] 创建首页
- [x] 创建上传区域
- [x] 创建 Agent trace 区域
- [x] 创建结果预览区域
- [x] 创建审批与飞书发送区域
- [x] 使用静态 mock 数据填充页面
- [x] 拆分基础组件：`UploadPanel`、`AgentTrace`、`InsightCards`、`PrdPreview`、`TaskPreview`、`ApprovalPanel`
- [x] 定义基础类型：`TraceEvent`、`AgentResult` 等
- [x] 通过 `npm run typecheck`
- [x] 通过 `npm run build`

备注：

- 当前页面仍是静态 mock 展示。
- `npm run dev` 前台可启动到 `http://localhost:3000`。
- 后台常驻启动受当前沙箱环境限制，用户本地运行命令即可访问。

### Step 2：实现 CSV 解析

状态：已完成

已完成：

- [x] 添加 `data/sample-feedback.csv`
- [x] 实现上传 CSV
- [x] 实现加载示例 CSV
- [x] 实现 `parseFeedbackCsv.ts`
- [x] 将 CSV 转换为 `FeedbackItem[]`
- [x] 校验 CSV 为空
- [x] 校验缺少 `content` 字段
- [x] 校验反馈少于 3 条
- [x] 在 UI 展示已读取反馈数量
- [x] 展示清晰错误信息

备注：

- 新增 `/api/sample-feedback` 用于从服务端读取 `data/sample-feedback.csv`。
- 前端上传解析暂时只进入本地状态，不调用 LLM。
- “开始分析”按钮已在 Step 4 接入 `/api/analyze`。

### Step 3：实现 Agent 结果结构

状态：已完成

已完成：

- [x] 定义 `AgentResult` 相关 TypeScript 类型
- [x] 添加静态 `mockResult`
- [x] 初版结果展示组件
- [x] 补齐 `src/lib/agent/schemas.ts`
- [x] 明确 mock mode 标记字段或接口返回标记
- [x] 将展示组件接入 Agent run 状态，后续可替换为真实 API 返回数据
- [x] 保证 mock 结果不会被伪装成真实 LLM 输出

备注：

- 新增 `AgentRun`，包含 `mode`、`isMock`、`message`、`generatedAt`。
- 新增 `createMockAgentRun()`，统一生成带 mock 标记的演示结果。
- 新增 `parseAgentResultJson()`、`assertAgentResult()`、`validateAgentResult()`，供 Step 4 校验 LLM JSON 输出。
- 页面结果区现在必须点击“开始分析”后才展示 mock 分析结果，并明确显示 `mode: mock`。

### Step 4：接入 LLM

状态：已完成

已完成：

- [x] 创建 `.env.example`
- [x] 实现 `src/lib/llm/deepseekClient.ts`
- [x] 实现 `src/lib/agent/prompts.ts`
- [x] 实现 `src/lib/agent/runAgent.ts`
- [x] 实现 `/api/analyze`
- [x] 支持 `DEEPSEEK_API_KEY` 缺失时进入 mock mode
- [x] 支持 LLM 请求超时
- [x] 支持 LLM 返回非 JSON 时 retry 一次
- [x] retry 后仍失败时返回结构化错误
- [x] 不在 API route 中散落 prompt

备注：

- API Key 放在项目根目录 `.env.local` 的 `DEEPSEEK_API_KEY` 中，不提交到 Git。
- `.env.example` 只保存变量名和默认地址，不保存真实密钥。
- `/api/analyze` 返回 `{ ok: true, result, run }`，同时保留 AGENTS.md 要求的 `result` 字段，并额外返回带模式标记的 `run`。
- 没有配置 `DEEPSEEK_API_KEY` 时，`runAgent()` 会返回 `mode: mock`，UI 会明确展示 Mock 模式。
- LLM 输出会通过 `parseAgentResultJson()` 做结构校验；失败后会再请求一次修复 JSON。

### Step 5：实现 trace

状态：已完成

已完成：

- [x] 创建 `src/lib/trace/traceTypes.ts`
- [x] 创建 `src/lib/trace/traceStore.ts`
- [x] 在 `runAgent.ts` 中生成真实 trace
- [x] 包含 `feedback_loaded`
- [x] 包含 `insights_generated`
- [x] 包含 `mvp_generated`
- [x] 包含 `prd_generated`
- [x] 包含 `tasks_generated`
- [x] 包含 `waiting_for_approval`
- [x] 包含 `send_feishu` 待确认占位
- [x] 前端展示运行中、成功、失败、等待审批状态
- [x] 失败时展示哪一步失败、为什么失败、如何修复

备注：

- `traceTypes.ts` 统一提供 `createTraceEvent()` 与前端可用的 `createClientTraceEvent()`。
- `traceStore.ts` 当前使用内存 Map 保存 runId 到 trace events 的映射，满足第一版无数据库要求。
- `/api/analyze` 失败时会返回 `error.trace`，前端会把 failed trace 展示在 `AgentTrace` 中。
- 前端点击“开始分析”后，会先展示本地 running/pending trace；服务端返回后替换为真实 trace。
- 成功 trace 顺序为：读取反馈、分析需求、生成需求主题、生成 MVP 范围、生成 PRD、拆解任务、等待审批、发送飞书待确认。

### Step 6：实现飞书发送

状态：已完成

已完成：

- [x] 实现 `src/lib/feishu/sendWebhook.ts`
- [x] 实现 `/api/send-feishu`
- [x] 只支持飞书文本消息
- [x] 从服务端环境变量读取 `FEISHU_BOT_WEBHOOK`
- [x] `FEISHU_BOT_WEBHOOK` 缺失时禁用发送按钮
- [x] 发送前展示完整飞书摘要
- [x] 必须由用户点击确认后才发送
- [x] 发送成功后显示已发送状态
- [x] 发送失败后显示清晰错误
- [x] 不打印完整 webhook
- [x] 不把 webhook 暴露给前端
- [x] 为 `FEISHU_BOT_SECRET` 预留结构，但第一版不实现签名校验

备注：

- 飞书 webhook 配置在项目根目录 `.env.local` 的 `FEISHU_BOT_WEBHOOK`，前端只能看到是否已配置，不能看到完整 webhook。
- `/api/send-feishu` 请求格式为 `{ message, runId }`，成功返回 `{ ok: true, trace }`。
- 发送成功会追加 `feishu_message_sent` trace，发送失败会追加 `feishu_message_failed` trace。
- 审批面板支持发送、复制摘要、取消；取消不会调用任何外部工具。
- 第一版仅发送文本消息，不实现飞书签名校验和卡片交互。

### Step 7：打磨 demo

状态：已完成

已完成：

- [x] 创建或更新 `README.md`
- [x] README 包含项目介绍
- [x] README 包含本地运行步骤
- [x] README 包含环境变量配置
- [x] README 包含如何创建飞书自定义机器人
- [x] README 包含如何加载示例数据
- [x] README 包含如何运行 demo
- [x] README 包含 Mock 模式说明
- [x] README 包含已实现功能
- [x] README 包含未实现功能
- [x] README 包含下一步计划
- [x] 补齐空状态
- [x] 补齐加载状态
- [x] 补齐复制摘要按钮逻辑
- [x] 检查页面移动端不重叠
- [x] 最终运行 `npm run typecheck`
- [x] 最终运行 `npm run build`

备注：

- README 已说明第一版只接入飞书群机器人 webhook。
- README 已说明飞书多维表格、飞书文档、TAPD、Gitee 属于后续版本。
- 页面使用响应式单列/多列布局，移动端会按列堆叠，避免固定宽度导致主要内容重叠。

## 安全边界

- [x] Agent 不能自动发送飞书消息
- [x] 飞书消息发送前必须用户确认
- [x] 发送前展示完整消息内容
- [x] 用户可以复制、取消或发送
- [x] 不保存真实密钥
- [x] 不在前端显示完整 webhook
- [x] 不把用户反馈上传到除 LLM API 之外的任何地方
- [x] 不做自动创建文档、创建任务、发群消息的链式执行

## 最终验收

- [x] 可以本地启动
- [x] 可以加载示例 CSV
- [x] 可以上传 CSV
- [x] 可以调用 LLM 或 mock mode 生成结果
- [x] 可以展示 Agent trace
- [x] 可以展示需求聚类
- [x] 可以展示 MVP 范围
- [x] 可以展示 RICE 优先级
- [x] 可以展示 PRD 草稿
- [x] 可以展示研发任务草稿
- [x] 可以在用户确认后发送飞书群机器人消息
- [x] 飞书 webhook 未配置时不会崩溃
- [x] TypeScript 无明显类型错误
- [x] 关键逻辑拆分成模块
- [x] 没有把密钥写入代码
- [x] API route 有错误处理
- [x] README 说明如何运行
- [x] `.env.example` 完整
