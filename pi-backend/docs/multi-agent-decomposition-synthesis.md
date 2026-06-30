# Multi-Agent 自动拆分与合成机制设计

> 版本: v1.0
> 状态: 产品方案
> 适用范围: pi-backend Multi-Agent 编排系统

---

## 目录

1. [拆分机制](#1-拆分机制)
2. [执行编排](#2-执行编排)
3. [结果合成](#3-结果合成)
4. [端到端示例：设计一个产品方案](#4-端到端示例设计一个产品方案)
5. [附录：协议参考](#5-附录协议参考)

---

## 1. 拆分机制

### 1.1 什么时候需要拆分

Lead 在接到用户目标后，先用**五问框架**判断：用户真正要什么、主线是什么、约束有哪些。在此基础上，使用以下判断标准决定是否拆分：

| 条件 | 拆分决策 |
|------|---------|
| 任务涉及 3 个以上独立知识/技能维度 | 必须拆分 |
| 任务需要在 3 个以上文件/模块中操作 | 必须拆分 |
| 生成物预计超过 120k 字符 | 必须拆分，按章节拆 |
| 任务有明显的前置条件或依赖顺序 | 必须拆分，用 DAG 表达 |
| 单 Agent 在 90 秒内可完成 | 不拆分，直接派发 |
| 任务仅涉及分类/抽取/改写/路由判断 | 不拆分，单 Flash 模型 |
| 任务核心是同一个连贯推理链条 | 尽量不拆分，避免上下文割裂 |

### 1.2 拆分原则

拆分遵循 4 条原则，按优先级排列：

**原则 1: 语义完整 (Semantic Completeness)**
每个子任务是一个语义独立、可独立交付的单元。子 Agent 拿到 prompt 后不需要问"这个任务边界是什么"，就能独立完成。

**原则 2: 边界隔离 (Boundary Isolation)**
子任务之间不重叠、不遗漏（MECE——Mutually Exclusive, Collectively Exhaustive）。同一个事实/同一个代码模块不应被两个子任务同时处理（会导致后续冲突裁决）。

**原则 3: 粒度经济 (Granularity Economy)**
子任务的工作量控制在弱模型 60-90 秒可完成的范围内。没有收益的进一步拆分（如把一段连续文本拆成两句各一个任务）是过拆分，应避免。

**原则 4: 可验收 (Verifiable)**
每个子任务必须有明确的 Definition of Done 和 Acceptance Criteria。子 Agent 完成时，编排层可以逐条机械校验是否满足。

### 1.3 粒度控制

Lead 在 planning 阶段通过以下问题校准粒度：

```
这个子任务的输出是否能让下游直接使用？
如果只能，说明粒度合适。
如果不行，说明粒度太粗，需要继续拆分。
如果拆完下游反而更难拼，说明粒度太细，需要合并。
```

**典型粒度对标：**

| 任务类型 | 单个子任务典型范围 | 示例 |
|---------|-------------------|------|
| 调研类 | 一个维度/一个对比对象 | 调研竞品A的定价策略 |
| 设计类 | 一个模块/一个决策维度 | 模块的接口设计 |
| 实现类 | 一个文件/一个独立功能 | 实现一个API endpoint |
| 分析类 | 一个数据源/一个分析维度 | 分析用户留存数据 |
| 审查类 | 一个 artifact | 审查子任务t1的交付物 |

**过拆分检测：** 如果某个子任务的 prompt 中 90% 以上是背景说明而不是执行指令，大概率是过拆分。

### 1.4 依赖关系管理 (DAG)

Lead 用 `deps` 数组显式声明依赖。系统支持的四种依赖模式：

```
类型 1: 串行链 (Sequential Chain)
  A → B → C
  deps: A=[], B=['A'], C=['B']

类型 2: 并行扇出 (Parallel Fan-out)
     → B
  A  → C
     → D
  deps: A=[], B=['A'], C=['A'], D=['A']

类型 3: 扇入聚合 (Fan-in Join)
  A → C
  B → C
  C →
  deps: A=[], B=[], C=['A','B']

类型 4: 混合 DAG
  A → B → D
  A → C → D
  deps: A=[], B=['A'], C=['A'], D=['B','C']
```

**DAG 的构建规则：**

1. **根节点**（deps=[]）的数量不限，是所有无前置依赖的入口任务
2. **叶子节点**（无其他任务依赖它）的输出会进入合成阶段
3. **合成任务**（类型通常是 artifact-flow 或 Lead 亲自动手）依赖所有叶子节点
4. **循环依赖检测**：Lead 在生成 planning JSON 时必须保证 DAG 无环；运行时编排层也会做二次校验
5. **依赖传递**：如果 B 依赖 A，C 依赖 B，则 A 的交付物通过 artifact registry 传递给 B，B 的交付物传递给 C

**DAG 的表示（Planning JSON）：**
```json
{
  "tasks": [
    { "id": "t1", "deps": [], ... },
    { "id": "t2", "deps": ["t1"], ... },
    { "id": "t3", "deps": ["t1"], ... },
    { "id": "t4", "deps": ["t2", "t3"], ... },
    { "id": "t-syn", "deps": ["t4"], ... }
  ]
}
```

**依赖产物的传递：**
- 上游子任务的输出被写入 artifact registry
- 下游子任务的 prompt 中引用 `{{artifact.t1}}` 或由 Lead 在 prompt 中嵌入关键结论
- 合成任务的 prompt 中嵌入所有上游交付物摘要

---

## 2. 执行编排

### 2.1 执行流程总览

```
                ┌──────────────────────┐
                │  Lead Planning        │
                │  生成 tasks[] + DAG   │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  Topological Sort    │
                │  按 deps 计算执行层级 │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  按层并发执行          │
                │  同层无依赖任务并行    │
                └──────────┬───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Task A   │ │ Task B   │ │ Task C   │
        │ (Parallel)│ │(Parallel)│ │(Parallel)│
        └─────┬────┘ └─────┬────┘ └─────┬────┘
              │            │            │
              └────────────┼────────────┘
                           ▼
                ┌──────────────────────┐
                │  Completion Gate     │
                │  逐条校验 AC + 交接包 │
                └──────────┬───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Passed   │ │ Failed   │ │ Blocked  │
        │ → 继续   │ │ → Revision│ │ → 上报   │
        └──────────┘ └──────────┘ └──────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  Synthesis Task       │
                │  融合所有叶子输出      │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  Final Delivery Gate  │
                └──────────────────────┘
```

### 2.2 并行执行策略

**层级调度算法：**

```
1. 按 deps 计算每个 task 的层级 (level)
   - level = 0: deps 为空的任务
   - level = n: 所有依赖任务的最大 level + 1
2. 按 level 分组，同一 level 的任务可以并发执行
3. 编排器维护一个 maxConcurrency 参数控制并发度上限
```

**并发度控制：**
- 默认 `maxConcurrency=3`（可被 workflow 配置覆盖）
- 如果当前 level 的任务数 > maxConcurrency，排队执行
- 高优先级任务可提升 maxConcurrency（由 Lead 在 planning 中显式声明）

**任务启动条件：**
- 所有 deps 指向的任务状态为 `accepted`
- 所有 deps 的 artifact 已写入 registry
- 如果任意 dep 状态为 `failed` 或 `blocked`，当前任务标记为 `blocked` 并上报 Lead

### 2.3 Budget 约束体系

每个子任务必须携带 `budget` 字段，编排层按此执行门禁：

| 字段 | 默认值 | 含义 | 超出处理 |
|------|--------|------|---------|
| `timeoutMs` | 90000 | 单次执行最大耗时 | 超时后终止，按重试策略处理 |
| `progressTimeoutMs` | 45000 | 无任何中间输出的最长时间 | 超时后中断并重试 |
| `maxRetries` | 1 | 最大重试次数 | 超过后标记为 failed |
| `maxOutputChars` | 120000 | 最大输出字符数 | 超过后截断或拒绝 |
| `maxCost` | 不设置 | 可选最大成本（美元分） | 超出后降级模型或终止 |

**Budget 分层覆盖规则：**
1. Workflow 级别的 budget 作为全局默认值
2. Task 级别的 budget 覆盖 workflow 默认值（更细粒度）
3. Profile 级别的 budget 作为第二优先级
4. 最终 runtime 实际值 = task.budget || profile.budget || workflow.budget || 系统默认

### 2.4 重试与降级策略

**重试触发条件：**

| 失败信号 | 判定依据 | 重试策略 |
|---------|---------|---------|
| 超时 (`timeout`) | 子 Agent 无响应超过 timeoutMs | 升级模型重试（Flash → Pro） |
| 无进度 (`stalled`) | 超过 progressTimeoutMs 无中间输出 | 同模型重试，prompt 追加"立即输出" |
| 格式错误 (`format_error`) | 交接包解析失败/缺少关键字段 | 同模型重试，强化输出格式要求 |
| 质量不达标 (`quality_fail`) | 完成门禁未通过 | 升级模型重试 + teachingNote |
| 空输出 (`empty_output`) | Agent 返回空字符串 | 同模型重试，prompt 强调不得返回空 |

**重试次数耗尽后的动作：**

```
if retryCount >= maxRetries:
  1. 标记 task 状态为 failed
  2. Lead 触发降级决策:
     a. 如果当前 task 不是关键路径 -> 跳过，用默认值/占位符填充
     b. 如果当前 task 是关键路径 -> 升级为强模型执行
     c. 如果强模型也失败 -> 标记为 blocked，上报用户
  3. 所有依赖当前 task 的下游 task 标记为 blocked
```

### 2.5 协作状态管理

执行过程中，每个子 Agent 可能处于以下协作状态：

| 状态 | 含义 | 响应动作 |
|------|------|---------|
| `pending` | 等待调度 | 编排器检查 deps 就绪后启动 |
| `running` | 正在执行 | 监控 progressTimeout |
| `waiting_material` | 等待上游物料 | 检查 artifact registry |
| `waiting_lead_decision` | 等待 Lead 判断 | Lead 必须在轮询间隔内响应 |
| `ready_for_review` | 已交付待审查 | 编排器触发 Lead review 回调 |
| `needs_revision` | Lead 要求修订 | 派生 revisionTask |
| `debugging` | 正在被调教 | 进入 agent-coach 链路 |
| `accepted` | Lead 已接受 | 解锁下游依赖 |
| `failed` | 重试耗尽 | 触发降级决策 |
| `blocked` | 不可继续 | 上报 Lead 和用户 |

---

## 3. 结果合成

### 3.1 合成时机

当满足以下条件时触发合成：

1. 所有叶子节点（无出边的 task）的状态均为 `accepted`
2. 对应的 artifacts 已写入 registry
3. 存在一个依赖所有叶子节点的合成任务（或在 workflow 中指定的最终合成任务）

合成任务本身也是一个标准 task，拥有自己的 profile、模型、budget 和验收标准。它与普通 task 的唯一区别是：它的 prompt 动态包含所有上游 artifacts 的摘要。

### 3.2 合成策略

四种合成策略由 Lead 在 planning 中指定（`synthesisStrategy` 字段），编排层按策略执行不同的 prompt 模板：

| 策略 | 适用场景 | Prompt 模板 |
|------|---------|------------|
| `concatenation` | 独立章节/无交叉引用 | 按顺序拼接各子任务输出 |
| `structured_fusion` | 多维度分析/有交叉引用 | 合并结构，消除重叠，标注来源 |
| `hierarchical_assembly` | 有层级关系/目录结构 | 构建目录，按层级填充 |
| `argumentative_synthesis` | 有争议/需要权衡决策 | 比较各方论据，输出裁决 |

**策略选择规则：**
- 如果各子任务的输出边界完全独立（如"调研竞品A"+"调研竞品B"），用 `concatenation`
- 如果各子任务的输出覆盖同一主题的不同维度（如"技术可行性"+"商业可行性"），用 `structured_fusion`
- 如果子任务之间存在包含关系（如"顶层架构设计"+"模块A设计"），用 `hierarchical_assembly`
- 如果子任务的结论之间存在分歧（如"方案X可行"+"方案X不可行"），用 `argumentative_synthesis`

### 3.3 冲突裁决

当多个子任务的输出对同一事实或判断存在分歧时，合成任务必须执行冲突裁决。

**冲突类型与裁决规则：**

| 冲突类型 | 示例 | 裁决规则 |
|---------|------|---------|
| **事实冲突** | A 说"市场规模100亿"，B 说"市场规模200亿" | 引证裁决：检查双方引用的数据源，引用更权威/更新的数据源的一方胜出；均无引用时标记为"数据待确认" |
| **判断冲突** | A 说"方案可行"，B 说"方案不可行" | 强模型裁决：升级到 Lead 或 Pro 模型，综合双方论据做最终判断 |
| **范围冲突** | A 输出了用户画像，B 也输出了用户画像且内容不同 | 边界裁决：检查 task prompt 的原始边界定义，超出边界的输出裁剪，边界内的以更详细的一版为准 |
| **数值冲突** | A 引用了"用户数1000万"，B 引用了"用户数800万" | 版本裁决：检查引用时间点，如果数值因时间不同而变化，取最新时间点 |
| **术语冲突** | A 用"PA"，B 用"付费用户"指同一概念 | 归一化裁决：统一替换为 Lead 在 planning 中指定的标准术语 |

**冲突裁决的协议表示：**

在 Review 阶段的 JSON 输出中，冲突通过 `conflicts` 数组表达：

```json
{
  "conflicts": [
    {
      "artifactIds": ["t1-output", "t2-output"],
      "conflictType": "fact|judgment|scope|numeric|terminology",
      "summary": "冲突描述",
      "proposalT1": "子任务t1的观点",
      "proposalT2": "子任务t2的观点",
      "decision": "accept_t1 | accept_t2 | merge | revise | ask_user",
      "reason": "裁决理由，必须写明为什么选这个方案"
    }
  ]
}
```

### 3.4 一致性检查

合成任务在输出最终交付物前，必须执行一致性检查。检查清单如下：

| 检查项 | 检查方法 | 修复动作 |
|-------|---------|---------|
| **术语一致性** | 扫描最终交付物中核心术语是否统一 | 自动替换为统一术语 |
| **格式一致性** | 检查各级标题、列表、代码块格式 | 自动格式化 |
| **数值一致性** | 跨章节引用的数值是否一致 | 自动对齐，标注不一致处 |
| **逻辑一致性** | 前文的判断与后文的判断是否矛盾 | 标记矛盾点，由合成任务自行裁决策略 |
| **引用一致性** | artifact 编号、文件名、URL 是否可解析 | 自动修复或删除不存在的引用 |
| **覆盖完整性** | 是否覆盖了所有子任务的核心结论 | 补充遗漏的结论 |

**一致性检查的通过标准：**
- 术语一致性：100% 通过
- 格式一致性：100% 通过
- 数值一致性：95%+ 通过（容忍个位数四舍五入误差）
- 逻辑一致性：无矛盾
- 引用一致性：100% 通过
- 覆盖完整性：100% 覆盖

### 3.5 合成任务的交付门禁

合成任务输出后，Lead 或编排器执行最终交付门禁：

```
门禁 1: 完整性门禁
  - 所有子任务的核心结论是否都被引用/整合？
  - 如果有遗漏，标记为 incomplete，要求补充

门禁 2: 一致性门禁
  - 一致性检查清单是否全部通过？
  - 如果有未解决的冲突，不允许进入 final report

门禁 3: 目标对齐门禁
  - 合成输出是否直接回答了用户的原始目标？
  - 如果偏离，标记为 misaligned，要求 Lead 修正

门禁 4: 格式门禁
  - 交付物是否符合用户要求的格式（设计文档/代码/JSON等）？
  - 如果不符合，自动格式化或要求重做
```

**门禁通过条件：** 所有 4 项门禁必须全部通过。任何一项未通过，合成任务都不能进入 final report 阶段。

---

## 4. 端到端示例：设计一个产品方案

### 4.1 用户目标

> "设计一个面向开发者的 API 网关产品方案，包含市场分析、产品定位、功能规划、技术架构、定价策略、发布路线图。"

### 4.2 Lead 分析

**五问框架判断：**
- 用户真正想要的：一份可直接用于汇报的产品方案文档
- 关键约束：覆盖用户指定的 6 个维度
- 最值得先做的事：先定义产品边界和用户画像，再做后续分析
- 主线动作：调研 → 定位 → 功能 → 架构 → 定价 → 路线图
- 怎样才算贴近用户目标：一份自包含的产品方案，让读者看完能决定是否立项

**拆分判断：**
- 六个维度相互独立 → 必须拆分
- 市场分析不需要依赖其他任务 → 可并行
- 产品定位依赖市场分析的结论 → 串行
- 功能规划依赖产品定位 → 串行
- 技术架构和定价策略依赖功能规划 → 扇出
- 发布路线图依赖所有上游 → 扇入

### 4.3 Planning JSON

```json
{
  "summary": "为开发者API网关产品方案生成一份多维度、可执行的产品方案文档",
  "requiresUserConfirmation": false,
  "reason": "六个维度相互独立且存在依赖关系，拆分为6个子任务+1个合成任务，按DAG执行",
  "flowDomain": "product_design",
  "stages": [
    { "stage": "拆分执行", "goal": "执行6个子任务调研+1个合成任务" }
  ],
  "tasks": [
    {
      "id": "t1",
      "name": "市场分析",
      "profileId": "general-executor",
      "skills": ["output-spec", "output-engine"],
      "model": "opencode-go/deepseek-v4-flash",
      "modelSource": "lead_selected",
      "modelReason": "市场分析是结构化调研任务，不需要代码能力，Flash性价比最优",
      "taskStages": [
        { "stage": "拆分执行", "goal": "输出市场分析报告" }
      ],
      "currentTaskStage": "拆分执行",
      "needsPlanDiscussion": false,
      "definitionOfDone": "输出API网关市场分析报告，包含市场规模、竞品格局、趋势判断",
      "acceptanceCriteria": [
        "包含全球API网关市场规模（引用来源）",
        "列出至少3个主要竞品及差异化分析",
        "给出至少2个关键市场趋势",
        "输出格式为结构化Markdown"
      ],
      "budget": {
        "timeoutMs": 90000,
        "progressTimeoutMs": 45000,
        "maxRetries": 1,
        "maxOutputChars": 80000
      },
      "prompt": "调研API网关市场。输出：市场规模（引用权威数据源）、主要竞品（AWS API Gateway、Kong、Apigee等至少3个）的差异化分析、至少2个关键市场趋势。格式为结构化Markdown，用于下游产品定位使用。",
      "deps": []
    },
    {
      "id": "t2",
      "name": "目标用户与场景分析",
      "profileId": "general-executor",
      "skills": ["output-spec", "output-engine"],
      "model": "opencode-go/deepseek-v4-flash",
      "modelSource": "lead_selected",
      "modelReason": "用户场景分析是结构化调研，Flash性价比最优",
      "taskStages": [
        { "stage": "拆分执行", "goal": "输出用户分析报告" }
      ],
      "currentTaskStage": "拆分执行",
      "needsPlanDiscussion": false,
      "definitionOfDone": "输出目标用户画像和使用场景分析",
      "acceptanceCriteria": [
        "定义至少3种目标用户画像",
        "每种画像给出核心使用场景",
        "给出每种用户的痛点和未满足需求",
        "输出格式为结构化Markdown"
      ],
      "budget": {
        "timeoutMs": 90000,
        "progressTimeoutMs": 45000,
        "maxRetries": 1,
        "maxOutputChars": 60000
      },
      "prompt": "分析面向开发者的API网关产品的目标用户。输出：至少3种用户画像（如前端开发者、后端开发者、API产品经理），每种画的核心场景、痛点、当前解决方案的不足。格式为结构化Markdown。",
      "deps": []
    },
    {
      "id": "t3",
      "name": "产品定位",
      "profileId": "general-executor",
      "skills": ["output-spec", "output-engine"],
      "model": "opencode-go/deepseek-v4-flash",
      "modelSource": "lead_selected",
      "modelReason": "产品定位需要综合市场分析和用户输入，但仍可用Flash完成结构化输出",
      "taskStages": [
        { "stage": "拆分执行", "goal": "输出产品定位文档" }
      ],
      "currentTaskStage": "拆分执行",
      "needsPlanDiscussion": false,
      "definitionOfDone": "输出产品定位说明，包含价值主张、差异化定位和不做范围",
      "acceptanceCriteria": [
        "给出清晰的价值主张（一句话定位）",
        "对比竞品说明差异化定位",
        "明确不做范围（Out of Scope）",
        "输出格式为结构化Markdown"
      ],
      "budget": {
        "timeoutMs": 90000,
        "progressTimeoutMs": 45000,
        "maxRetries": 1,
        "maxOutputChars": 60000
      },
      "prompt": "基于市场分析和用户场景分析的结论，定义产品定位。输出：一句话价值主张、与主要竞品（AWS/Gateway/Kong）的差异化定位、明确的不做范围。\n\n上游物料摘要：\n{{artifact.t1}} 的市场分析结论——市场规模、竞品格局。\n{{artifact.t2}} 的用户分析结论——用户画像、核心痛点。",
      "deps": ["t1", "t2"]
    },
    {
      "id": "t4",
      "name": "功能规划",
      "profileId": "general-executor",
      "skills": ["output-spec", "output-engine"],
      "model": "opencode-go/deepseek-v4-pro",
      "modelSource": "lead_selected",
      "modelReason": "功能规划需要考虑技术可行性、优先级编排和依赖关系，用Pro保证规划质量",
      "taskStages": [
        { "stage": "拆分执行", "goal": "输出功能清单和优先级" }
      ],
      "currentTaskStage": "拆分执行",
      "needsPlanDiscussion": false,
      "definitionOfDone": "输出功能清单，包含MVP、Phase2、Phase3的优先级排列",
      "acceptanceCriteria": [
        "MVP功能清单不少于8个功能",
        "给出功能优先级排期（MVP/Phase2/Phase3）",
        "每个功能附带价值/成本说明",
        "输出格式为结构化Markdown"
      ],
      "budget": {
        "timeoutMs": 120000,
        "progressTimeoutMs": 60000,
        "maxRetries": 1,
        "maxOutputChars": 100000
      },
      "prompt": "基于产品定位，规划API网关的功能清单。输出：按MVP/Phase2/Phase3三个阶段的完整功能清单，每个功能附带价值说明和实现成本估算。\n\n上游物料摘要：\n{{artifact.t3}} 的产品定位——价值主张、差异化方向。",
      "deps": ["t3"]
    },
    {
      "id": "t5",
      "name": "技术架构概要",
      "profileId": "general-executor",
      "skills": ["engineering-mode", "output-spec", "output-engine"],
      "model": "opencode-go/glm-5.2",
      "modelSource": "lead_selected",
      "modelReason": "技术架构需要代码级理解能力，选择代码模型GLM-5.2",
      "taskStages": [
        { "stage": "拆分执行", "goal": "输出技术架构文档" }
      ],
      "currentTaskStage": "拆分执行",
      "needsPlanDiscussion": false,
      "definitionOfDone": "输出API网关的高层技术架构设计",
      "acceptanceCriteria": [
        "给出整体架构图（文字描述）",
        "说明核心模块及职责",
        "说明技术选型及其理由",
        "输出格式为结构化Markdown"
      ],
      "budget": {
        "timeoutMs": 120000,
        "progressTimeoutMs": 60000,
        "maxRetries": 1,
        "maxOutputChars": 100000
      },
      "prompt": "设计API网关的高层技术架构。输出：整体架构描述、核心模块（路由、鉴权、限流、监控等）及职责、关键技术选型及理由。\n\n上游物料摘要：\n{{artifact.t4}} 的功能清单——需要支持的核心功能。",
      "deps": ["t4"]
    },
    {
      "id": "t6",
      "name": "定价策略与路线图",
      "profileId": "general-executor",
      "skills": ["output-spec", "output-engine"],
      "model": "opencode-go/deepseek-v4-flash",
      "modelSource": "lead_selected",
      "modelReason": "定价策略是业务分析，不需要代码能力，Flash最优",
      "taskStages": [
        { "stage": "拆分执行", "goal": "输出定价方案和发布路线图" }
      ],
      "currentTaskStage": "拆分执行",
      "needsPlanDiscussion": false,
      "definitionOfDone": "输出定价方案和产品发布路线图",
      "acceptanceCriteria": [
        "给出至少2种定价方案对比",
        "给出6个月的产品发布路线图",
        "每个里程碑有关键交付物",
        "输出格式为结构化Markdown"
      ],
      "budget": {
        "timeoutMs": 90000,
        "progressTimeoutMs": 45000,
        "maxRetries": 1,
        "maxOutputChars": 80000
      },
      "prompt": "基于功能规划和技术架构，设计定价策略和发布路线图。输出：至少2种定价方案对比（含适用范围、优劣势）、6个月的产品发布路线图（按月划分，每个季度关键里程碑和交付物）。\n\n上游物料摘要：\n{{artifact.t4}} 的功能清单——MVP/Phase2/Phase3的功能划分。\n{{artifact.t5}} 的技术架构——支撑定价的技术成本评估。",
      "deps": ["t4", "t5"]
    },
    {
      "id": "t-syn",
      "name": "合成：产品方案文档",
      "profileId": "general-executor",
      "skills": ["output-spec", "output-engine"],
      "model": "opencode-go/deepseek-v4-pro",
      "modelSource": "lead_selected",
      "modelReason": "合成任务需要综合6个子任务输出并做冲突裁决和一致性检查，用Pro保证合成质量",
      "taskStages": [
        { "stage": "拆分执行", "goal": "输出最终产品方案文档" }
      ],
      "currentTaskStage": "拆分执行",
      "needsPlanDiscussion": false,
      "definitionOfDone": "输出一份可直接用于汇报的完整产品方案文档",
      "acceptanceCriteria": [
        "包含所有6个子任务的核心结论",
        "章节逻辑连贯、前后一致",
        "无未解决的冲突",
        "术语统一",
        "格式规范、可直接用作汇报材料"
      ],
      "budget": {
        "timeoutMs": 180000,
        "progressTimeoutMs": 90000,
        "maxRetries": 0,
        "maxOutputChars": 200000
      },
      "prompt": "你是产品方案合成专家。将以下6个子任务的输出合成为一份完整、连贯的产品方案文档。\n\n所有上游交付物：\n1. 市场分析：{{artifact.t1}}\n2. 目标用户与场景：{{artifact.t2}}\n3. 产品定位：{{artifact.t3}}\n4. 功能规划：{{artifact.t4}}\n5. 技术架构：{{artifact.t5}}\n6. 定价策略与路线图：{{artifact.t6}}\n\n合成要求：\n- 构建文档结构：摘要 → 市场分析 → 用户与场景 → 产品定位 → 功能规划 → 技术架构 → 定价策略 → 发布路线图 → 附录\n- 检查并解决所有冲突（事实冲突、判断冲突、范围冲突、术语冲突、数值冲突）\n- 统一术语（全文中经济使用同一套术语）\n- 确保数值一致（跨章节的同一数值必须一致）\n- 确保逻辑连贯（前文判断与后文建议不矛盾）\n- 每个子任务的结论均被引用，无遗漏\n- 冲突裁决必须在文档中标注来源并给出理由\n\n输出格式：结构化Markdown，二级标题为章节，每节包含上游结论引用标注。",
      "deps": ["t1", "t2", "t3", "t4", "t5", "t6"]
    }
  ],
  "reviewPolicy": "lead_plus_reviewer",
  "finalReportInstruction": "汇报产品方案文档、关键决策点、未解决的风险和下一步行动建议"
}
```

### 4.4 DAG 结构

```
Level 0:  t1(市场分析) ──┐
          t2(用户与场景) ──┤
                          │
Level 1:  t3(产品定位) ◄──┘
                          │
Level 2:  t4(功能规划) ◄──┘
                          │
                ┌─────────┤
                ▼         ▼
Level 3:  t5(技术架构)  t6(定价与路线图)
                │         │
                └────┬────┘
                     ▼
Level 4:  t-syn(产品方案文档)
```

### 4.5 执行时序

```
时间轴
│
├─ [0s]    t1(Flash) 和 t2(Flash) 同时启动
│          ← Level 0 并行执行
│
├─ [~60s]  t1 交付 market-analysis artifact
│          t2 交付 user-scenario artifact
│          Lead 审查 Level 0 结果 → accepted
│
├─ [60s]   t3(Flash) 启动
│          ← Level 1 单任务
│
├─ [~100s] t3 交付 positioning artifact
│          Lead 审查 → accepted
│
├─ [100s]  t4(Pro) 启动
│          ← Level 2 单任务（需要更强模型）
│
├─ [~160s] t4 交付 feature-plan artifact
│          Lead 审查 → accepted
│
├─ [160s]  t5(GLM-5.2) 和 t6(Flash) 同时启动
│          ← Level 3 扇出并行
│
├─ [~220s] t5 交付 architecture artifact
│          t6 交付 pricing-roadmap artifact
│          Lead 审查 → accepted
│
├─ [220s]  t-syn(Pro) 启动 — 冲突裁决 + 一致性检查 + 方案合成
│          ← Level 4 合成任务
│
├─ [~280s] t-syn 交付最终产品方案文档
│          Lead 执行最终门禁
│          → 所有门禁通过，进入 final report
│
└─ [~300s] Lead 输出面向用户的最终汇报
```

### 4.6 冲突与一致性检查示例

假设在合成阶段发现以下冲突：

**冲突 1 — 数值冲突：**
- t1 市场分析说 "全球 API 网关市场 2025 年规模 45 亿美元"
- t6 定价策略引用了同一数据点但写的是 "40 亿美元"
- 裁决：接受 t1 的数据（原调研直接引用来源），t6 的数值修正

**冲突 2 — 术语冲突：**
- t3 产品定位中使用 "API First"
- t4 功能规划中使用 "API 优先"
- 裁决：统一使用 "API 优先"

**冲突 3 — 判断冲突：**
- t5 技术架构选择 "Go 语言作为核心运行时"
- t6 定价策略假设了 "采用 Rust 以降低基础设施成本"
- 裁决：接受 t5 的技术选型（技术架构任务更权威），修正定价策略假设

合成任务在最终文档中附带冲突裁决说明表。

### 4.7 交付门禁结果

| 门禁 | 结果 | 备注 |
|------|------|------|
| 完整性门禁 | ✅ 通过 | 全部6个子任务结论已整合 |
| 一致性门禁 | ✅ 通过 | 3处冲突已裁决，术语已统一 |
| 目标对齐门禁 | ✅ 通过 | 完整覆盖用户要求的6个维度 |
| 格式门禁 | ✅ 通过 | 结构化Markdown，可直接用于汇报 |

---

## 5. 附录：协议参考

### 5.1 Planning JSON 中与拆分合成相关的字段

| 字段 | 类型 | 用途 |
|------|------|------|
| `tasks[].deps` | `string[]` | 声明任务依赖，构建DAG |
| `tasks[].definitionOfDone` | `string` | 任务完成的定义 |
| `tasks[].acceptanceCriteria` | `string[]` | 验收标准，门禁逐条校验 |
| `tasks[].budget.timeoutMs` | `number` | 单次执行超时 |
| `tasks[].budget.progressTimeoutMs` | `number` | 无进度超时 |
| `tasks[].budget.maxRetries` | `number` | 最大重试次数 |
| `tasks[].budget.maxOutputChars` | `number` | 最大输出字符数 |
| `tasks[].model` | `string` | 子任务使用模型 |
| `tasks[].modelReason` | `string` | 模型选择理由 |

### 5.2 Review JSON 中与冲突裁决相关的字段

| 字段 | 类型 | 用途 |
|------|------|------|
| `conflicts[].artifactIds` | `string[]` | 冲突涉及的 artifacts |
| `conflicts[].conflictType` | `string` | 冲突类型 |
| `conflicts[].summary` | `string` | 冲突描述 |
| `conflicts[].decision` | `string` | 裁决决定 |
| `conflicts[].reason` | `string` | 裁决理由 |
| `revisionTasks[].revisionKind` | `string` | 修订类型 |

### 5.3 合成任务协议

合成任务本身也是一个 task，但有以下额外约束：

- `synthesisStrategy` 在 task 级别通过 prompt 隐式表达，由 Lead 的 prompt 设计决定
- 合成任务的 `deps` 必须包含所有叶子节点 task
- 合成任务的 budget 应比普通 task 更宽松（timeout 180s+）
- 合成任务完成时，必须包含冲突裁决说明
- 合成任务的输出经过最终交付门禁后，进入 final report

### 5.4 完整门禁流程伪代码

```
function executeCompletionGate(task, artifact):
  // 门禁 1: 完整性
  for each upstream in task.deps:
    if upstream's core conclusion not found in artifact.output:
      fail("完整性: 遗漏上游 " + upstream.id + " 的结论")

  // 门禁 2: 一致性
  conflicts = findConflicts(artifact.output)
  for each conflict in conflicts:
    if conflict.decision == "ask_user":
      fail("一致性: 存在未裁决冲突 " + conflict.summary)

  // 门禁 3: 目标对齐
  if not artifact.output aligned with original user goal:
    fail("目标对齐: 输出偏离用户原始目标")

  // 门禁 4: 格式
  if not artifact.output matches required format:
    fail("格式: 输出格式不符合要求")

  return PASSED
```
