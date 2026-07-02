# 求职经历分段标准化

- Case ID: `job-experience-standardize-001`
- Workflow: `WF-2`
- Node Type: `Standardize`
- Target Profile: `weak-structured-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `71764ms`
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
      "project_name": "Excel自动处理",
      "tasks": ["用Python读取Excel表格", "合并表格", "去重"],
      "technologies": ["Python"],
      "role": "帮朋友",
      "evidence_gap": "无时间、无公司、无成果量化、无是否独立完成"
    },
    {
      "project_name": "企业资料问答小项目",
      "tasks": ["清洗文档", "构建向量库", "开发简单网页入口"],
      "technologies": [],
      "role": "项目承接（个人）",
      "evidence_gap": "无客户名、无时间范围、无公司、无技术栈具体产品、无成果反馈"
    },
    {
      "project_name": "库存提醒脚本",
      "tasks": ["编写库存提醒脚本", "未长期维护"],
      "technologies": [],
      "role": "为门店老板开发",
      "evidence_gap": "无脚本语言、无使用情况、无时间、无公司、无具体维护期"
    }
  ],
  "field_mapping": {
    "project_name": "从原文概括的任务范围",
    "tasks": "从原文动作短语分段提取",
    "technologies": "原文明确出现的语言/工具/框架/产品名",
    "role": "从原文参与关系描述提取，不添加头衔",
    "evidence_gap": "原文明确缺失或未提供的关键信息"
  },
  "missing_fields": [
    "公司/组织名称",
    "开始时间",
    "结束时间",
    "量化成果/收益",
    "正式角色/职位",
    "团队规模"
  ],
  "format_warnings": [
    "原文为连续散文，经历间无分隔标记，拆分基于语义边界",
    "第二条的'向量库'属通用描述，未指定具体产品，未列入技术栈",
    "第三条未说明脚本语言，无法列入技术栈",
    "所有条目均缺少时间、公司、成果，可能有更多未提及的背景"
  ],
  "handoff_summary": "将原始散文拆分为3条独立经历条目。技术栈仅第一条明确出现Python；角色均为非正式个人关系；缺失时间、公司、量化成果等标准字段。未添加推断事实，未做简历润色。"
}
```

## Judge

### Rubric Hits

- 拆成可独立处理的经历条目
- 每条保留原始事实，不添加成果数字
- 字段包含项目名称、任务、技术、角色、证据缺口
- 缺少时间、公司、成果时标记 missing
- 不做简历润色或岗位判断

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 无

### Prompt Patch Suggestions

- 无
