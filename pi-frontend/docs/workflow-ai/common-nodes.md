# Workflow 通用功能节点体系

跨行业 Workflow 可归纳为 3 阶段 11 类通用节点。搭建 workflow 时先选通用节点链，再把通用节点微调成行业/任务专项节点；trained profile 是通用节点的专项版本，不是新的节点体系。

## 阶段一：输入与采集

### 节点 1：资料搜集与事实抽取（Fetch / Gather）

对应 Profile：`weak-research-extractor`

统一职责：从用户提供的资料、工具结果、可定位文件中搬运动性事实，不做判断。

- 适用模型：弱模型（Flash）
- 输出特征：结构化资料包，含来源、事实、不确定点、复核建议
- 行业变体：自媒体搜集爆款标题；调研整理新闻/财报/政策；客服提取工单关键信息
- 红线：不得凭记忆生成新闻、融资数字、链接或媒体名；无来源时输出 `source_status=missing/unverified`

### 节点 2：输入标准化 / 格式转换（Standardize）

对应 Profile：`weak-structured-operator`

统一职责：将非结构化输入转为结构化 schema，格式转换、字段抽取。

- 适用模型：弱模型（Flash）
- 输出特征：统一格式的 JSON / 表格 / schema
- 行业变体：金融发票字段对齐；客服工单标准化；销售通话转写整理
- 红线：严格按 schema 执行，不猜测缺失字段

## 阶段二：AI 核心处理层

### 节点 3：分类打标与条件路由（Classify & Route）

对应 Profile：`classification-router`

统一职责：标签分类、置信度输出、情绪识别、路由分支建议。

- 适用模型：弱模型（Flash）
- 输出特征：标签 + 置信度 + 情绪 + 路由目标 + 人工审核原因
- 行业变体：自媒体评论区分级；客服工单优先级；电商差评分类；金融交易风险分级
- 红线：低置信度或高风险内容必须转人工

### 节点 4：结构化提取与校验（Extract & Validate）

对应 Profile：`structured-writeback-operator`

统一职责：从非结构化内容中抽取字段，校验格式和必填项，保留原文锚点。

- 适用模型：弱模型（Flash）
- 输出特征：字段映射 + payload + 幂等键 + 原文锚点
- 行业变体：销售 CRM 字段提取；金融发票信息提取；物流运单提取；客服知识库字段更新
- 红线：不确定字段标记转人工，不猜测

### 节点 5：内容生成与草稿（Generate / Draft）

对应 Profile：`content-draft-producer`、`support-kb-responder`

统一职责：依据上游策略生成可编辑初稿，不是最终定稿。

- 适用模型：弱模型（Flash）
- 输出特征：标题备选、开头钩子、正文结构、CTA、待审风险标注
- 行业变体：自媒体脚本/图文/公众号；营销广告文案/A/B 版本；客服标准回复/FAQ；教育习题草稿
- 红线：不得新增上游未支持的事实、案例、数字；素材不足时用占位符

### 节点 6：深度分析与判断（Analyze & Judge）

对应 Profile：`research-report-analyst`、`sales-call-analyst`

统一职责：从事实中形成可验证判断，输出区分事实/推断/假设/建议。

- 适用模型：强/弱均可（取决于复杂度）
- 输出特征：判断结论 + 证据锚点 + 置信度 + 反证条件
- 行业变体：调研趋势判断/竞品格局；销售意向度评分/异议归类；医疗辅助判断；金融风险评估
- 红线：对未验证来源不得下高置信结论

### 节点 7：策略规划与架构（Strategize / Plan）

对应 Profile：`content-strategy-director`、`strong-task-architect`

统一职责：给出方向性指导，不写长文案，输出选题合理性说明和验证方式。

- 适用模型：强模型（Pro）
- 输出特征：策略方向 + 理由 + 验证指标 + 执行优先级
- 行业变体：自媒体选题策划/内容矩阵；营销投放策略/A/B 计划；产品需求优先级
- 红线：禁止编造真实案例、金额、转化率

## 阶段三：输出与闭环

### 节点 8：系统回写与动作执行（Writeback / Action）

对应 Profile：`structured-writeback-operator`

统一职责：生成系统写回 payload，支持幂等键，含失败重试建议。

