# PMOpsAgent

PMOpsAgent 是一个面向中国团队的 AI 产品经理助手 Demo。它可以读取用户反馈，生成需求洞察、MVP 范围、RICE 优先级、PRD 草稿、研发任务草稿，并在用户确认后发送飞书评审摘要。

## 已实现功能

- CSV 用户反馈上传与字段校验
- 示例反馈与示例指标加载
- DeepSeek API 分析用户反馈
- DeepSeek API key 缺失时自动进入 Mock 模式
- 多 Agent 串行分工：Research、Strategy、PRD、Delivery、Orchestrator
- 结构化 Agent 输出校验与 JSON 修复重试
- 需求主题、MVP 范围、RICE 优先级展示
- PRD 草稿展示与编辑
- 研发任务草稿展示与编辑
- 飞书评审摘要展示、编辑与复制
- Agent trace 展示
- 本地历史运行保存与回放
- 产品上下文记忆与模糊搜索
- 发送飞书前人工审批
- 编辑草稿后重新要求确认
- 飞书自定义机器人 webhook 文本消息发送
- webhook 未配置时禁用发送按钮
- 飞书群内 @机器人 `help` / `status` 回复
- 飞书群内 @机器人触发示例反馈或飞书多维表格分析
- 飞书群内自然语言意图路由
- 飞书 OAuth 授权后搜索用户可访问的多维表格 Base
- 飞书多维表格读取用户反馈
- 用户确认后创建飞书 PRD 文档
- 用户确认后创建 TAPD 需求与任务

## 本地运行

安装依赖：

```bash
npm install
```

创建本地环境变量文件：

```bash
copy .env.example .env.local
```

启动开发服务：

```bash
npm run dev
```

打开页面：

```text
http://localhost:3000
```

修改 `.env.local` 后需要重启 `npm run dev`。

## 环境变量

最小可运行配置：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

FEISHU_BOT_WEBHOOK=
FEISHU_BOT_SECRET=

NEXT_PUBLIC_APP_NAME=PMOpsAgent
```

如果不配置 `DEEPSEEK_API_KEY`，系统会进入 Mock 模式。Mock 模式会在页面中明确标注，结果仅用于演示流程。

如果不配置 `FEISHU_BOT_WEBHOOK`，飞书发送按钮会禁用，页面不会崩溃。

完整环境变量请参考 `.env.example`。不要提交 `.env.local`，不要把真实密钥写进代码。

## 基础 Demo 用法

1. 打开 `http://localhost:3000`。
2. 点击“加载示例反馈”，或上传一份 CSV。
3. 可选点击“加载示例指标”。
4. 点击“开始分析”。
5. 查看 Agent trace、需求主题、MVP 范围、RICE 优先级、PRD 草稿和研发任务草稿。
6. 按需编辑 PRD、任务或飞书摘要。
7. 点击“确认通过”。
8. 点击“发送到飞书”，或点击“复制摘要”。

发送飞书、创建飞书 PRD、创建 TAPD 需求与任务都必须先由用户确认。Agent 不会自动执行这些写操作。

## CSV 格式

反馈 CSV 至少需要 3 条有效反馈，并包含 `content` 字段。

```csv
id,user_type,source,content,created_at
F001,应届生,访谈,我不知道为什么简历投出去没有回应,2026-06-01
```

字段说明：

- `id`：反馈 ID
- `user_type`：用户类型
- `source`：反馈来源
- `content`：反馈内容，必填
- `created_at`：反馈时间

可直接使用这些示例文件：

- `data/sample-feedback.csv`
- `data/demo-resume-feedback.csv`
- `data/demo-saas-feedback.csv`
- `data/demo-education-feedback.csv`

也可以使用错误示例验证提示：

- `data/demo-invalid-too-few.csv`
- `data/demo-invalid-missing-content.csv`

## 飞书 webhook 用法

1. 打开一个飞书群聊。
2. 进入群设置，添加自定义机器人。
3. 复制机器人 webhook。
4. 写入 `.env.local`：

