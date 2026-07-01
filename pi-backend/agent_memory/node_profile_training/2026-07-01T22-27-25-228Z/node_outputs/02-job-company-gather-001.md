# 公司调研资料搬运

- Case ID: `job-company-gather-001`
- Workflow: `WF-3`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `39363ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: none

## Input

目标公司：星河智造。给定来源材料：1）官网片段：公司为制造业客户做质检自动化和设备数据采集，技术关键词包含 Python、OpenCV、PLC、轻量化模型部署。2）招聘 JD 片段：初级 AI 工具开发助理，薪资 5-7k，要求 Python 基础、能读懂接口文档，学历写的是大专及以上优先。3）面经摘录：面试会问 Python 文件处理、接口调用、是否做过项目 demo。请只基于这些材料搬运事实。

## Rubric

1. 只抽取给定来源中出现的业务、技术栈、学历门槛、薪资和面经
2. 每条事实标注来源片段
3. 未出现的信息输出 unknown 或 missing
4. 不判断候选人是否适合
5. 给出证据缺口和复核建议

## Node Output

```json
{
  "extracted_facts": [
    {
      "fact": "星河智造为制造业客户提供质检自动化和设备数据采集服务",
      "source": "官网片段",
      "source_status": "explicit"
    },
    {
      "fact": "公司涉及技术包括 Python、OpenCV、PLC、轻量化模型部署",
      "source": "官网片段",
      "source_status": "explicit"
    },
    {
      "fact": "公司招聘初级AI工具开发助理，薪资5-7k",
      "source": "招聘JD片段",
      "source_status": "explicit"
    },
    {
      "fact": "该职位要求具备Python基础，能读懂接口文档",
      "source": "招聘JD片段",
      "source_status": "explicit"
    },
    {
      "fact": "学历要求为大专及以上，注明为优先条件",
      "source": "招聘JD片段",
      "source_status": "explicit_with_qualifier (优先条件)"
    },
    {
      "fact": "面试会问Python文件处理、接口调用、是否做过项目demo",
      "source": "面经摘录",
      "source_status": "explicit"
    }
  ],
  "unknown_fields": {
    "company_full_name_official": "missing",
    "company_establishment_year": "missing",
    "company_financing_status": "missing",
    "company_employee_count": "missing",
    "company_core_products_or_services": "部分已知（质检自动化和设备数据采集），无具体产品名或功能描述",
    "company_tech_stack_detail": "仅知部分技术标签，完整架构/平台/工具链未提及",
    "company_culture": "missing",
    "team_background": "missing",
    "salary_range_for_other_positions": "missing",
    "interview_format": "仅知几类问题，完整流程和覆盖面未提及",
    "education_requirement_is_hard": "unverified（原文为优先条件，是否硬性未明确）"
  },
  "evidence_gaps": [
    {
      "gap": "官网片段仅给出业务方向和技术标签，缺少公司背景、成立时间、核心产品名称或客户案例。",
      "suggestion": "查阅完整官网或公开工商信息补充"
    },
    {
      "gap": "仅一个初级助理岗位的JD，不足以反映公司整体团队构成、层级分布或核心成员背景。",
      "suggestion": "收集更多岗位JD或团队介绍页面"
    },
    {
      "gap": "面经仅一个简短摘录，缺乏面试流程、时长、轮次、占比等信息。",
      "suggestion": "从多个渠道收集更完整的面经"
    },
    {
      "gap": "学历条件标注为优先，未说明是否为硬性筛选标准。",
      "suggestion": "通过招聘方或更多JD确认"
    }
  ],
  "handoff_summary": "基于三段给定来源，已提取6条显性事实：星河智造主营质检自动化和设备数据采集，技术关键词含Python、OpenCV、PLC、轻量化模型部署；招聘初级AI工具开发助理，薪资5-7k，要求Python基础和接口文档阅读能力，学历大专及以上优先；面试涉及Python文件处理、接口调用和项目经验。缺失公司基本背景、融资、团队、完整技术栈、其他岗位薪资等关键信息，需下游补充调研。"
}
```

## Judge

### Rubric Hits

- 只抽取给定来源中出现的业务、技术栈、学历门槛、薪资和面经
- 每条事实标注来源片段
- 未出现的信息输出 unknown 或 missing
- 不判断候选人是否适合
- 给出证据缺口和复核建议
- 优先条件保持优先，未改写为硬性条件

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 模型在纯信息搬运任务中准确区分已知和未知，符合Gather/Fetch契约要求

### Prompt Patch Suggestions

- 无
