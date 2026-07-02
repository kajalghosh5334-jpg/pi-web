# Workflow 模型组合与微调穷举方案

当没有精确可复用 workflow 时，不要直接返回通用模板。先把模板当骨架，再生成一个按用户目标微调的 workflow。

## 两阶段预算

- 检索阶段：最多 3 秒。只判断是否存在精确业务 workflow。
- 生成阶段：最多 6 秒。没有精确匹配时，生成定制 blueprint，再由后端展开完整节点。

## 生成原则

先穷举模型组合，再列场景，再在场景中微调节点提示词。

Flash 擅长处理长文本和做格式化填充，但不应该在推荐链路里临场推理：

- 不让 Flash 推理强弱模型怎么分配。
- 不让 Flash 推理节点数量和节点顺序。
- 不让 Flash 判断弱模型能力边界。
- 让 Flash 从固定 `modelCombinationId` 和 `scenarioId` 中选择。
- 让 Flash 只在已选组合内微调短字段。

## Trained Profile 有效路径

在调用 Flash 之前，后端先读取 `pi-backend/agent-profiles.json`，只抽取这些已训练节点：

- `projectConfig.generatedStatus = trained`
- `projectConfig.profileKind = task-specific`
- `projectConfig.sourceNodeType`
- `projectConfig.roleInWorkflow`
- `projectConfig.nodeContract.output`
- `projectConfig.nodeContract.redLines`
- `projectConfig.nodeOutputArtifact`

Flash 不负责扫描 profile、不读取 artifact、不判断强弱模型。后端把 profile 压缩成候选节点，再按固定链路组成 `trained_candidate_chains`。

候选节点格式：

```json
{
  "profileId": "trained-case-xxx",
  "name": "专项节点名称",
  "modelTier": "weak 或 strong",
  "model": "节点默认模型",
  "sourceNodeType": "Generate/Draft",
  "output": ["下游字段"],
  "redLines": ["节点红线"],
  "artifact": "节点产物"
}
```

候选链格式：

```json
{
  "id": "trained-plan-draft-review",
  "templateType": "generate-variants",
  "chainShape": "Strategize/Plan -> Generate/Draft -> Review/Gate",
  "matchTerms": ["从用户原文命中的词"],
  "nodes": []
}
```

固定有效路径：

| 链路 id | 节点结构 | 适用情况 |
|---------|----------|----------|
| `trained-plan-draft-review` | Strategize/Plan -> Generate/Draft -> Review/Gate | 需要先定策略，再生成，最后终审 |
| `trained-standardize-draft-review` | Standardize -> Generate/Draft -> Review/Gate | 用户已有原始材料，需要先整理再改写/生成 |
| `trained-gather-analyze-draft-review` | Fetch/Gather -> Analyze/Judge -> Generate/Draft -> Review/Gate | 需要搜集事实、分析，再生成产物 |
| `trained-standardize-extract-action-review` | Standardize -> Extract/Validate -> Writeback/Action -> Review/Gate | 需要字段抽取、校验、payload 或系统写回 |
| `trained-classify-draft-review` | Classify/Route -> Generate/Draft -> Review/Gate | 需要先分类/路由，再生成回复或处理草稿 |

选择规则：

- 如果某条 `trained_candidate_chains` 的 profile 名称、职责、产物或红线接近用户原文，优先返回 `trainedChainId`。
- 返回 `trainedChainId` 时，`trainedProfileIds` 必须等于该链 `nodes.profileId` 的顺序。
- 不允许 Flash 自己组合 profile。
- 不允许 Flash 增删节点。
- 如果没有合适 trained 链，再选择下面的通用 `modelCombinationId`。

后端展开规则：

- 选中 `trainedChainId` 后，后端直接用该链 profile 生成 workflow tasks。
- 每个 task 的 `profileId` 和 `model` 来自候选节点。
- 每个 task 的 prompt 只由用户目标、节点产物、`output` 和 `redLines` 微调生成。
- Flash 只改短字段：`outputKind`、`inputFields`、`nodeTunings`、`patchSummary`、`guidance`。

## 模型组合穷举

### combo-fetch-structure-judge

模型链：弱 -> 弱 -> 强

对应模板：`fetch-summarize`

适用场景：

- `research-brief`: 行业调研、政策新闻、财报摘要
- `competitor-compare`: 竞品、功能、价格、选型对比
- `source-monitor`: 信息监控、来源跟踪
- `pricing-matrix`: 价格矩阵、套餐差异
- `policy-news-summary`: 政策新闻摘要

节点链：

