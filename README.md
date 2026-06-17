# PMOpsAgent

PMOpsAgent 是一个面向中国团队的全栈 AI 产品经理助手。支持从用户反馈（本地 CSV 或飞书多维表格）中自动聚类需求、判断 MVP 范围、开展 RICE 优先级排序、生成 PRD 规格说明书和拆解研发工单任务，并在通过人工确认后同步至飞书群和 TAPD 交付系统。

---

## 🌟 核心特性

- **多 Agent 协同与流式分析 (SSE)**：基于 Research、Strategy、PRD、Delivery、Critic 多个 Agent 的分工与协作，使用 SSE 流式输出，配合前端状态条稳定排序算法，实现实时分析，防止步骤乱序漂移。
- **Critic 自动化反思审计**：Critic Agent 自动化校验 PRD 及研发任务与 MVP 范围的一致性，防越界、校验逻辑依赖，支持最高 3 次流式驳回自纠，不通过时挂起进行人工干预。
- **双模长效语义记忆库**：支持 OpenAI 密集向量模式（`text-embedding-3-small`）与**本地无密钥 Fallback 稀疏向量模型（基于 TF-IDF 算法及中英文 Unigram/Bigram 分词器）**。提供增量语义伴生向量计算缓存与余弦相似度检索，可一键增量/全量重构。
- **飞书深度整合**：支持群聊机器人自然语言路由、OAuth 身份多维表格（Bitable）自发现、多维度评审交互卡片、新版云文档 PRD 自动化写入。
- **TAPD 双向同步与增量追加**：一键生成 Story 和 Task，双向同步 TAPD 真实执行状态，自动根据 Product Memory 进行继承与幂等增量防重同步。
- **本地持久化运行历史**：基于轻量级本地文件数据库（`data/runs/*.json`）和项目隔离记忆（`data/product-memory/*.json`），支持一键回放、追溯及删除。

---

## 🚀 快速开始

### 1. 本地运行
```bash
# 1. 安装依赖
npm install

# 2. 复制环境配置
cp .env.example .env.local

# 3. 运行本地开发服务
npm run dev
```
打开浏览器访问：`http://localhost:3000`

### 2. 生产部署 (ECS 简易版)
```bash
# 编译 Next.js 生产版本
npm run build

# 使用 PM2 后台启动
pm2 start npm --name "pmops-agent" -- start -- -H 0.0.0.0 -p 3000
```
*(详细的 Nginx SSE 禁用缓存配置与 SSL 方案，请参见 [deployment_guide.md](./deployment_guide.md))*

---

## ⚙ 环境变量配置

请在项目根目录创建 `.env.local`。关键环境变量配置参考如下：

| 变量名 | 是否必填 | 描述 |
| :--- | :---: | :--- |
| `DEEPSEEK_API_KEY` | 是 (或 Mock) | DeepSeek API 密钥，缺失时应用自动进入 Mock 模式 |
| `DEEPSEEK_BASE_URL` | 否 | 默认 `https://api.deepseek.com` |
| `FEISHU_BOT_WEBHOOK` | 否 | 飞书自定义机器人 Webhook URL，用于群发评审卡片 |
| `FEISHU_BOT_SECRET` | 否 | 飞书机器人安全设置中启用的签名校验密钥 |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 否 | 飞书自建应用 ID 及 Secret，用于表格读取、OAuth 和 PRD 创建 |
| `FEISHU_EVENT_VERIFICATION_TOKEN` | 否 | 飞书事件订阅 Verification Token，用于群聊机器人 @ 消息订阅 |
| `FEISHU_PUBLIC_BASE_URL` | 否 | ECS 公网 HTTPS 域名（飞书回调及 OAuth 重定向所必需） |
| `FEISHU_BITABLE_APP_TOKEN` | 否 | 默认读取用户反馈的多维表格 App Token |
| `TAPD_API_USER` / `TAPD_API_PASSWORD` | 否 | TAPD API 账号与密码 |
| `TAPD_COMPANY_ID` / `TAPD_WORKSPACE_ID` | 否 | TAPD 公司 ID 和默认项目 Workspace ID |
| `EMBEDDING_API_KEY` | 否 | 密集向量 Embedding 密钥，缺省时自动降级为本地稀疏 VSM 分词引擎 |

---

## 🔌 外部工具集成步骤

