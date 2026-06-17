# PMOps Agent 后续迭代路线图

本文档记录第一个最小 Demo 之后的后续任务，用于之后逐步把 PMOps Agent 从演示作品推进为更可用的 Agent 产品。

## 当前版本定位

当前版本已经完成最小闭环：

```text
CSV 用户反馈
→ Agent 分析反馈
→ 生成需求主题、MVP 范围、RICE、PRD 草稿、研发任务草稿
→ 展示 trace
→ 用户确认
→ 发送飞书群机器人摘要
```

当前版本重点证明：

- 它能把用户反馈转化为产品迭代建议。
- 它不是普通聊天框，而是有流程、有 trace、有审批、有工具调用的 Agent。
- 它已接入飞书自定义机器人 webhook 和飞书多维表格读取，仍不做自动创建文档或任务。

## V1.1：运行记录与历史回放

状态：已完成

目标：让每次 Agent 分析都可以被保存、查看和复用。

已完成：

- [x] 将每次分析结果保存到 `data/runs/*.json`
- [x] 保存输入反馈、AgentResult、trace、运行模式、生成时间
- [x] 新增历史运行列表
- [x] 支持点击历史记录查看结果
- [x] 支持复制历史飞书摘要
- [x] 支持删除本地历史记录

价值：

- 面试展示时可以回看多次运行结果。
- 用户不用每次重新上传和重新分析。
- trace 可以真正形成“执行回放”。

实现说明：

- `src/lib/runs/runStore.ts` 负责本地 JSON 文件读写。
- `/api/runs` 返回历史运行摘要列表。
- `/api/runs/[id]` 支持读取和删除单条历史记录。
- 页面左侧新增“历史运行”面板。

## V1.2：PRD 与任务可编辑

状态：已完成

目标：让 Agent 输出从“只读草稿”变成“可人工修订的工作稿”。

已完成：

- [x] PRD 标题可编辑
- [x] 背景、用户问题、目标、非目标可编辑
- [x] 功能需求可新增、删除、修改
- [x] 成功指标可新增、删除、修改
- [x] 研发任务可编辑
- [x] 飞书摘要支持手动编辑
- [x] 发送飞书前使用用户确认后的最终版本

价值：

- 更符合真实产品经理工作方式。
- Agent 负责生成初稿，人负责最终判断。
- 审批动作更有意义。

实现说明：

- `EditablePrd` 支持编辑 PRD 主要字段、列表字段和埋点方案。
- `EditableTasks` 支持编辑、新增和删除研发任务。
- 审批区飞书摘要改为可编辑文本框。
- 点击发送飞书时使用当前编辑后的摘要。

## V1.3：更完整的审批流

状态：已完成

目标：把“确认发送”升级成更清晰的工作流状态。

已完成：

- [x] 增加运行状态：`draft_generated`
- [x] 增加运行状态：`user_editing`
- [x] 增加运行状态：`approved`
- [x] 增加运行状态：`sent`
- [x] 增加运行状态：`cancelled`
- [x] 审批区展示当前状态
- [x] 用户确认前禁止调用外部工具
- [x] 用户取消后保留草稿但不发送

价值：

- 展示 Agent 安全边界。
- 让面试官看到“人机协同”，不是全自动乱执行。

实现说明：

- 审批区新增“确认通过”动作，只有状态为 `approved` 时才允许发送到飞书。
- 编辑 PRD、研发任务或飞书摘要后，状态会回到 `user_editing`，需要重新确认。
- 点击取消会进入 `cancelled`，保留当前草稿，不调用飞书 webhook。
- 确认、取消、发送成功和发送失败都会反映到 trace 或审批状态中。

## V1.4：飞书多维表格读取反馈

状态：已完成

目标：从真实团队反馈源读取数据，减少手动 CSV 上传。

已完成：

