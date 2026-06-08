# PMOpsAgent

PMOpsAgent 是一个面向中国团队的 AI 产品经理助手 Demo。用户上传一批用户反馈后，Agent 会聚类需求、判断 MVP 范围、生成 RICE 优先级、PRD 草稿和研发任务草稿，并在用户确认后把评审摘要发送到飞书群。

这个项目是面试作品的最小可演示版本，重点展示 Agent 工作流、trace、审批和真实外部工具调用。

## 已实现功能

- CSV 用户反馈上传
- 加载示例反馈
- CSV 字段校验和错误提示
- DeepSeek API 分析用户反馈
- DeepSeek API key 缺失时自动进入 Mock 模式
- V2.0 多 Agent 分工：Research、Strategy、PRD、Delivery 和 Orchestrator
- V2.1 可解释性增强：反馈原文引用、MVP 理由、RICE 计算式和低置信度提示
- V2.2 数据和指标补充：业务目标、北极星指标、指标 CSV、指标化成功标准和埋点
- 结构化 Agent 输出校验
- 需求主题、MVP 范围、RICE 优先级展示
- PRD 草稿展示
- 研发任务草稿展示
- PRD 草稿可编辑
- 研发任务草稿可编辑
- 飞书摘要可编辑
- Agent trace 展示
- 发送飞书前审批
- 审批状态展示：草稿已生成、用户编辑中、已确认、已发送、已取消
- 编辑草稿后自动要求重新确认
- 用户取消后保留草稿且不会发送飞书
- 复制飞书摘要
- 飞书自定义机器人 webhook 文本消息发送
- webhook 未配置时禁用发送按钮
- 飞书群内 @机器人 `help/status` 指令回复
- 飞书群内 @机器人触发示例反馈或飞书表格分析
- 飞书群内 @机器人自然语言意图路由
- 飞书 OAuth 授权后自动搜索用户可访问的多维表格 Base
- 产品上下文记忆：按项目隔离保存历史 PRD、MVP、RICE、研发任务和用户证据，并支持模糊搜索
- 历史运行保存与回放
- 飞书多维表格读取用户反馈
- 用户确认后创建飞书 PRD 文档
- 用户确认后创建 TAPD 需求与任务

## 未实现功能

当前已接入：

- 飞书群机器人 webhook：用于发送评审摘要。
- 飞书多维表格读取：用于读取用户反馈。
- 飞书新版文档 API：用于创建 PRD 文档。
- 飞书事件订阅：用于接收群聊 @ 机器人消息并回复 `help/status`。
- 飞书审批卡片：用于在群聊内完成通过、驳回、创建 PRD 和创建 TAPD。
- 飞书 OAuth：用于用用户身份搜索可访问的多维表格 Base。
- TAPD OpenAPI：用于创建需求与研发任务。

以下能力属于后续版本，不在当前 Demo 范围内：

- 飞书任务
- Gitee
- MasterGo / Pixso
- 数据库、登录系统、多用户权限
- 无人工确认的自动创建真实任务

## 本地运行步骤

安装依赖：

```bash
npm install
```

创建环境变量文件：

```bash
copy .env.example .env.local
```

启动本地服务：

```bash
npm run dev
```

打开页面：

```text
http://localhost:3000
```

修改 `.env.local` 后需要重启 `npm run dev`，Next.js 才会重新读取服务端环境变量。

## 环境变量配置

`.env.local` 放在项目根目录：

```text
C:\Users\XiongJiacheng\Documents\Meeting-to-Action Agent\.env.local
```

示例：

```env
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_ROUTER_TIMEOUT_MS=12000
DEEPSEEK_ANALYSIS_TIMEOUT_MS=120000
DEEPSEEK_RESEARCH_TIMEOUT_MS=75000
DEEPSEEK_STRATEGY_TIMEOUT_MS=75000
DEEPSEEK_PRD_TIMEOUT_MS=75000
DEEPSEEK_DELIVERY_TIMEOUT_MS=75000
DEEPSEEK_REPAIR_TIMEOUT_MS=60000

FEISHU_BOT_WEBHOOK=你的飞书自定义机器人 webhook
FEISHU_BOT_SECRET=

FEISHU_APP_ID=你的飞书自建应用 App ID
FEISHU_APP_SECRET=你的飞书自建应用 App Secret
FEISHU_EVENT_VERIFICATION_TOKEN=飞书事件订阅 Verification Token
FEISHU_PUBLIC_BASE_URL=https://你的公网域名
FEISHU_OAUTH_REDIRECT_URI=https://你的公网域名/api/feishu/oauth/callback
FEISHU_OAUTH_SCOPES=可选，飞书 OAuth scope，多个用空格分隔
FEISHU_OAUTH_DEFAULT_SEARCH_KEY=可选，默认搜索关键词
FEISHU_BITABLE_APP_TOKEN=多维表格 app_token
FEISHU_BITABLE_WORKSPACE_URL=可选，多维表格空间链接
FEISHU_BITABLE_WORKSPACE_NAME=可选，多维表格空间名称
FEISHU_BITABLE_WORKSPACE_BASES=可选，空间下多个 Base 链接或 app_token
FEISHU_BITABLE_TABLE_ID=可选，网页按钮固定读取的数据表 table_id
FEISHU_BITABLE_VIEW_ID=可选，指定视图 view_id
FEISHU_BITABLE_FIELD_ID=id
FEISHU_BITABLE_FIELD_USER_TYPE=user_type
FEISHU_BITABLE_FIELD_SOURCE=source
FEISHU_BITABLE_FIELD_CONTENT=content
FEISHU_BITABLE_FIELD_CREATED_AT=created_at

FEISHU_DOC_FOLDER_TOKEN=可选，应用云空间中的文件夹 token
FEISHU_DOC_BASE_URL=https://你的租户域名.feishu.cn

TAPD_API_USER=你的 TAPD API 账号
TAPD_API_PASSWORD=你的 TAPD API 密码
TAPD_COMPANY_ID=可选，TAPD 公司 ID，用于飞书群聊查询项目列表
TAPD_WORKSPACE_ID=可选，默认 TAPD 项目 ID
TAPD_API_BASE_URL=https://api.tapd.cn
TAPD_WEB_BASE_URL=https://www.tapd.cn
TAPD_OWNER=可选，默认任务处理人昵称
TAPD_CREATOR=可选，默认创建人昵称
TAPD_ITERATION_ID=可选，默认迭代 ID

NEXT_PUBLIC_APP_NAME=PMOpsAgent
```