### 1. 飞书自定义机器人（Web 评审群发）
1. 在飞书群设置 -> 群机器人 -> 添加自定义机器人。
2. 复制 Webhook 链接填入 `FEISHU_BOT_WEBHOOK`。若启用了安全设置，把 Secret 填入 `FEISHU_BOT_SECRET`。
3. （建议）在安全设置中配置关键词：`PMOpsAgent`。

### 2. 飞书自建应用（表格、OAuth、PRD 文档与群聊助手）
1. 登录飞书开放平台，创建自建应用，复制 App ID & Secret。
2. 申请以下用户与应用身份权限：
   - 多维表格：`bitable:app:readonly`（查看多维表格）
   - 云文档及文件夹：`drive:drive:readonly`（读取文件）、`docx:document`（创建与编辑新版文档）
   - OAuth 登录及搜索：`auth:user.id:read`（获取用户身份）、`search:docs:read`（搜索云文档）、`offline_access`（离线访问）
3. 在**事件与回调**和**消息卡片回调**中，填写您的公网 HTTPS 接口地址：
   - 事件订阅：`https://你的域名/api/feishu/events`（添加 `im.message.receive_v1` 事件）
   - 卡片交互：`https://你的域名/api/feishu/card-actions`
   - OAuth 重定向：`https://你的域名/api/feishu/oauth/callback`
4. 将 Verification Token 填入 `FEISHU_EVENT_VERIFICATION_TOKEN`。在群内 @机器人 即可开启交互。

### 3. TAPD 项目交付集成
1. 登录 TAPD，在后台获取 API 账号与 API 密码（非登录个人密码）。
2. 将账号密码填入 `TAPD_API_USER` 和 `TAPD_API_PASSWORD`。
3. 网页端点击“确认通过”后，勾选待同步任务，一键推送至指定 TAPD 项目。

---

## 💬 常用群聊交互指令

群聊助手依赖自建应用机器人与 `conversationAgent`。支持自然语言路由，典型指令如下：

- **基础指令**：`@PMOpsAgent help`（菜单） / `status`（运行状态）
- **多维表格**：`列出我的 Base` / `搜索 Base 简历` / `分析 [表格名或表格链接]`
- **交付资产**：`当前记住了哪些项目` / `查一下简历项目的优先级依据`
- **TAPD 项目**：`有哪些 TAPD 项目`

---

## 📁 存储与本地数据库

系统无需搭建外部复杂的数据库，依托高性能的本地文件引擎提供持久化数据支持：
- **分析运行快照**：每次执行 of 完整快照，保存在 `data/runs/[run_id].json`，支持在“运行历史”中随时回看和删除。
- **产品项目长效记忆**：根据数据源指纹自动合并的项目资产记忆，保存在 `data/product-memory/[project_key].json`。
- **伴生语义向量库**：自动生成的决策和证据向量缓存，保存在 `data/product-memory/vectors/[project_key].json`。
- **会话上下文状态**：飞书群聊短期多轮对话上下文，保存在 `data/conversation-sessions/*.json`。

---

## ⚙ 开发与校验

```bash
# 类型检查
npm run typecheck

# 生产环境编译
npm run build
```

---

## 💡 常见问题与排查 (FAQ)

- **为什么已配置 API Key 但仍显示为 Mock 模式？**
  修改 `.env.local` 环境变量后，必须**重启本地或生产服务**（如重启 `npm run dev` 或 `pm2 restart`），Next.js 服务端才会重新载入变量。
- **网页上的“发送至飞书”或“同步至 TAPD”按钮无法点击？**
  应用采用安全确认边界设计。必须先在页面下方点击“核对并通过”使审批状态变为 `Approved`，且环境变量配置正确时，动作按钮才会被激活。
- **读取飞书多维表格提示 99991679 Unauthorized？**
  多维表格需要进行文档协作者授权。请确保在表格右上角，已将您创建的飞书自建应用添加为**文档应用或协作者**。
- **群聊中 @机器人 无反应？**
  1. 检查自建应用机器人是否已加入该群。
  2. 确认事件订阅的 HTTPS 回调地址通过了飞书后台的 Challenge 校验。
  3. 确认服务器端已经成功运行，且 `.env.local` 中 Verification Token 与飞书一致。
- **大模型分析总是超时失败？**
  多 Agent 执行、反思重试和产物汇总时间较长，可在 `.env.local` 中调大各子模块的超时参数，如 `DEEPSEEK_ANALYSIS_TIMEOUT_MS=180000`。
