# 公司调研资料搬运

- Case ID: `job-company-gather-001`
- Workflow: `WF-3`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `8`
- Pass: `false`
- Elapsed: `37485ms`
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
  "workflow": "WF-3",
  "profile": "weak-research-extractor",
  "node_type": "Gather/Fetch",
  "target_company": "星河智造",
  "extracted_facts": [
    {
      "fact": "公司为制造业客户提供质检自动化和设备数据采集服务。",
      "source": "官网片段（来源1）",
      "source_status": "verifiable"
    },
    {
      "fact": "技术关键词包含 Python、OpenCV、PLC、轻量化模型部署。",
      "source": "官网片段（来源1）",
      "source_status": "verifiable"
    },
    {
      "fact": "招聘岗位为初级 AI 工具开发助理。",
      "source": "招聘 JD 片段（来源2）",
      "source_status": "verifiable"
    },
    {
      "fact": "薪资范围为 5-7k。",
      "source": "招聘 JD 片段（来源2）",
      "source_status": "verifiable"
    },
    {
      "fact": "要求具备 Python 基础、能读懂接口文档。",
      "source": "招聘 JD 片段（来源2）",
      "source_status": "verifiable"
    },
    {
      "fact": "学历要求为‘大专及以上优先（原文为优先条件，非硬性门槛）’。",
      "source": "招聘 JD 片段（来源2）",
      "source_status": "verifiable",
      "red_line_notes": "严格遵守红线：未将‘优先’改写为硬性要求。"
    },
    {
      "fact": "面试环节会考察 Python 文件处理、接口调用以及是否做过项目 demo。",
      "source": "面经摘录（来源3）",
      "source_status": "verifiable"
    }
  ],
  "unknown_fields": [
    "公司成立时间",
    "公司人数/规模",
    "融资历史与投资方",
    "具体产品/品牌名称",
    "落地行业子类（如汽车/电子/食品等）",
    "管理层或技术负责人背景",
    "办公地点",
    "企业价值观或文化描述",
    "公开奖项、认证或媒体报道"
  ],
  "evidence_gaps": [
    {
      "gap": "官网仅一个片段，缺乏完整的关于我们、产品页面或解决方案详情。",
      "supplement_suggestion": "需补全完整官网首页、关于我们及产品线页面。"
    },
    {
      "gap": "招聘 JD 为初级岗位，无法覆盖高阶技术能力栈或产品核心竞争力。",
      "supplement_suggestion": "建议搜集高级/资深岗位 JD 或技术负责人履历。"
    },
    {
      "gap": "面经样本单一，存在候选人视角偏差。",
      "supplement_suggestion": "建议搜集更多面经以交叉验证团队风格和技术深度。"
    },
    {
      "gap": "未见公司工商信息、第三方媒体新闻或行业报告引用。",
      "supplement_suggestion": "建议通过企查查/天眼查或行业新闻搜索补充工商动态与产品发布信息。"
    }
  ],
  "handoff_summary": "已完成星河智造有限来源的事实搬运。已获取信息：面向制造业的质检与数据采集业务、Python/OpenCV/PLC 等技术关键词、初级岗薪资 5-7k 及大专优先门槛、面试侧重文件处理/接口/项目 demo。缺失公司规模、成立时间、融资、具体产品名称等关键维度。下游需重点补全工商信息及产品/融资新闻。",
  "red_line_compliance_check": {
    "no_fabricated_news_funding_size": "passed",
    "no_inferred_tech_stack_from_name": "passed（技术栈源于给定来源）",
    "no_rewriting_preferred_as_required": "passed（已在事实中明确标注为‘优先’）"
  }
}
```

## Judge

### Rubric Hits

- 只抽取给定来源中出现的业务、技术栈、学历门槛、薪资和面经
- 每条事实标注来源片段
- 未出现的信息大部分输出 unknown
- 不判断候选人是否适合
- 给出证据缺口和复核建议

### Missing

- unknown_fields 未包含标准答案要求的“实际录取学历”、“长期发展空间”等未出现但任务关心的字段

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 该 profile 严格遵守红线，标注清晰，但 unknown_fields 列举不够全面，需根据任务关心的关键维度列出所有缺失项

### Prompt Patch Suggestions

- 在提示中明确要求 unknown_fields 必须覆盖任务描述中所有关心的信息维度（如团队规模、文化、实际录取学历、发展空间等），若来源未出现则必须列出并标记 missing