- [x] 创建飞书自建应用接入说明
- [x] 配置飞书应用权限说明
- [x] 接入飞书多维表格 API
- [x] 支持配置表格 app_token、table_id 和 view_id
- [x] 将多维表格记录转换为 `FeedbackItem[]`
- [x] 页面新增“读取飞书表格”
- [x] 保留 CSV 上传作为备用入口

注意：

- 这一步会引入飞书自建应用，不再只是 webhook。
- 需要处理 app id、app secret、tenant access token。

实现说明：

- `src/lib/feishu/bitableFeedback.ts` 负责获取 tenant access token、查询多维表格记录、分页读取和字段映射。
- `/api/feishu/bitable-feedback` 负责在服务端读取飞书表格，不向前端暴露 `app_secret`。
- `UploadPanel` 新增“读取飞书表格”按钮，配置不完整时禁用。
- 默认支持 `id`、`user_type`、`source`、`content`、`created_at` 字段，也支持常见中文字段名。

## V1.5：飞书文档创建 PRD

状态：已完成

目标：用户确认后，把 PRD 草稿写入飞书文档。

已完成：

- [x] 接入飞书新版文档 API
- [x] 将 `PrdDraft` 转成文档块结构
- [x] 用户确认后创建飞书文档
- [x] 返回飞书文档链接
- [x] 飞书摘要中附带 PRD 文档链接
- [x] 失败时展示错误 trace

价值：

- 从“生成草稿”升级成“生成团队可协作的文档”。
- 更接近真实产品团队流程。

实现说明：

- `src/lib/feishu/createPrdDocument.ts` 负责创建飞书新版文档，并将 PRD、风险、开放问题和研发任务写入文档块。
- `/api/feishu/prd-document` 在服务端创建文档，不向前端暴露 `app_secret`。
- 审批区新增“创建飞书 PRD”按钮，只有用户点击“确认通过”后才能使用。
- 创建成功后，文档链接会展示在审批区，并追加到飞书评审摘要中。
- 创建文档和发送群消息是两个独立动作，仍然需要用户分别确认触发。

## V1.6：TAPD 需求与任务创建

状态：已完成

目标：用户确认后，将研发任务草稿同步为真实任务。

已完成：

- [x] 选择任务平台：TAPD
- [x] 配置 TAPD API 账号、密码和项目 ID
- [x] 将 `PrdDraft` 转换为 TAPD 需求
- [x] 将 `EngineeringTask[]` 转换为 TAPD 任务
- [x] 支持用户选择要创建哪些任务
- [x] 创建前要求用户确认
- [x] 创建后展示 TAPD 需求和任务链接
- [x] 创建失败时保留失败 trace

原则：

- 不自动创建任务。
- 必须由用户确认。
- 创建 TAPD 和发送飞书是两个独立动作。

实现说明：

- `src/lib/tapd/createTapdWorkItems.ts` 负责调用 TAPD OpenAPI 创建需求和任务。
- `/api/tapd/work-items` 在服务端调用 TAPD，不向前端暴露 API 密码。
- `TapdTaskPanel` 支持勾选任务、创建 TAPD、展示创建后的需求和任务链接。
- 创建成功后，TAPD 链接会追加到飞书摘要中，便于后续发送评审消息。

## V1.7：飞书群内 @机器人触发

状态：已完成

目标：用户可以在飞书群里 @PMOps Agent 触发简单指令。

已完成：

- [x] 创建飞书自建应用机器人说明
- [x] 配置事件订阅说明
- [x] 配置公网回调地址说明
- [x] 新增 `/api/feishu/events`
- [x] 处理飞书 URL challenge
- [x] 接收群聊中 @机器人消息
- [x] 解析用户指令
- [x] 回复帮助信息
- [x] 支持 `@机器人 help`
- [x] 支持 `@机器人 status`

最小可演示目标：

```text
用户在群里 @PMOps Agent help
→ 后端收到事件
→ 机器人回复使用说明
```

注意：

