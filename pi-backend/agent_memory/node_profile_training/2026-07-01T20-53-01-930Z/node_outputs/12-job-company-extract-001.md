# 公司字段抽取

- Case ID: `job-company-extract-001`
- Workflow: `WF-3`
- Node Type: `Extract`
- Target Profile: `structured-writeback-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `95`
- Pass: `true`
- Elapsed: `38589ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `job-company-gather-001`

## Input

请从上游公司调研资料中抽取字段：business_domain、tech_stack、salary_range、education_requirement、interview_topics、unknown_fields。每个字段必须有 source_anchor。

## Rubric

1. 抽取指定字段并保留 source_anchor
2. 未出现字段放入 unknown_fields
3. 不新增公司规模、融资、文化等未出现信息
4. salary_range 和 education_requirement 不得改写含义
5. 输出可供公司档案渲染使用

## Node Output

```json
{
  "extracted_fields": [
    {
      "field": "business_domain",
      "value": "制造业质检自动化与设备数据采集服务",
      "source_anchor": "官网片段：公司为制造业客户提供质检自动化和设备数据采集服务",
      "confidence": "high"
    },
    {
      "field": "tech_stack",
      "value": "Python, OpenCV, PLC, 轻量化模型部署",
      "source_anchor": "官网片段：技术关键词包括 Python、OpenCV、PLC、轻量化模型部署",
      "confidence": "high"
    },
    {
      "field": "salary_range",
      "value": "5-7k（周期未说明）",
      "source_anchor": "招聘JD片段：薪资范围为 5-7k（周期未说明）",
      "confidence": "medium"
    },
    {
      "field": "education_requirement",
      "value": "大专及以上优先（非硬性）",
      "source_anchor": "招聘JD片段：学历要求为「大专及以上优先」（优先条件，非硬性）",
      "confidence": "high"
    },
    {
      "field": "interview_topics",
      "value": "Python 文件处理、接口调用、项目 demo 经验",
      "source_anchor": "面经摘录：面试会问 Python 文件处理、接口调用、是否做过项目 demo",
      "confidence": "medium"
    },
    {
      "field": "unknown_fields",
      "value": [
        "公司注册全称",
        "办公城市/地点",
        "公司成立时间/发展阶段",
        "员工规模",
        "融资情况",
        "公司文化/价值观",
        "JD完整职责描述",
        "面试完整流程",
        "薪资周期与结构",
        "技术栈具体版本或品牌"
      ],
      "source_anchor": "上游 unknown_fields 及材料覆盖不足，以上字段在所有给定材料中均未出现",
      "confidence": "high"
    }
  ],
  "missing_required_fields": [],
  "validation_errors": [
    {
      "severity": "info",
      "message": "education_requirement 标注为“优先条件，非硬性”，渲染时需明确这是 preferred 而非 mandatory"
    },
    {
      "severity": "info",
      "message": "salary_range 未注明周期（月薪/周薪），渲染时需要标注周期未知"
    },
    {
      "severity": "info",
      "message": "interview_topics 仅来源于单一面经，可能不具代表性，渲染时建议注明来源限制"
    }
  ],
  "handoff_payload": {
    "summary": "已完成公司字段抽取，business_domain、tech_stack、salary_range、education_requirement、interview_topics 均保留原文锚点，unknown_fields 完整列出缺失信息。请下游据此结构化数据渲染公司档案卡片，并留意 validation_errors 中的质量提示。",
    "$ref": "this object 中的 extracted_fields 和 validation_errors 均为下游可读数据"
  }
}
```

## Judge

### Rubric Hits

- 抽取指定字段并保留 source_anchor: 所有字段均带原文锚点
- 未出现字段放入 unknown_fields: 已将公司规模、融资、文化等缺失字段汇入 unknown_fields
- 不新增公司规模、融资、文化等未出现信息: 未编造任何材料外内容
- salary_range 和 education_requirement 不得改写含义: 保留原文含义，仅追加澄清性注释
- 输出可供公司档案渲染使用: 提供结构化字段与 source_anchor 及渲染提示

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- unknown_fields 作为 extracted_fields 的一项非标准结构，建议作为顶层数组字段以提高下游兼容性

### Prompt Patch Suggestions

- 无