| 节点 | Profile | 模型 | 能力边界 | 提示词模式 |
|------|---------|------|----------|------------|
| Fetch/Gather | `weak-research-extractor` | Flash | 只搬运可定位事实、来源、缺口；不判断不补事实 | `source_bound_fact_pack` |
| Standardize | `weak-structured-operator` | Flash | 只做 schema 化、去重、字段对齐；缺失字段 `unknown` | `schema_normalization` |
| Analyze/Judge | `research-report-analyst` | Pro | 基于事实做判断、矩阵、建议；区分事实/推断/假设 | `evidence_based_judgement` |

### combo-standardize-classify-draft-review

模型链：弱 -> 弱 -> 弱 -> 强

对应模板：`classify-route`

适用场景：

- `support-ticket-routing`: 客服工单路由
- `comment-triage`: 评论/留言分类
- `message-notice-draft`: 通知草稿和人工确认
- `complaint-priority`: 投诉优先级
- `manual-confirmation-queue`: 人工确认队列

节点链：

| 节点 | Profile | 模型 | 能力边界 | 提示词模式 |
|------|---------|------|----------|------------|
| Standardize | `weak-structured-operator` | Flash | 条目化输入、保留原文和上下文；不改写原意 | `item_queue_normalization` |
| Classify/Route | `classification-router` | Flash | 按固定标签输出置信度和路由；低置信/高风险转人工 | `bounded_label_routing` |
| Generate/Draft | `support-kb-responder` | Flash | 只生成可编辑草稿；不得新增上游未支持事实 | `evidence_bound_draft` |
| Review/Gate | `strong-quality-reviewer` | Pro | 必须裁决通过/返工/阻塞；识别隐藏风险 | `risk_gate_decision` |

### combo-standardize-extract-action-review

模型链：弱 -> 弱 -> 弱 -> 强

对应模板：`extract-writeback`

适用场景：

- `crm-writeback`: CRM 字段回写
- `invoice-extract`: 发票字段抽取
- `form-entry`: 表单录入
- `ticket-field-update`: 工单字段更新
- `payload-generation`: payload 生成

节点链：

| 节点 | Profile | 模型 | 能力边界 | 提示词模式 |
|------|---------|------|----------|------------|
| Standardize | `weak-structured-operator` | Flash | 整理原文和来源锚点；不猜缺失字段 | `source_span_preparation` |
| Extract/Validate | `structured-writeback-operator` | Flash | 字段抽取、格式校验、`needs_review`；不确定不填 | `anchored_field_extract` |
| Writeback/Action | `structured-writeback-operator` | Flash | 生成 payload、幂等键、重试建议；不执行高风险动作 | `validated_payload_build` |
| Review/Gate | `strong-quality-reviewer` | Pro | 审查 payload 完整性和来源充分性；裁决是否可写回 | `writeback_risk_gate` |

### combo-plan-generate-review

模型链：强 -> 弱 -> 强

对应模板：`generate-variants`

适用场景：

- `ab-copy-variants`: A/B 文案
- `title-cover-options`: 标题封面选项
- `ad-creative-batch`: 广告创意批量生成
- `script-variants`: 脚本变体
- `campaign-message-set`: 活动话术组

节点链：

| 节点 | Profile | 模型 | 能力边界 | 提示词模式 |
|------|---------|------|----------|------------|
| Strategize/Plan | `strong-task-architect` | Pro | 定方向、约束、指标；不写长文案不编造案例 | `strategy_constraints` |
| Generate/Draft | `content-draft-producer` | Flash | 按策略批量生成初稿；素材不足用占位符 | `bounded_variant_generation` |
| Review/Gate | `content-editor-reviewer` | Pro | 审查事实边界、风格、发布风险；裁决可用版本 | `editorial_quality_gate` |

### combo-gather-alert-review

模型链：弱 -> 弱 -> 强

对应模板：`monitor-alert`

适用场景：

- `public-opinion-alert`: 舆情告警
- `inventory-price-alert`: 库存/价格异常
- `incident-window-review`: 事故窗口复核
- `risk-threshold-monitor`: 风险阈值监控
- `regulatory-signal-alert`: 监管信号告警

节点链：

| 节点 | Profile | 模型 | 能力边界 | 提示词模式 |
|------|---------|------|----------|------------|
| Gather | `weak-research-extractor` | Flash | 整理时间窗口内事件、指标、来源；无来源 `unverified` | `event_window_pack` |
| Monitor/Alert | `monitor-alert-operator` | Flash | 阈值触发、轻中重分级、升级条件；不执行动作 | `threshold_severity_route` |
| Review/Gate | `strong-quality-reviewer` | Pro | 审查中重度告警证据，裁决升级/观察/驳回 | `alert_escalation_gate` |

## 生成返回字段

Flash 只返回小型 JSON，不写完整长 prompt。