```env
FEISHU_BOT_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

5. 重启 `npm run dev`。
6. 页面完成分析并确认通过后，点击“发送到飞书”。

第一版 webhook 发送只支持文本消息。`FEISHU_BOT_SECRET` 已预留，当前可以留空。

## 飞书群内 @机器人用法

群内 @机器人需要飞书自建应用、事件订阅和公网 HTTPS 回调地址。事件入口：

```text
https://你的公网域名/api/feishu/events
```

卡片回调入口：

```text
https://你的公网域名/api/feishu/card-actions
```

常用指令：

```text
@PMOpsAgent help
@PMOpsAgent status
@PMOpsAgent 授权链接
@PMOpsAgent 授权状态
@PMOpsAgent 列出我的 Base
@PMOpsAgent 搜索 Base 简历
@PMOpsAgent 列出表格
@PMOpsAgent 列出空间表格
@PMOpsAgent 分析 示例反馈
@PMOpsAgent 分析 用户反馈
@PMOpsAgent 分析 Base名/用户反馈
@PMOpsAgent 分析 https://xxx.feishu.cn/base/app_token?table=tblxxx&view=vewxxx
```

群聊分析完成后会返回审批卡片。通过分析、创建 PRD、创建 TAPD 等写操作都需要用户点击或明确确认。

## 飞书多维表格用法

配置飞书自建应用：

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BITABLE_APP_TOKEN=xxx
FEISHU_BITABLE_TABLE_ID=tblxxx
FEISHU_BITABLE_VIEW_ID=vewxxx
```

默认字段名：

```env
FEISHU_BITABLE_FIELD_ID=id
FEISHU_BITABLE_FIELD_USER_TYPE=user_type
FEISHU_BITABLE_FIELD_SOURCE=source
FEISHU_BITABLE_FIELD_CONTENT=content
FEISHU_BITABLE_FIELD_CREATED_AT=created_at
```

目标多维表格需要把自建应用添加为文档应用或协作者，否则接口会无权限。

## 飞书 OAuth 用法

OAuth 用于让机器人用授权用户身份搜索可访问的 Base。

```env
FEISHU_PUBLIC_BASE_URL=https://你的公网域名
FEISHU_OAUTH_REDIRECT_URI=https://你的公网域名/api/feishu/oauth/callback
FEISHU_OAUTH_SCOPES=auth:user.id:read search:docs:read drive:drive:readonly bitable:app:readonly offline_access
```

在群里发送：

```text
@PMOpsAgent 授权链接
```

完成授权后可以使用：

```text
@PMOpsAgent 列出我的 Base
@PMOpsAgent 搜索 Base 简历
@PMOpsAgent 分析 简历优化产品/用户反馈
```

本地 OAuth token 会保存到 `data/feishu-oauth-token.json`，该文件已被忽略。

## 飞书 PRD 文档用法

配置：

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_DOC_BASE_URL=https://你的租户域名.feishu.cn
FEISHU_DOC_FOLDER_TOKEN=
```

页面完成分析后：

1. 编辑 PRD 草稿。
2. 点击“确认通过”。
3. 点击“创建飞书 PRD”。

创建成功后，页面会展示文档链接，并把链接追加到飞书摘要。

## TAPD 用法

配置：

```env
TAPD_API_USER=你的 TAPD API 账号
TAPD_API_PASSWORD=你的 TAPD API 密码
TAPD_COMPANY_ID=
TAPD_WORKSPACE_ID=
TAPD_API_BASE_URL=https://api.tapd.cn
TAPD_WEB_BASE_URL=https://www.tapd.cn
TAPD_OWNER=
TAPD_CREATOR=
TAPD_ITERATION_ID=
```

页面完成分析后：

1. 编辑研发任务。
2. 点击“确认通过”。
3. 在 TAPD 面板填写项目 ID。
4. 勾选要创建的任务。
5. 点击“创建 TAPD”。

创建成功后，页面会展示 TAPD 需求和任务链接，并把链接追加到飞书摘要。

## 历史运行与产品记忆

历史运行保存在：

```text
data/runs/*.json
```

产品上下文记忆保存在：

```text
data/product-memory/*.json
```

这些本地运行数据已加入 `.gitignore`。

## 检查命令

类型检查：

```bash
npm run typecheck
```

生产构建：

```bash
npm run build
```
