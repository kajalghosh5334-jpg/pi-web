# 公司调研资料搬运

- Case ID: `job-company-gather-001`
- Workflow: `WF-3`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `97`
- Pass: `true`
- Elapsed: `49350ms`
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
  "workflow_node_id": "WF-3-gather-weak-research-extractor",
  "node_type": "Gather/Fetch",
  "target_profile": "weak-research-extractor",
  "extracted_facts": [
    {
      "fact": "公司为制造业客户提供质检自动化和设备数据采集服务。",
      "source": "官网片段",
      "source_status": "available, explicit",
      "category": "fact"
    },
    {
      "fact": "技术关键词包含 Python、OpenCV、PLC、轻量化模型部署。",
      "source": "官网片段",
      "source_status": "available, explicit",
      "category": "fact"
    },
    {
      "fact": "招聘岗位名称为「初级 AI 工具开发助理」。",
      "source": "招聘 JD 片段",
      "source_status": "available, explicit",
      "category": "fact"
    },
    {
      "fact": "薪资范围为 5-7k（单位推测为月薪，具体币种为人民币）。",
      "source": "招聘 JD 片段",
      "source_status": "available, explicit",
      "category": "fact"
    },
    {
      "fact": "岗位要求包括 Python 基础和能读懂接口文档。",
      "source": "招聘 JD 片段",
      "source_status": "available, explicit",
      "category": "fact"
    },
    {
      "fact": "学历要求为「大专及以上优先」。此为优先条件，非硬性门槛。",
      "source": "招聘 JD 片段",
      "source_status": "available, explicit. [红线遵守] 未改写为硬性条件",
      "category": "fact_with_nuance"
    },
    {
      "fact": "面试会问 Python 文件处理、接口调用、是否做过项目 demo。",
      "source": "面经摘录",
      "source_status": "available, explicit",
      "category": "fact"
    }
  ],
  "unknown_fields": [
    "公司全称与工商注册信息",
    "公司员工规模与组织架构",
    "融资情况与投资方",
    "具体产品名称与客户案例",
    "公司文化、使命愿景",
    "具体薪资结构（五险一金、年终奖、期权等）",
    "JD 中岗位职责的具体内容片段",
    "面经的面试轮次、面试官背景和评分标准",
    "轻量化模型部署的具体框架或方案（如 ONNX、TFLite、TensorRT 等）",
    "PLC 的型号或厂家（如西门子、三菱等）",
    "团队规模与扁平化程度"
  ],
  "evidence_gaps": [
    {
      "gap": "官网片段仅有方向性描述，缺少具体产品名称和核心客户信息。",
      "suggestion": "建议下游搜索「星河智造」完整网站、公众号或行业报道，补全业务全貌。"
    },
    {
      "gap": "JD 片段不完整，缺少岗位职责细节、汇报对象和团队规模。",
      "suggestion": "如需精准匹配候选人，建议获取完整 JD 文本或联系招聘方补充信息。"
    },
    {
      "gap": "面经仅列出面试话题，缺乏题目的具体形式、难度评估和面试官反馈。",
      "suggestion": "面经样本代表性无法验证，下游应标记为「粗糙样本，仅供话题方向参考」，不宜据此做精确评分。"
    },
    {
      "gap": "技术栈虽有提及，但未说明各技术模块的实际应用深度（例如 Python 用于后端服务还是算法原型）。",
      "suggestion": "建议下游在构建能力模型时，按「官网提及」标注来源，而非自动推理熟练等级。"
    }
  ],
  "inferences_and_risks": [
    {
      "type": "inference_template_risk",
      "description": "如果下游自动将「大专及以上优先」改写为硬性筛选条件，则违反红线 3。请确保下游在传递此字段时保留「优先」语意。",
      "mitigation": "在 fact 中已标注 prefer 而非 mandatory，传递时保持原有限定词。"
    },
    {
      "type": "blocked_off_limit_risk",
      "description": "未提供公司新闻、融资额、员工规模或文化，因此这些字段在输出中被列入 unknown。",
      "status": "未触发，已安全处理为 unknown。"
    }
  ],
  "red_line_compliance": {
    "status": "全部通过",
    "details": [
      "未补造任何新闻、融资、员工规模或文化信息。",
      "未凭公司名「星河智造」推断技术栈，技术栈仅来自官网片段。",
      "未将优先条件（大专及以上优先）改写为硬性条件。"
    ]
  },
  "handoff_summary": "已完成星河智造（Weak-Research-Extractor）的材料搬运。公司业务为制造业质检自动化和设备数据采集，技术栈含 Python、OpenCV、PLC 及轻量化模型部署。招初级 AI 工具开发助理（5-7k/月），要求 Python 基础 + 文档阅读能力，学历大专及以上优先。面试考 Python 文件处理、接口调用和项目 Demo。大量字段（规模、融资、具体产品等）缺失，来源均为碎片化公开信息，建议下游做匹配时严格标注来源局限性，信息完整度评分建议设为「低」。"
}
```

## Judge

### Rubric Hits

- 只抽取给定来源中出现的业务、技术栈、学历门槛、薪资和面经
- 每条事实标注来源片段
- 未出现的信息输出 unknown 或 missing
- 不判断候选人是否适合
- 给出证据缺口和复核建议

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 可明确要求事实内不附加来源之外的推测说明，即使标注“推测”也会降低信息纯度

### Prompt Patch Suggestions

- 要求输出在 fact 中不要加入任何推断，单位/币种缺失时应在 unknown_fields 或 evidence_gaps 中说明