不要把真实密钥写进代码，不要提交 `.env.local`。

## 如何创建飞书自定义机器人

1. 打开一个飞书群聊。
2. 进入群设置。
3. 找到群机器人。
4. 添加机器人。
5. 选择自定义机器人。
6. 设置机器人名称，例如 `PMOpsAgent Bot`。
7. 复制生成的 webhook。
8. 粘贴到 `.env.local` 的 `FEISHU_BOT_WEBHOOK`。
9. 重启 `npm run dev`。

webhook 通常类似：

```text
https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

第一版不实现 `FEISHU_BOT_SECRET` 签名校验，先留空即可。如果你在飞书机器人里开启了关键词校验，飞书摘要中必须包含对应关键词，否则飞书会拒收。

## 如何接入飞书群内 @机器人

这一步和“飞书自定义机器人 webhook”不是同一个入口。自定义 webhook 只能让网页主动发消息到群里，不能接收群里 @ 机器人的消息。群内 @ 机器人必须使用飞书自建应用的机器人能力、事件订阅和消息回复 API。

当前支持这些群聊指令：

```text
@PMOpsAgent help
@PMOpsAgent 你是谁？
@PMOpsAgent status
@PMOpsAgent 授权链接
@PMOpsAgent 授权状态
@PMOpsAgent 列出我的 Base
@PMOpsAgent 搜索 Base 简历
@PMOpsAgent 当前记住了哪些项目
@PMOpsAgent 查一下简历项目的优先级依据
@PMOpsAgent 列出表格
@PMOpsAgent 列出空间表格
@PMOpsAgent 有哪些 TAPD 项目
@PMOpsAgent 分析 示例反馈
@PMOpsAgent 分析 用户反馈
@PMOpsAgent 分析 Base名/用户反馈
@PMOpsAgent 分析 https://xxx.feishu.cn/base/app_token?table=tblxxx&view=vewxxx
```

群聊机器人现在不是只靠固定关键词触发。飞书事件入口只负责三件事：过滤机器人消息或异常消息、处理空消息、标记高风险操作。用户意图理解、工具选择和多步工具链规划都交给 `conversationAgent`。

例如下面这些说法不需要完全命中固定命令，`conversationAgent` 会理解用户目标后选择工具：

```text
@PMOpsAgent 列出我的 Base
@PMOpsAgent 列出我所有的 Base
@PMOpsAgent 我能访问哪些多维表格 Base
@PMOpsAgent 帮我看看有哪些可分析的 Base
@PMOpsAgent 有哪些 TAPD 项目
@PMOpsAgent 当前可用的 TAPD workspace 有哪些
@PMOpsAgent 我能用哪几个 TAPD 项目
@PMOpsAgent 当前记住了哪些产品项目
@PMOpsAgent 销售线索那个项目里，自动摘要为什么是 P1？
```

这类自我介绍问题会回复简短介绍，而不是直接返回完整命令菜单：

```text
@PMOpsAgent 你是谁？
@PMOpsAgent 你能做什么？
@PMOpsAgent 介绍一下自己
```

`conversationAgent` 只允许调用白名单工具。创建飞书 PRD、创建 TAPD、发送评审摘要、合并项目记忆等高影响动作不会被一句自然语言直接执行；它会先生成待确认动作，用户明确确认后才由统一的 Agent action executor 执行。飞书卡片和网页按钮只是不同的确认界面，底层执行同一套写操作。

## 产品上下文记忆

PMOpsAgent 会在每次分析完成并保存历史运行时，自动把这次分析沉淀成一个“产品项目记忆”。你不需要手动维护记忆文件。

记忆包含：

- 项目名称、别名、来源表格或 CSV 来源
- 最近一次运行 ID
- PRD 标题和摘要
- MVP must-have / should-have
- RICE 优先级判断
- 研发任务草稿
- 用户反馈证据

记忆文件保存在：

```text
data/product-memory/*.json
```

项目隔离方式：

- 每个项目会生成一个稳定的 `key`，例如 `project_xxxxxxxxxxxxxxxx`
- 同一个来源表格或 CSV 再次分析，会更新同一个项目记忆
- 不同 Base / 表格 / CSV 来源会形成不同项目记忆，避免串项目
- 飞书群里可以用项目名、Base 名、表名、PRD 名或来源名做模糊搜索

常见用法：

```text
@PMOpsAgent 当前记住了哪些项目？
@PMOpsAgent 查一下简历项目
@PMOpsAgent 销售线索项目里，自动摘要为什么是 P1？
@PMOpsAgent 针对 demo-saas-feedback，重新评估自动销售记录摘要的优先级
```

除了长期的产品项目记忆，PMOpsAgent 还保存短期会话状态。这里保存的不是固定命令关键词，而是最近几轮对话、工具观察结果和待确认动作。

会话状态文件保存在：

```text
data/conversation-sessions/*.json
```

例如这类连续对话：

```text
@PMOpsAgent 有一些项目是重复的，请你筛选出来告诉我，然后我会要求你合并
@PMOpsAgent 合并这两个项目
@PMOpsAgent 确认合并
```

这不是靠机械匹配“这两个”来完成的。`conversationAgent` 会先读取最近对话和工具观察结果，定位用户提到的项目，再按工具链执行：

```text
read_product_memories
↓
compare_product_memories
↓
prepare_merge_product_memories
↓
用户确认
↓
execute_pending_action
```

也就是说，第一句可以先发现或列出疑似重复项目；第二句会读取这些项目并比较它们是否本质重复，然后只生成“待确认合并动作”；第三句才会真正写入合并结果。`find_duplicate_product_memories` 只是辅助发现重复项目，不再是合并的硬前置条件。待确认状态 30 分钟后自动过期；也可以发送 `@PMOpsAgent 取消合并` 清除。

你也可以直接指定要合并的项目名或 key，例如：

```text
@PMOpsAgent 合并 AI智能学情分析系统、智学助手、AI智能学习助手
@PMOpsAgent 合并 project_xxxxxxxxxxxxxxxx 和 project_yyyyyyyyyyyyyyyy
```

这类请求会先读项目、比较重复性和合并风险，再等待确认，不会一句话直接删除或覆盖项目记忆。

也可以用本地 API 查看：

```text
http://localhost:3000/api/memory
http://localhost:3000/api/memory?q=简历
```

接入步骤：

1. 打开飞书开放平台，进入你的企业自建应用。
2. 在“添加应用能力”中开启机器人能力。
3. 在“权限管理”中开通消息权限。最小建议申请“接收群聊中 @ 机器人消息事件”，如果要私聊也可申请读取用户发给机器人的单聊消息。
4. 在“事件与回调”中选择“将事件发送至开发者服务器”。
5. 准备一个公网 HTTPS 回调地址。飞书无法访问本机 `localhost`，本地联调时需要使用内网穿透，线上演示可使用部署后的域名。
6. 回调地址填写：

```text
https://你的公网域名/api/feishu/events
```

7. 把事件订阅页面里的 `Verification Token` 填入 `.env.local`：

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_EVENT_VERIFICATION_TOKEN=xxx
```

8. 事件列表中添加“消息与群组 / 接收消息 v2.0”，事件类型是 `im.message.receive_v1`。
9. 配置飞书卡片回调地址，用于接收审批卡片按钮点击：

```text
https://你的公网域名/api/feishu/card-actions
```

10. 卡片回调使用同一个 `Verification Token`。不要开启 Encrypt Key；当前 Demo 暂未实现加密解密。
11. 保存并发布应用，按飞书要求完成管理员审批。
12. 把应用机器人添加进目标飞书群。
13. 在群里发送 `@PMOpsAgent help`、`@PMOpsAgent status`、`@PMOpsAgent 列出空间表格`、`@PMOpsAgent 分析 示例反馈` 或 `@PMOpsAgent 分析 表名`。

如果飞书后台校验请求地址时报错，优先检查：

- 回调地址必须是公网可访问的 HTTPS。
- 服务端必须已经启动或已经部署。
- `.env.local` 中的 `FEISHU_EVENT_VERIFICATION_TOKEN` 必须和飞书后台一致。
- 不要开启 Encrypt Key；当前 Demo 暂未实现事件加密解密。
- 如果要让机器人回复消息和发送审批卡片，还需要申请发送消息权限，例如 `im:message:send_as_bot`、`im:message:send` 或 `im:message` 中的一个。

群聊触发分析的边界：

- `分析 示例反馈` 会读取本地 `data/sample-feedback.csv`。
- `授权链接` 会生成飞书 OAuth 授权链接。
- `授权状态` 会检查当前本地保存的 OAuth token 拿到了哪些 scope。
- `列出我的 Base` 会用授权用户身份递归读取云空间文件夹，并列出可访问的多维表格 Base。
- `搜索 Base 关键词` 会按关键词搜索授权用户可访问的多维表格 Base。
- `列出表格` 会列出 `.env.local` 中 `FEISHU_BITABLE_APP_TOKEN` 对应 Base 下的所有数据表。
- `列出空间表格` 会列出 `FEISHU_BITABLE_WORKSPACE_BASES` 中多个 Base 下的所有数据表。
- `有哪些 TAPD 项目` 会用 TAPD API 账号查询公司下可访问的项目列表，并返回项目 ID。
- `分析 表名` 会优先用 OAuth 自动发现 Base，再回退到空间索引，例如 `@PMOpsAgent 分析 用户反馈`。
- 如果多个 Base 中有同名表，可以使用 `@PMOpsAgent 分析 Base名/用户反馈`。
- `分析 飞书表格链接` 会解析链接中的 `app_token`、`table_id` 和可选 `view_id`。
- 自然语言意图路由依赖 `DEEPSEEK_API_KEY`；如果没有配置或 LLM 暂时失败，系统会自动退回本地规则解析。
- 群聊分析完成后会回复一张审批卡片，展示摘要、Top 需求主题、MVP 必做和任务预览。
- 可以直接在飞书卡片里点击“通过分析”“驳回”“创建 PRD”“创建 TAPD”，也可以在群聊里用自然语言要求 PMOpsAgent 准备这些动作，再回复确认执行。网页 Demo 主要用于历史回放、复杂编辑和兜底操作。

## 如何在飞书内完成审批

飞书内审批依赖“交互式卡片 + 卡片回调”。群聊中发送 `@PMOpsAgent 分析 表名` 后，PMOpsAgent 会先读取反馈并生成分析结果，然后回复一张评审卡片。

卡片按钮含义：

- `通过分析`：人工确认这次分析可以进入后续交付。
- `驳回`：标记这次分析不采用。
- `创建 PRD`：通过后，把 PRD 草稿创建成飞书新版文档。
- `创建 TAPD`：通过后，把需求和研发任务创建到 TAPD。

飞书后台需要额外配置：

1. 在飞书开放平台进入自建应用。
2. 确认已开启机器人能力，并且机器人已加入目标群。
3. 确认已申请机器人发送消息权限，例如 `im:message:send_as_bot`、`im:message:send` 或飞书后台当前展示的等价权限。
4. 进入卡片或消息卡片相关配置，开启卡片交互回调。
5. 卡片回调地址填写：

```text
https://你的公网域名/api/feishu/card-actions
```

6. `Verification Token` 使用和事件订阅相同的值，并填入 `.env.local`：

```env
FEISHU_EVENT_VERIFICATION_TOKEN=飞书后台的 Verification Token
```

7. 不要开启 Encrypt Key；当前 Demo 暂未实现飞书加密回调解密。
8. 保存并发布应用，按飞书要求完成管理员审批。
9. 修改 `.env.local` 后重启 `npm run dev`。

如果你用 cpolar，本地联调时两个公网地址通常是：

```text
事件订阅地址：https://你的cpolar域名/api/feishu/events
卡片回调地址：https://你的cpolar域名/api/feishu/card-actions
OAuth 回调地址：https://你的cpolar域名/api/feishu/oauth/callback
```

注意：飞书卡片上的“创建 PRD”和“创建 TAPD”仍然是人工确认触发，不是机器人自动执行。群聊自然语言也遵循同样边界：先准备待确认动作，再由用户确认执行。

## 如何接入飞书多维表格

这一步用于从飞书多维表格读取用户反馈。它和群机器人 webhook 不是同一个东西：webhook 只能发消息，不能读取表格；读取表格必须创建飞书自建应用。

1. 打开飞书开放平台，创建一个企业自建应用。
2. 在应用的凭证与基础信息页面复制 `App ID` 和 `App Secret`。
3. 在应用权限里申请多维表格读取权限，至少需要“查看、评论和导出多维表格”，也可以申请“查看、评论、编辑和管理多维表格”。
4. 发布或启用应用，并按飞书要求完成管理员审批。
5. 打开你的飞书多维表格，在右上角更多菜单中把这个自建应用添加为文档应用或协作者，让它有读取这个表格的权限。
6. 从多维表格 URL 中取出 `app_token`、`table_id`，如果要固定读取某个视图，再取 `view_id`。
7. 在 `.env.local` 中填入：

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BITABLE_APP_TOKEN=xxx
FEISHU_BITABLE_TABLE_ID=可选，网页按钮固定读取时填写 tblxxx
FEISHU_BITABLE_VIEW_ID=可选，网页按钮固定读取时填写 vewxxx
```

如果只想让飞书群聊机器人按表名选择数据表，可以不填 `FEISHU_BITABLE_TABLE_ID`。机器人会先通过 `FEISHU_BITABLE_APP_TOKEN` 列出这个 Base 下的所有数据表，再按用户发送的表名匹配。

群聊示例：

```text
@PMOpsAgent 列出表格
@PMOpsAgent 分析 用户反馈
@PMOpsAgent 分析 客服反馈
```

如果你的链接是多维表格空间，例如：

```text
https://你的租户.feishu.cn/base/workspace/EWonscxhUpam2mcs6CYc0Cdin2e
```

它不是某一个 Base 的 `app_token`。如果暂时不使用 OAuth，可以把该空间下需要搜索的 Base 链接配置到 `FEISHU_BITABLE_WORKSPACE_BASES`：

```env
FEISHU_BITABLE_WORKSPACE_URL=https://你的租户.feishu.cn/base/workspace/EWonscxhUpam2mcs6CYc0Cdin2e
FEISHU_BITABLE_WORKSPACE_NAME=用户反馈空间
FEISHU_BITABLE_WORKSPACE_BASES=https://你的租户.feishu.cn/base/base_token_1,https://你的租户.feishu.cn/base/base_token_2
```

也可以给 Base 起显示名，格式是 `Base链接|显示名`：

```env
FEISHU_BITABLE_WORKSPACE_BASES=https://你的租户.feishu.cn/base/base_token_1|6月反馈,https://你的租户.feishu.cn/base/base_token_2|客服反馈池
```

然后在群里使用：

```text
@PMOpsAgent 列出空间表格
@PMOpsAgent 分析 用户反馈
@PMOpsAgent 分析 客服反馈池/用户反馈
```

## 如何接入飞书 OAuth 自动发现 Base

这一步用于解决“新增 Base 后不想手动改 `.env.local`”的问题。用户完成 OAuth 授权后，Agent 会用授权用户身份搜索其可访问的多维表格 Base，再进入 Base 列出数据表。

飞书后台配置：

1. 进入飞书开放平台，打开你的企业自建应用。
2. 进入“安全设置”或“重定向 URL”配置。
3. 添加 OAuth 回调地址：

```text
https://你的公网域名/api/feishu/oauth/callback
```

如果你本地用 cpolar，就填：

```text
https://你的cpolar域名/api/feishu/oauth/callback
```

4. 进入“权限管理”，切换到或筛选“用户身份权限”，申请 OAuth 和云文档相关权限。这里要特别注意：自动搜索 Base 用的是 `user_access_token`，所以必须是“用户身份权限”，只申请“应用身份权限”不够。

建议至少开通这些用户身份权限：

```text
获取用户身份信息：auth:user.id:read
搜索云文档：search:docs:read
读取云空间文件：drive:drive:readonly
查看多维表格：bitable:app:readonly
离线访问：offline_access
```

如果飞书后台权限名称和上面中文略有差异，以权限详情里的 API scope 为准，关键是必须包含：

```text
auth:user.id:read search:docs:read drive:drive:readonly bitable:app:readonly offline_access
```

5. 如果你希望授权后能刷新 token，申请 `offline_access` 或飞书后台里对应的“离线访问”权限。
6. 发布应用，并完成管理员审批。
7. 在 `.env.local` 中配置：

```env
FEISHU_PUBLIC_BASE_URL=https://你的公网域名
FEISHU_OAUTH_REDIRECT_URI=https://你的公网域名/api/feishu/oauth/callback
FEISHU_OAUTH_SCOPES=auth:user.id:read search:docs:read drive:drive:readonly bitable:app:readonly offline_access
FEISHU_OAUTH_DEFAULT_SEARCH_KEY=
```

`FEISHU_OAUTH_REDIRECT_URI` 必须和飞书后台填写的回调地址完全一致。`FEISHU_OAUTH_SCOPES` 可以不填，代码会使用上面的默认值；但建议显式写上，方便排查。

8. 重启服务：

```bash
npm run dev
```

9. 在飞书群里发送：

```text
@PMOpsAgent 授权链接
```

10. 打开机器人回复的授权链接，完成授权。成功后页面会提示“飞书授权成功”。
11. 回到群里先检查授权状态：

```text
@PMOpsAgent 授权状态
```

如果回复里显示 `已获得 scope` 只有 `auth:user.id:read`，或者缺少 `drive:drive:readonly`、`search:docs:read`、`bitable:app:readonly` 中任意一个，说明你用的是旧授权，或者授权链接没有带上新的 scope。请重启服务后重新发送 `授权链接` 并重新授权。

12. 再测试：

```text
@PMOpsAgent 列出我的 Base
@PMOpsAgent 搜索 Base 简历
@PMOpsAgent 分析 简历优化产品/用户反馈
```

如果遇到 `99991679 Unauthorized`，通常不是 App ID 或 App Secret 错，而是当前保存的 `user_access_token` 缺少接口要求的用户身份 scope。处理顺序是：

1. 在飞书开放平台确认缺少的权限已经以“用户身份权限”开通。
2. 发布应用并完成管理员审批。
3. 重启 `npm run dev`，让 `.env.local` 的 scope 生效。
4. 在群里重新发送 `@PMOpsAgent 授权链接`。
5. 打开新链接重新授权。
6. 发送 `@PMOpsAgent 授权状态`，确认不再缺少 `drive:drive:readonly`、`search:docs:read` 和 `bitable:app:readonly`。

本地授权 token 会保存到：

```text
data/feishu-oauth-token.json
```

这个文件已加入 `.gitignore`，不要提交。当前 Demo 是单用户授权模型，适合本地演示；如果后续要多人使用，需要把 token 按用户或 tenant 存储到数据库。

8. 确认表格字段至少包含反馈内容字段。默认字段名建议用：

```text
id
user_type
source
content
created_at
```

也可以使用中文字段名：`反馈ID`、`用户类型`、`来源`、`反馈内容`、`创建时间`。如果你的字段名不同，在 `.env.local` 中显式配置：

```env
FEISHU_BITABLE_FIELD_ID=你的ID字段名
FEISHU_BITABLE_FIELD_USER_TYPE=你的用户类型字段名
FEISHU_BITABLE_FIELD_SOURCE=你的来源字段名
FEISHU_BITABLE_FIELD_CONTENT=你的反馈内容字段名
FEISHU_BITABLE_FIELD_CREATED_AT=你的时间字段名
```

9. 重启 `npm run dev`。
10. 如果配置了 `FEISHU_BITABLE_TABLE_ID`，页面左侧点击“读取飞书表格”，读取成功后再点击“开始分析”。如果没有配置 `table_id`，请在飞书群里使用 `列出表格` 和 `分析 表名`。

最容易失败的地方是第 5 步：应用有 API 权限，不代表它自动有目标表格的文档权限。飞书要求应用访问其它用户创建的云文档时，需要文档所有者把这个应用加到文档权限里。

## 如何接入飞书文档创建 PRD

这一步用于把网页中已经确认过的 PRD 草稿创建成飞书新版文档。它会使用同一个飞书自建应用的 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。

1. 回到飞书开放平台的自建应用后台。
2. 进入权限管理。
3. 搜索“新版文档”或 `docx`。
4. 申请“创建及编辑新版文档”权限。只申请“创建新版文档”可能只能建空文档，无法写入 PRD 内容。
5. 发布应用，并完成管理员审批。
6. 在 `.env.local` 中确认已经配置：

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
```

7. 可选配置文档链接域名，便于接口未返回 URL 时拼出可打开链接：

```env
FEISHU_DOC_BASE_URL=https://ycnthmxp3vnv.feishu.cn
```

8. 可选配置 `FEISHU_DOC_FOLDER_TOKEN`。注意：当前使用的是 `tenant_access_token`，只能指定应用自己创建或有权限的文件夹；不填则创建到应用云空间根目录。
9. 重启 `npm run dev`。
10. 页面完成分析后，先点击“确认通过”，再点击“创建飞书 PRD”。

创建成功后，页面会显示“打开飞书 PRD”链接，并把 PRD 文档链接追加到飞书评审摘要。你仍然需要再手动点击“发送到飞书”，Agent 不会自动发群消息。

## 如何接入 TAPD

这一步用于把 Agent 拆出来的研发任务同步到 TAPD。当前实现会先创建 1 个 TAPD 需求，再把选中的研发任务创建为该需求的关联任务。

1. 进入 TAPD 公司管理。
2. 找到开放集成或 API 账号管理。
3. 创建或申请一个 TAPD API 账号。
4. 记录 API 账号和 API 密码。注意：这不是你的个人登录密码。
5. 如果希望在飞书群里询问“有哪些 TAPD 项目”，还要记录 TAPD 公司 ID，也就是 `company_id`。它不是项目 ID。
6. 在 `.env.local` 中配置 TAPD API 账号：

```env
TAPD_API_USER=你的 TAPD API 账号
TAPD_API_PASSWORD=你的 TAPD API 密码
TAPD_COMPANY_ID=你的 TAPD 公司 ID，用于群聊列出项目
TAPD_API_BASE_URL=https://api.tapd.cn
TAPD_WEB_BASE_URL=https://www.tapd.cn
```

7. 可选配置默认项目、负责人、创建人和迭代。它们只是默认值，不再是每次换项目都必须改的配置：

```env
TAPD_WORKSPACE_ID=默认项目ID
TAPD_OWNER=默认处理人昵称
TAPD_CREATOR=默认创建人昵称
TAPD_ITERATION_ID=默认迭代ID
```

8. 重启 `npm run dev`。
9. 如果配置了 `TAPD_COMPANY_ID`，可以在飞书群里询问项目列表：

```text
@PMOpsAgent 有哪些 TAPD 项目
@PMOpsAgent 列出 TAPD 项目
@PMOpsAgent 我能用哪几个 TAPD 项目
```

10. 页面完成分析后，编辑 PRD 和研发任务。
11. 点击“确认通过”。
12. 在 TAPD 面板填写目标项目 ID，也就是 `workspace_id`。负责人、创建人、迭代 ID 可以按需填写。
13. TAPD 面板会把这些项目配置保存在当前浏览器，下次打开会自动带出。
14. 勾选要创建的研发任务。
15. 点击“创建 TAPD”。

创建成功后，页面会展示 TAPD 需求和任务链接，并把这些链接追加到飞书摘要。你仍然需要手动点击“发送到飞书”，Agent 不会自动发群消息。

简单区分：

- `TAPD_COMPANY_ID` 是公司 ID，用来查询“这个 TAPD 公司下有哪些项目”。
- `TAPD_WORKSPACE_ID` 或页面里填写的项目 ID 是项目 ID，用来把需求和任务创建到某一个具体项目。

## 如何加载示例数据

页面左侧有两种方式：

- 点击加载示例反馈：读取 `data/sample-feedback.csv`
- 点击上传 CSV：选择本地 CSV 文件
- 点击读取飞书表格：从已配置的飞书多维表格读取反馈

可用于测试的正常数据：

- `data/sample-feedback.csv`
- `data/demo-resume-feedback.csv`
- `data/demo-saas-feedback.csv`
- `data/demo-education-feedback.csv`
- `data/sample-metrics.csv`

可用于测试错误提示的数据：

- `data/demo-invalid-too-few.csv`
- `data/demo-invalid-missing-content.csv`

CSV 字段格式：

```csv
id,user_type,source,content,created_at
F001,应届生,访谈,我不知道为什么简历投出去没有回应,2026-06-01
```

其中 `content` 是必填字段，至少需要 3 条反馈。

业务指标 CSV 字段格式：

```csv
metric,value,period,segment,note
new_user_activation_rate,42%,2026-06,all_users,首周完成一次有效分析的用户占比
```

其中 `metric` 和 `value` 是必填字段。可选字段包括 `period`、`segment`、`note`。指标会作为补充上下文，用于生成更贴近业务目标的成功指标、埋点方案和风险提示。

## 如何运行 Demo

1. 打开 `http://localhost:3000`。
2. 点击加载示例反馈，或上传一份 CSV。
3. 可选填写当前业务目标、北极星指标，或点击加载示例指标。
4. 页面左侧确认反馈数量、业务指标和前几条反馈预览。
5. 点击开始分析。
6. 观察 Agent trace。
7. 查看需求主题、MVP 范围和 RICE 优先级。
8. 查看并编辑 PRD 草稿和研发任务草稿。
9. 在底部审批区查看或编辑完整飞书摘要。
10. 点击确认通过。
11. 可选点击创建飞书 PRD，把 PRD 草稿写入飞书文档。
12. 可选勾选研发任务并点击创建 TAPD，把需求和任务写入 TAPD。
13. 点击发送到飞书，或点击复制摘要。
14. 在左侧历史运行区回看、复制或删除本地历史记录。
15. 可选在飞书群里 `@PMOpsAgent help` 或 `@PMOpsAgent status`，验证群聊机器人事件回调。

发送到飞书、创建飞书 PRD 或创建 TAPD 需求/任务前，必须由用户手动点击“确认通过”。Agent 不会自动创建文档、创建任务或发送群消息。编辑 PRD、任务或飞书摘要后，审批状态会回到“用户编辑中”，需要重新确认。

## 历史运行

每次成功分析后，系统会在本地保存一条运行记录：

```text
data/runs/*.json
```

保存内容包括：

- 输入反馈
- Agent 输出结果
- trace
- 运行模式
- 生成时间
- 数据来源

页面左侧的历史运行面板支持：

- 查看历史结果
- 回放历史 trace
- 复制历史飞书摘要
- 删除本地历史记录

## Mock 模式说明

以下情况会进入 Mock 模式：

- `DEEPSEEK_API_KEY` 未配置
- 服务端进程没有重新读取到 `.env.local`
- 后续显式传入 `forceMock`

Mock 模式会在 UI 中明确显示 `mode: mock`。Mock 结果只用于演示界面流程，不代表真实模型分析。

如果 `.env.local` 已配置 `DEEPSEEK_API_KEY`，页面会显示 DeepSeek API Key 已被服务端识别。点击开始分析后，结果应显示 `mode: llm`。

## 多 Agent 分工

V2.0 后，正式 LLM 分析不再由一次大 prompt 生成全部内容，而是由内部多 Agent 串行协作：

- `Research Agent`：聚类用户反馈，提炼需求主题、痛点、机会、风险和开放问题。
- `Strategy Agent`：基于研究结果判断 MVP 范围，并生成 RICE 优先级。
- `PRD Agent`：把洞察和范围写成结构化 PRD 草稿与埋点方案。
- `Delivery Agent`：拆解研发任务，并生成飞书评审摘要。
- `Orchestrator`：汇总所有子 Agent 产物，校验为统一的 `AgentResult`，并写入 trace。

每个子 Agent 都会在 trace 中留下独立状态；如果失败，页面和飞书会显示具体是哪一个 Agent 失败。

## 常见问题

### 已配置 API Key 但仍是 Mock

请确认：

- `.env.local` 在项目根目录
- 变量名是 `DEEPSEEK_API_KEY`
- key 前后没有多余空格
- 修改 `.env.local` 后已经重启 `npm run dev`

### 路由层 LLM 能运行，但正式分析超时

这是正常可能发生的现象，不代表“路由层能联网、后端不能联网”。自然语言路由只需要判断一句群聊消息属于哪个工具，prompt 很短，默认超时是 12 秒；正式分析需要把整批反馈交给模型，并要求输出需求聚类、MVP、RICE、PRD、研发任务等完整 JSON，耗时会明显更长。

如果经常出现：

```text
PMOpsAgent 分析失败：LLM 请求超时，请稍后重试。
```

可以在 `.env.local` 中调大正式分析超时时间：

```env
DEEPSEEK_ANALYSIS_TIMEOUT_MS=180000
DEEPSEEK_RESEARCH_TIMEOUT_MS=120000
DEEPSEEK_STRATEGY_TIMEOUT_MS=120000
DEEPSEEK_PRD_TIMEOUT_MS=120000
DEEPSEEK_DELIVERY_TIMEOUT_MS=120000
DEEPSEEK_REPAIR_TIMEOUT_MS=90000
```

修改后重启 `npm run dev`。`DEEPSEEK_ANALYSIS_TIMEOUT_MS` 是兼容旧版本的总默认值；如果配置了某个子 Agent 的超时变量，会优先使用子 Agent 自己的值。

### 上传 CSV 后没有数据

请确认：

- CSV 包含 `content` 表头
- 至少有 3 条非空反馈
- 文件保存为 UTF-8 编码
- 内容中如果包含英文逗号，建议用英文双引号包裹该单元格

### 飞书发送按钮不可点击

请确认：

- `.env.local` 已配置 `FEISHU_BOT_WEBHOOK`
- 修改后重启了 `npm run dev`
- 页面已经完成一次 Agent 分析并生成飞书摘要
- 审批区已经点击“确认通过”

### 读取飞书表格失败

请确认：

- `.env.local` 已配置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`
- `.env.local` 已配置 `FEISHU_BITABLE_APP_TOKEN`
- 如果使用网页左侧“读取飞书表格”按钮，还需要配置 `FEISHU_BITABLE_TABLE_ID`
- 修改 `.env.local` 后重启了 `npm run dev`
- 飞书自建应用已申请多维表格读取权限，并完成审批或发布
- 目标多维表格已把该应用添加为文档应用或协作者
- 表格中至少有 3 条反馈
- 表格字段包含 `content` 或 `反馈内容`，或者已配置 `FEISHU_BITABLE_FIELD_CONTENT`
- 如果在群聊中 `分析 表名` 失败，先发送 `@PMOpsAgent 列出表格`，确认表名完全存在且不和其它表名混淆

### 创建飞书 PRD 失败

请确认：

- `.env.local` 已配置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`
- 修改 `.env.local` 后重启了 `npm run dev`
- 飞书自建应用已申请“创建及编辑新版文档”权限
- 应用已发布，并完成管理员审批
- 如果配置了 `FEISHU_DOC_FOLDER_TOKEN`，该文件夹必须是应用可访问的文件夹
- 如果页面没有展示文档链接，可以配置 `FEISHU_DOC_BASE_URL=https://你的租户域名.feishu.cn`

### 创建 TAPD 失败

请确认：

- `.env.local` 已配置 `TAPD_API_USER`
- `.env.local` 已配置 `TAPD_API_PASSWORD`
- TAPD 面板已填写项目 ID，或者 `.env.local` 已配置默认 `TAPD_WORKSPACE_ID`
- 修改 `.env.local` 后重启了 `npm run dev`
- TAPD API 账号有创建需求和创建任务权限
- 项目 ID 是 TAPD 项目的 `workspace_id`，不是公司 ID
- 如果是在飞书群里查询项目列表，还需要配置 `TAPD_COMPANY_ID`，并确认它是公司 ID，不是项目 ID
- 如果填写了负责人或创建人，昵称必须是 TAPD 项目中的有效成员

### 能不能在飞书群里 @ 机器人调用

当前版本已支持群聊调用，包含 `help/status` 和轻量分析指令：

```text
@PMOpsAgent help
@PMOpsAgent status
@PMOpsAgent 列出表格
@PMOpsAgent 列出空间表格
@PMOpsAgent 分析 示例反馈
@PMOpsAgent 分析 用户反馈
@PMOpsAgent 分析 Base名/用户反馈
@PMOpsAgent 分析 https://xxx.feishu.cn/base/app_token?table=tblxxx&view=vewxxx
```

群聊分析会回复审批卡片，并把结果保存到网页历史运行里。创建飞书 PRD、创建 TAPD、发送评审摘要仍属于高影响操作，所以必须由用户在飞书卡片、网页或群聊自然语言里明确确认。网页 Demo 主要用于历史回放、复杂编辑和兜底操作。

如果 `@机器人` 没反应，请确认：

- 飞书自建应用已开启机器人能力。
- 已订阅“接收消息 v2.0 / im.message.receive_v1”事件。
- 已配置卡片回调地址 `/api/feishu/card-actions`。
- 应用已发布且权限已审批。
- 回调地址是公网 HTTPS，并指向 `/api/feishu/events`。
- 机器人已经被添加到目标群。
- `.env.local` 已配置 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 和 `FEISHU_EVENT_VERIFICATION_TOKEN`。
- 应用已申请发送消息权限，例如 `im:message:send_as_bot`，并发布审批通过。

## 下一步计划

详细后续任务见 [ROADMAP.md](./ROADMAP.md)。

建议按下面顺序扩展：

- V1.1：运行记录与历史回放，已完成
- V1.2：PRD 与任务可编辑，已完成
- V1.3：更完整的审批流，已完成
- V1.4：飞书多维表格读取用户反馈，已完成
- V1.5：飞书文档创建 PRD，已完成
- V1.6：TAPD 需求与任务创建，已完成
- V1.7：飞书群内 @机器人触发，已完成
- V1.8：飞书 @机器人触发分析，已完成
- V1.9：飞书 OAuth 与 Base 自动发现，已完成
- V2.0：多 Agent 分工，已完成
- V2.1：更强的可解释性，已完成
- V2.2：数据和指标补充，已完成
- V2.3：部署与演示稳定性

## 开发检查

类型检查：

```bash
npm run typecheck
```

生产构建：

```bash
npm run build
```
