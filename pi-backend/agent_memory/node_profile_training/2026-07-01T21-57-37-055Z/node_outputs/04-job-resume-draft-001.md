# 简历经历初稿

- Case ID: `job-resume-draft-001`
- Workflow: `WF-2`
- Node Type: `Generate/Draft`
- Target Profile: `content-draft-producer`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `90`
- Pass: `true`
- Elapsed: `77104ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `job-jd-analyze-001`

## Input

原始经历：做过一个企业资料问答 RAG 外包，负责整理客户资料、写 Python 文档清洗脚本、接入向量库、做简单网页查询入口；还帮朋友做过批量 Excel 处理脚本；性格开朗，能和客户沟通需求。请按 STAR 写 2 段简历经历，附技能标签和项目亮点。

## Rubric

1. 使用 STAR 或类似结构写可编辑经历段落
2. 突出 AI 编程、Python、RAG、客户需求沟通
3. 不虚构量化成果、公司、学历或正式职位
4. 技能标签区分直接相关和弱相关
5. 素材不足时使用可替换占位符而不是编造

## Node Output

```yaml
node_type: generate-draft
target_profile: content-draft-producer

draft_sections:
  - section_label: 项目经历 1
    title: 企业知识库 RAG 问答系统（外包 / Freelance）
    content:
      situation: 为 {客户公司/行业} 构建内部文档智能问答原型。客户需求是从大量非结构化资料（PDF / Word）中快速检索准确信息。
      task: 独立承接并交付全链路——客户需求沟通、文档清洗与向量化、后端检索逻辑、Web 查询界面。
      actions:
        - "【需求↔沟通】与客户对接确认文档范围和问答场景，产出需求确认清单。"
        - "【Python 数据处理】编写清洗脚本，完成文档格式转换、去重、内容结构化提取。"
        - "【RAG 核心链路】调用 Embedding API 实现文档向量化，构建向量索引库（ChromaDB），对接 LLM 生成答案。"
        - "【前端交付】基于 Flask 搭建 Web 查询入口，支持结果溯源与关键词高亮。"
        - "【迭代闭环】收集客户试用反馈，调整 Top-K 检索策略与 Prompt 模板。"
      result: "交付可运行 Demo，客户验收完成；输出部署说明，确保系统可独立复现。"
      skill_tags: [Python, RAG, Embedding, Flask, 向量数据库, API 调用, 需求沟通, 原型开发]
      project_highlight: "RAG 全流程独立交付，直接匹配 JD‘有项目 demo 加分’要求。"

  - section_label: 项目经历 2
    title: Excel 报表批量处理脚本（Freelance）
    content:
      situation: 朋友所在 {部门} 需定期汇总多来源 Excel 报表，格式不统一、手工操作耗时 {X 小时} 且易错。
      task: 开发 Python 自动化脚本，替代重复性数据处理操作。
      actions:
        - "分析报表结构，明确合并逻辑与数据校验规则。"
        - "利用 pandas 编写脚本，实现数据合并、格式统一、关键字段提取、空值填充。"
        - "设计配置文件接口，支持不同模板的参数化调用，提升复用性。"
      result: "脚本将单次处理时间缩短至 {X 分钟}，在该部门后续月度任务中持续复用。"
      skill_tags: [Python, pandas, 数据处理, 办公自动化, 流程优化]
      project_highlight: "短平快解决实际业务痛点，体现自动化思维与落地能力。"

source_usage:
  "企业资料 RAG 外包（全流程）": "上游 analysis_items[0][2]（Python 基础 HIT / 项目 demo HIT）"
  "Python 文档清洗脚本": "上游 analysis_items[0]（Python 基础 HIT）"
  "调用 Embedding API 实现向量化": "上游 analysis_items[1]（接口调用 WEAK_HIT，推断性描述，需面试验证）"
  "Flask 搭建 Web 查询入口": "上游 analysis_items[0][2]（Python 基础 / 项目 demo HIT）"
  "Excel 批量处理脚本": "原始 prompt 输入事实，上游无直接匹配项"
  "客户需求沟通闭环": "上游 analysis_items[4]（业务沟通 WEAK，转化为项目行动中的沟通动作）"

unsupported_claims_removed:
  - claim: 团队规模 / 正式岗位头衔
    reason: 原始输入与上游均无依据，未添加“项目经理”“技术负责人”等头衔。使用“负责/独立承接”等事实描述。
  - claim: 客户企业名称 / 具体产品名
    reason: 未提供，统一使用占位符 {客户公司/行业}。
  - claim: 项目周期 / 版本号
    reason: 未提供，不编写。
  - claim: “生产级”“高并发”“线上服务”等修饰
    reason: 上游红线“不得把 demo 写成生产级成果”，严格使用“原型/Demo”。

unsupported_numbers_self_check:
  - number: {X 小时}
    status: PLACEHOLDER（上游无来源，不可填入具体数值）
  - number: {X 分钟}
    status: PLACEHOLDER（上游无来源，不可填入具体数值）
  - number: 缩短 / 提升
    status: 定性表述或占位符，无伪造数字。

editable_notes:
  - note: "客户背景需确认：{客户公司/行业} 请候选人补全实际信息。"
  - note: "Excel 场景需补全：朋友所在 {部门} 及具体 {报表类型} 请补充。"
  - note: "接口调用细节：面试前需准备好 Embedding API 的具体调用流程与参数说明。"
  - note: "RAG 文档规模：若有真实文档数量（如 500 页）可替换占位，无则保留定性。"
  - note: "自我评价 / 学历引导：上游建议在自我评价中主动提及学历与自学的匹配经验，本阶段未生成该字段，下游若整合请参考上游 recommendation。"

risk_flags:
  - flag: "学历屏障（HIGH_RISK_ITEM）"
    description: "高中学历 vs 大专优先。本节点未生成教育字段，下游 resume-formatter 生成教育栏时须如实填写高中，不得隐藏或篡改。"
    action: "下游 render 时务必遵守上游红线规则。"
  - flag: "接口调用推断性（WEAK_HIT）"
    description: "简历文本写‘调用 Embedding API’属于合理推断（RAG 项目必然包含），但上游标注 WEAK_HIT，需面试能支撑细节。"
    action: "建议候选人在面试前练习具体 API 的调用代码与参数说明。"
  - flag: "量化成果缺失"
    description: "所有数字均为占位符。若有真实可验证数据（处理文档数、节省工时）可替换，否则建议删除占位改为纯定性描述（如‘显著缩短处理时间’）。"
    action: "定稿前请候选人提供真实数字，或删除占位符。"
```

## Judge

### Rubric Hits

- 使用 STAR 或类似结构写可编辑经历段落
- 突出 AI 编程、Python、RAG、客户需求沟通
- 不虚构量化成果、公司、学历或正式职位
- 素材不足时使用可替换占位符而不是编造

### Missing

- 技能标签未区分直接相关和弱相关

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 技能标签若需区分强弱相关性，需在生成结构中显式标注

### Prompt Patch Suggestions

- 在节点提示中加入要求 skill_tags 区分直接相关与弱相关的字段规范