后端已经完成以下推理动作，Flash 不再重新判断：

- 是否存在精确可复用 workflow
- 节点数量、节点顺序、节点 profile
- 每个节点的基础职责、红线和验收标准

Flash 只做两件事：

- 从上面的 `modelCombinationId` 和对应 `scenarioId` 中选择。
- 在后端给出的 `seed_json` 上做场景化填充，把节点名、purpose、schema 字段、风险规则改得更贴近用户目标。

## 节点微调规则库

生成节点时不要只改名字。每个节点必须按“职责、输入、输出、红线、交接”微调。

Flash 只需要先选通用节点链，再复制对应节点类型的规则，把字段短描述贴近用户任务。trained profile 只是通用节点的专项微调版本，不是新的节点体系。

| 节点类型 | 模型 | 职责 | 必须输出 | 红线 | 下游交接 |
|----------|------|------|----------|------|----------|
| Fetch/Gather | Flash | 搬运可定位事实，不判断 | `sources`, `facts`, `source_status`, `uncertainties`, `evidence_gaps`, `review_suggestions` | 不凭记忆补新闻/数字/链接；无来源标 missing/unverified；来源冲突并列保留 | `facts`, `sources`, `source_status`, `evidence_gaps` |
| Standardize | Flash | 输入标准化、格式转换、字段对齐 | `normalized_items`, `source_spans`, `missing_fields`, `conflict_notes`, `schema_version` | 严格按 schema；不猜缺失字段；不改原意 | `normalized_items`, `source_spans`, `missing_fields` |
| Classify/Route | Flash | 分类、置信度、路由目标 | `label`, `confidence`, `emotion`, `route_target`, `manual_review_reason`, `risk_flags` | 低置信转人工；高风险不自动放行；标签冲突写原因 | `label`, `confidence`, `route_target`, `risk_flags` |
| Extract/Validate | Flash | 字段抽取、格式校验、原文锚点 | `field_mapping`, `payload`, `validation_errors`, `needs_review`, `source_spans` | 不确定字段 needs_review；必填缺失不默认填 0/空；字段可追溯 | `payload`, `validation_errors`, `needs_review`, `source_spans` |
| Generate/Draft | Flash | 依据上游事实/策略生成可编辑草稿 | `draft_sections`, `variants`, `source_usage`, `placeholders`, `unsupported_claims_removed`, `risk_flags`, `editable_notes` | 不新增未支持事实/数字/案例；素材不足占位；不输出最终定稿 | `draft_sections`, `source_usage`, `placeholders`, `risk_flags` |
| Analyze/Judge | Flash/Pro | 基于事实做判断，区分事实/推断/假设/建议 | `judgements`, `evidence`, `confidence`, `assumptions`, `recommendations`, `counter_conditions` | 未验证来源不得高置信；建议绑定证据；写反证条件 | `judgements`, `recommendations`, `confidence`, `counter_conditions` |
| Strategize/Plan | Pro | 方向、约束、指标、优先级 | `strategy_direction`, `constraints`, `success_metrics`, `execution_priorities`, `validation_plan`, `handoff_to_next_nodes` | 不编造案例/金额/履历；不写长正文；必须给下游约束 | `strategy_direction`, `constraints`, `success_metrics` |
| Writeback/Action | Flash | 生成 payload、幂等键、重试建议 | `writeback_payload`, `idempotency_key`, `field_validation`, `retry_advice`, `blocking_errors` | 必填缺失阻塞；不默认填空；高风险动作不执行 | `writeback_payload`, `idempotency_key`, `blocking_errors` |
| Review/Gate | Pro | 质量审查、风险裁决、返工分配 | `decision`, `issues`, `evidence_checks`, `checklist_coverage`, `rework_assignment`, `final_acceptance` | 必须 pass/revise/block/escalate；不能只给建议；虚构事实必须阻塞 | `decision`, `issues`, `rework_assignment`, `final_acceptance` |
| Artifact/Render | Flash | 把上游结构化结果渲染成可预览、可下载、可交付的文件或报告 | `artifact_title`, `artifact_type`, `file_sections`, `render_payload`, `source_usage`, `preview_notes`, `missing_assets`, `risk_flags` | 不新增事实/图片/数字/引用；缺素材写 missing_assets；未审查内容不得标最终通过 | `artifact_type`, `render_payload`, `preview_notes`, `missing_assets`, `risk_flags` |
| Monitor/Alert | Flash | 异常摘要、阈值判断、分级响应 | `severity`, `trigger_reason`, `evidence`, `recommended_action`, `escalation`, `watch_items` | 不执行高风险动作；证据冲突升级；未验证信号不写成事故 | `severity`, `trigger_reason`, `evidence`, `escalation` |