- 自定义 webhook 不能接收 @ 消息。
- 这一步必须使用飞书自建应用、事件订阅和消息回复 API。
- 当前只开放轻量查询指令，不从群聊自动触发分析、创建文档、创建任务或发送评审摘要。

实现说明：

- `src/lib/feishu/eventBot.ts` 负责校验事件 token、处理 URL challenge、解析消息事件、回复 help/status。
- `/api/feishu/events` 是飞书事件订阅回调入口。
- 回调支持 `im.message.receive_v1`，使用飞书消息回复 API 回复原消息。
- 事件使用 `event_id` 做内存去重，避免飞书重试导致重复回复。
- 事件加密解密暂未实现，配置时不要开启 Encrypt Key。

## V1.8：飞书 @机器人触发分析

状态：已完成

目标：在飞书群里通过指令触发 Agent 分析。

已完成：

- [x] 定义群聊指令格式
- [x] 支持 `@机器人 分析 示例反馈`
- [x] 支持 `@机器人 列出表格`
- [x] 支持 `@机器人 列出空间表格`
- [x] 支持 `@机器人 分析 表名`
- [x] 支持跨 Base 空间索引搜索表名
- [x] 支持 `@机器人 分析 表格链接`
- [x] 将指令转换为 Agent 输入
- [x] 调用 `runAgent`
- [x] 将分析摘要回复到群里
- [x] 保存分析结果到历史运行
- [x] 复杂 PRD 仍引导用户回到网页查看和确认

建议边界：

- 群聊里只触发和查看摘要。
- 详细 PRD、任务和审批仍在网页完成。

实现说明：

- `@机器人 分析 示例反馈` 读取 `data/sample-feedback.csv`。
- `@机器人 列出表格` 读取 `.env.local` 已配置 Base 下的所有数据表。
- `@机器人 列出空间表格` 读取 `FEISHU_BITABLE_WORKSPACE_BASES` 中多个 Base 下的所有数据表。
- `@机器人 分析 表名` 优先在空间索引中按数据表名称匹配并读取反馈。
- 如果多个 Base 存在同名表，用户可以用 `Base名/表名` 精确指定。
- `@机器人 分析 飞书表格链接` 从 URL 解析 `app_token`、`table_id` 和可选 `view_id`。
- 群聊回调收到分析指令后先快速返回 200，再在后台回复“正在分析”和最终摘要。
- 分析结果会保存到 `data/runs/*.json`，用户可回到网页“历史运行”继续查看 PRD、任务和 trace。
- 不自动创建飞书 PRD，不自动创建 TAPD，不自动发送评审摘要。

## V1.9：飞书 OAuth 与 Base 自动发现

状态：已完成

目标：新增 Base 后不再手动维护 `FEISHU_BITABLE_WORKSPACE_BASES`，用户授权后由 Agent 自动搜索用户可访问的多维表格 Base。

已完成：

- [x] 新增 OAuth 授权入口 `/api/feishu/oauth/start`
- [x] 新增 OAuth 回调 `/api/feishu/oauth/callback`
- [x] 本地保存 user access token 和 refresh token
- [x] token 过期时自动刷新
- [x] 用 user access token 搜索多维表格 Base
- [x] 群聊支持 `@机器人 授权链接`
- [x] 群聊支持 `@机器人 列出我的 Base`
- [x] 群聊支持 `@机器人 搜索 Base 关键词`
- [x] `@机器人 分析 表名` 优先使用 OAuth 自动发现，再回退到空间索引
- [x] OAuth token 文件加入 `.gitignore`

实现说明：

- `src/lib/feishu/oauth.ts` 负责 OAuth URL、token 交换、刷新和云文档搜索。
- 授权 token 保存到 `data/feishu-oauth-token.json`，当前为本地单用户 Demo 模式。
- 生产多用户版本需要按 `open_id` / tenant / user 维度保存 token 到数据库。
- OAuth 自动发现仍然只回复摘要，不自动创建 PRD、TAPD 或发送评审消息。