- 适用模型：弱模型（Flash）
- 输出特征：写回 payload + 幂等键 + 字段校验结果
- 行业变体：销售 CRM 抄写；金融交易系统写入；电商库存更新；客服工单状态变更
- 红线：必填项缺失必须标记，不允许默认为 0 或空

### 节点 9：质量审查与风险裁决（Review / Gate）

对应 Profile：`strong-quality-reviewer`、`content-editor-reviewer`

统一职责：审查产物是否满足成功标准，识别冲突/遗漏/隐藏风险。

- 适用模型：强模型（Pro）
- 输出特征：审查结论 + 问题清单 + 返工分配 + 最终验收标准
- 行业变体：自媒体事实与观点一致性/标题风险/品牌语气统一；客服高风险回复审查；电商 A/B 版本质检
- 红线：必须给出明确裁决（发布/返工/阻塞），不能只给建议

### 节点 10：监控告警与分级响应（Monitor / Alert）

对应 Profile：`monitor-alert-operator`

统一职责：异常检测摘要、阈值触发判断、轻/中/重分级、升级条件标注。

- 适用模型：弱模型（Flash）
- 输出特征：证据 + 触发原因 + 建议动作 + 是否升级
- 行业变体：自媒体舆情预警/负面突增；电商库存告警/定价异常；物流设备异常；金融交易异动
- 红线：不得自行执行高风险动作

### 节点 11：资料文件生成与渲染（Artifact / Render）

对应 Profile：通用可用 `weak-structured-operator`，专项可用 `*-report-render-*`、`*-artifact-render-*`

统一职责：把上游结构化结果渲染成可预览、可下载、可交付的文件、报告、卡片或 payload。

- 适用模型：弱模型（Flash）
- 输出特征：artifact 类型、文件结构、渲染 payload、预览说明、缺失素材、风险标记
- 行业变体：求职 JD 匹配报告；调研简报文件；自媒体发布卡片；客服质检报告；CRM 写回预览
- 红线：不得新增上游未支持事实、图片、数字或引用；缺少素材必须写 `missing_assets`；不得把未审查内容标记为最终通过

## 5 个通用模板

```text
template-fetch-summarize
  资料搜集(Fetch) -> 结构化提取(Structure) -> 影响判断与摘要(Judge)
  适用：行业调研 / 信息监控 / 竞品追踪
  如需可预览报告：Fetch -> Judge -> Render -> Review

template-classify-route
  输入标准化(Standardize) -> 分类打标(Classify) -> 自动处理草稿(Generate) -> 风险审查(Review)
  适用：客服票据 / 评论区分级 / 工单路由

template-extract-writeback
  输入整理(Standardize) -> 字段抽取(Extract) -> 写回Payload(Action) -> 风险审查(Review)
  适用：CRM回写 / 发票处理 / 表单录入

template-generate-variants
  生成策略(Plan) -> 批量变体生成(Generate) -> 质量审查(Review)
  适用：A/B测试 / 标题封面 / 广告文案
  如需可交付文件：Plan -> Generate -> Render -> Review

template-monitor-alert
  事件窗口整理(Gather) -> 触发判断与分级(Classify) -> 重度告警审查(Review)
  适用：舆情监控 / 库存预警 / 价格波动
```

## 强弱模型分配规律

- Gather/Fetch：弱模型默认。弱模型覆盖广、速度快。
- Standardize：弱模型默认。格式转换不需要复杂推理。
- Classify/Route：弱模型默认，高风险转强模型或人工。
- Extract/Validate：弱模型默认。字段抽取是机械任务。
- Generate/Draft：弱模型默认。只生成初稿，不做终审。
- Analyze/Judge：短 schema 可弱模型；深度分析用强模型。
- Strategize/Plan：强模型默认。方向性判断需要强模型。
- Writeback/Action：弱模型默认。机械执行，必须保留校验。
- Review/Gate：强模型默认。质量审查和裁决必须强模型。
- Artifact/Render：弱模型默认。只渲染上游结构化结果，不新增事实、不做裁决。
- Monitor/Alert：弱模型默认；重度升级用强模型。

核心规律：上游节点弱模型（输入/采集/处理）+ 中游节点可弱可强（按复杂度切换）+ 下游节点强模型（审查/裁决）。强模型只做弱模型做不了的事：跨任务一致性检查、风险裁决、方案合成。