微调硬规则：

- `purpose` 必须包含用户场景词、节点职责、最终产物词。
- `requiredInputs` 必须包含当前节点需要的用户输入或上游字段。
- `outputSchema` 至少 5 个字段，且必须含下游交接字段。
- `riskRules` 至少 3 条，弱模型节点必须含不得编造、缺失标记、低置信待审或转人工规则。
- `acceptance` 必须能被 Review/Gate 或用户验收，不写泛泛“质量好”。
- 强模型只放在策略、深度判断、终审裁决；弱模型只做可验证、可结构化、可回滚的小任务。
- 如果最终要在 workflow 框框右侧产出可预览资料文件，必须加入 `Artifact/Render`；它只负责渲染文件结构，不负责新增事实或最终裁决。

- `decision`: 固定为 `create-from-profiles`
- `modelCombinationId`: 必须来自模型组合穷举表
- `scenarioId`: 必须来自所选组合的适用场景
- `templateType`: `fetch-summarize` / `classify-route` / `extract-writeback` / `generate-variants` / `monitor-alert`
- `domain`: 用户场景所属行业，无法判断时为 `generic`
- `outputKind`: 8 到 18 个中文字符，描述最终产物
- `inputFields`: 必须包含 `task_goal`，材料明确必需时再加资料字段
- `nodeTunings`: 按模板节点顺序返回，每个节点只写微调字段
- `patchSummary`: 最多 2 条，说明相对通用模板改了什么
- `guidance`: 最多 1 条，告诉用户下一步

## nodeTunings 字段

每个节点返回：

- `id`: 节点 id，沿用模板节点 id
- `name`: 带用户场景词的节点名
- `purpose`: 该节点在本 workflow 里的具体职责
- `requiredInputs`: 读取哪些输入字段或上游字段
- `outputSchema`: 下游要消费的字段
- `riskRules`: 不得编造、低置信度、缺失项、人工审查等规则
- `acceptance`: 本节点完成标准

硬约束：

- `modelCombinationId` 必须来自穷举表。
- `scenarioId` 必须来自所选组合的适用场景。
- `templateType` 必须等于所选组合的对应模板。
- 保持 `seed_json.nodeTunings` 的节点 id、数量和顺序，不增删节点。
- 不写完整 task prompt，只写短字段。
- 每个节点必须含用户场景词和最终产物词。
- 每个节点必须暴露下游要消费的字段名。

## 模板选择穷举

### fetch-summarize

适用：调研、搜索、搜集、竞品、价格、功能对比、新闻、政策、报告、摘要、选型。

节点微调：

- Fetch/Gather：聚焦来源、事实、时间窗口、来源状态、缺口。
- Standardize/Structure：聚焦对比维度、事实表、去重、来源冲突。
- Analyze/Judge：聚焦摘要、对比矩阵、建议、证据锚点、置信度、反证条件。

### classify-route

适用：分类、标签、路由、优先级、分级、通知草稿、客服回复、人工确认。

节点微调：

- Standardize：条目化输入，保留原文、上下文、缺失字段。
- Classify/Route：输出标签、置信度、路由目标、人工审核原因。
- Generate/Draft：生成可编辑草稿，不新增未支持事实。
- Review/Gate：裁决通过、返工或阻塞。

### extract-writeback

适用：字段抽取、schema、表单、CRM、发票、工单、系统写回、payload。

节点微调：

- Standardize：整理原文材料和来源锚点。
- Extract/Validate：字段映射、格式校验、必填项、needs_review。
- Writeback/Action：payload、幂等键、重试建议、阻塞错误。
- Review/Gate：审查写回风险和来源充分性。

### generate-variants

适用：多版本、标题、封面、广告文案、A/B 测试、脚本变体。

节点微调：

- Strategize/Plan：生成方向、约束、成功指标、优先级。
- Generate/Draft：批量生成变体、占位符、风险标注。
- Review/Gate：事实边界、风格一致性、发布裁决。

### monitor-alert

适用：监控、阈值、异常、告警、舆情、库存、价格波动、风险窗口。

节点微调：

- Gather：时间窗口、事件、指标、来源状态。
- Classify/Alert：触发原因、轻中重分级、建议动作、升级条件。
- Review/Gate：中重度告警的升级、观察或驳回裁决。

## 兜底原则

- 模板命中不是最终结果，只能作为生成骨架。
- 如果 Flash 没在 6 秒内返回，用同一套微调规则本地生成定制 workflow。
- 本地兜底也必须包含用户场景词、输出产物、节点通信字段、风险规则和验收标准。
- 不向用户暴露 Flash 超时或内部失败文案。