## V2.0：多 Agent 分工

状态：已完成

目标：把单个 Agent 编排拆成多个职责清晰的 Agent。

已完成：

- [x] Research Agent：读取反馈、聚类需求、提炼痛点、机会、风险和开放问题
- [x] Strategy Agent：判断 MVP、RICE 和范围边界
- [x] PRD Agent：生成 PRD 草稿和埋点方案
- [x] Delivery Agent：拆研发任务、生成评审摘要
- [x] Orchestrator：汇总子 Agent 产物为统一 `AgentResult`
- [x] 每个子 Agent 输出独立 JSON 并单独校验
- [x] 每个子 Agent 失败时写入明确 trace
- [x] 保持现有网页、飞书群聊、审批卡片和历史回放兼容

注意：

- 不要为了“多 Agent”而多 Agent。
- 当前是本地串行多 Agent 编排，不自动执行外部写入。
- trace 展示每个 Agent 的状态；详细输入输出仍保存在最终结构化结果和历史记录中。

## V2.1：更强的可解释性

状态：已完成

目标：让 Agent 的产品判断更透明。

已完成：

- [x] 每个需求主题展示引用的反馈原文
- [x] MVP must-have / should-have 展示推荐理由
- [x] out-of-scope 展示不做原因和可选证据
- [x] RICE 分数展示计算方式
- [x] 低置信度结论高亮

后续增强：

- [ ] openQuestions 支持用户补充回答后重新分析

价值：

- 用户更容易相信 Agent 的结论。
- 更像产品经理的分析过程。

## V2.2：数据和指标补充

状态：已完成

目标：让 PRD 不只来自用户反馈，还能结合业务数据。

已完成：

- [x] 支持上传简单指标 CSV
- [x] 支持加载示例指标 CSV
- [x] 支持输入当前业务目标
- [x] 支持输入北极星指标
- [x] 多 Agent prompt 会把业务目标、北极星指标和指标 CSV 作为补充上下文
- [x] PRD 中自动生成结合业务目标的成功指标
- [x] PRD 中自动生成围绕北极星指标的埋点方案
- [x] 风险或开放问题中标注指标不足、口径不明或无法对应的问题

实现说明：

- `src/lib/csv/parseMetricCsv.ts` 负责解析指标 CSV。
- `data/sample-metrics.csv` 提供演示用指标。
- 首页左侧“业务数据”区域支持填写业务目标、北极星指标、上传指标 CSV 和加载示例指标。
- `/api/analyze` 将 `businessContext` 传给多 Agent 管线，并保存到历史运行记录。

## V2.3：部署与演示稳定性

目标：让 Demo 可以稳定给面试官访问。

待完成：

- [ ] 部署到 Vercel 或自有服务器
- [ ] 配置生产环境变量
- [ ] 隐藏或保护敏感接口
- [ ] 增加错误监控
- [ ] 增加基础访问说明
- [ ] 准备一套演示用飞书群
- [ ] 准备一套演示用 DeepSeek key

## 推荐执行顺序

建议按下面顺序推进：

```text
1. V1.1 运行记录与历史回放
2. V1.2 PRD 与任务可编辑
3. V1.3 更完整的审批流
4. V1.4 飞书多维表格读取反馈
5. V1.5 飞书文档创建 PRD
6. V1.6 TAPD 需求与任务创建
7. V1.7 飞书群内 @机器人触发
8. V1.8 飞书 @机器人触发分析
9. V1.9 飞书 OAuth 与 Base 自动发现
10. V2.0 多 Agent 分工
```

## 产品原则

- Agent 负责分析、生成草稿和建议。
- 用户负责确认、修改和最终决策。
- 所有外部写入动作必须先审批。
- trace 必须能解释 Agent 做了什么。
- 不把 Mock 结果伪装成真实 LLM 结果。
- 第一优先级永远是闭环稳定、边界清楚、可演示。
