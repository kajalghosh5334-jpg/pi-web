# 求职经历分段标准化

- Case ID: `job-experience-standardize-001`
- Workflow: `WF-2`
- Node Type: `Standardize`
- Target Profile: `weak-structured-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `92`
- Pass: `true`
- Elapsed: `36212ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: none

## Input

原始经历散文：我之前帮朋友做过 Excel 自动处理，主要是 Python 读表、合并、去重；后来接过一个企业资料问答小项目，客户资料很乱，我先清洗文档，再做向量库和简单网页入口；还给一个门店老板写过库存提醒脚本，但没有长期维护。请拆成独立经历条目。

## Rubric

1. 拆成可独立处理的经历条目
2. 每条保留原始事实，不添加成果数字
3. 字段包含项目名称、任务、技术、角色、证据缺口
4. 缺少时间、公司、成果时标记 missing
5. 不做简历润色或岗位判断

## Node Output

```json
{
  "normalized_items": [
    {
      "project_name": "Excel自动处理工具",
      "tasks": "为朋友实现Excel自动处理，涉及读表、合并、去重操作",
      "technologies": ["Python"],
      "role": "协助者/开发者",
      "evidence_gap": {
        "time_period": "missing",
        "company": "missing",
        "quantitative_result": "missing",
        "specific_tech_detail": "missing（未说明具体使用了哪些Python库）"
      }
    },
    {
      "project_name": "企业资料问答系统",
      "tasks": "承接企业资料问答项目，清洗杂乱文档，构建向量库，搭建简易网页入口",
      "technologies": ["向量库", "网页入口"],
      "role": "承包开发者（承接方）",
      "evidence_gap": {
        "time_period": "missing",
        "company": "missing",
        "client_scale": "missing",
        "quantitative_result": "missing",
        "specific_tech_stack": "missing（向量库具体产品、网页入口具体框架均未指明）"
      }
    },
    {
      "project_name": "门店库存提醒脚本",
      "tasks": "为门店老板编写库存提醒脚本",
      "technologies": ["missing（原始文本未提及技术栈）"],
      "role": "脚本开发者",
      "evidence_gap": {
        "time_period": "missing",
        "company": "missing",
        "quantitative_result": "missing",
        "maintenance_status": "无长期维护（原始信息明确标注）"
      }
    }
  ],
  "field_mapping": {
    "原始表述（项目/做的事）": "project_name",
    "原始表述（具体职责）": "tasks",
    "原始表述（使用的工具语言）": "technologies",
    "原始表述（扮演角色）": "role",
    "原始表述（缺失的上下文）": "evidence_gap"
  },
  "missing_fields": {
    "company": "全部3个条目均缺失",
    "time_period": "全部3个条目均缺失",
    "quantitative_achievements": "全部3个条目均缺失"
  },
  "format_warnings": [
    "原始输入为一段连续散文，缺乏分段标记，标准化依赖语义切分，条目边界判断可能存在主观性",
    "部分技术栈描述笼统（如'向量库''网页入口'），具体产品/框架名称缺失",
    "条目3明确标注了'没有长期维护'，该风险信息已保留在evidence_gap中，未省略或美化"
  ],
  "handoff_summary": "已将原始散文按语义切分为3个独立经历条目（Excel自动处理、企业资料问答、库存提醒脚本）。每条保留了原始事实，未添加成果数字、未做简历润色。所有条目均缺失公司、时间、量化成果字段，已标记为missing。原始负向信息（无长期维护）已在对应条目中保留。"
}
```

## Judge

### Rubric Hits

- 成功拆分为3个独立经历条目（Excel自动处理、企业资料问答、库存提醒），符合可独立处理的要求
- 每条保留了原始事实描述（读表/合并/去重、清洗文档/向量库/网页入口、库存提醒），未添加成果数字
- 字段完整覆盖项目名称、任务、技术、角色、证据缺口
- 对缺失的时间、公司、量化成果等明确标记missing，并额外标注了维护状态等细粒度缺口
- 未做简历润色或岗位判断，语气保持中性
- 输出了必要的field_mapping、missing_fields汇总、format_warnings和handoff_summary，符合通用契约

### Missing

- technologies字段中“网页入口”被列为技术，但原文“简单网页入口”为功能描述，宜用通用术语或标记为缺失；同样“向量库”也非具体产品名
- 第三条technologies使用了描述性字符串“missing（原始文本未提及技术栈）”，虽然是数组元素，但更规范的做法是使用空数组或空值表示，并将解释放入evidence_gap
- field_mapping中描述“原始表述（使用的工具语言）”映射至technologies不够准确，因为原文并未明确提及所有技术为工具语言
- 角色字段轻微增加了推断（如“承包开发者（承接方）”），虽未改变事实含义但略超原始文本的直接角色描述

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- technologies字段应严格限定为具体技术名词，功能描述或通用类别应放入tasks或evidence_gap
- 对于无技术信息的条目，technologies字段宜置空或设为null，而非填充解释性文本，以保持数据结构的一致性
- 角色提取应尽量使用原文措辞（如“帮朋友写”可对应“协助开发”而非“承包开发者”），减少不必要的推断

### Prompt Patch Suggestions

- 在提示中加入：'technologies字段只填写具体的技术栈或工具名（如 Python、Elasticsearch、Flask），若原始文本未提及任何技术，则设为空数组'
- 强调：'角色字段仅转述原词，不做职位包装，避免增加承包、负责等未经确认的角色层级'
- 添加字段类型约束示例，避免将缺失标记的解释文本误填入值列表字段
