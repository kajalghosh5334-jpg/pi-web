# 公司调研资料搬运

- Case ID: `job-company-gather-001`
- Workflow: `WF-3`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `90`
- Pass: `true`
- Elapsed: `29217ms`
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
  "node": "Gather/Fetch",
  "profile": "weak-research-extractor",
  "task": "公司调研资料搬运",
  "target_company": "星河智造",
  "extracted_facts": [
    {
      "category": "业务",
      "fact": "为制造业客户做质检自动化和设备数据采集",
      "source": "官网片段"
    },
    {
      "category": "技术栈",
      "fact": "技术关键词包含 Python、OpenCV、PLC、轻量化模型部署",
      "source": "官网片段"
    },
    {
      "category": "技术栈",
      "fact": "招聘 JD 要求 Python 基础、能读懂接口文档",
      "source": "招聘 JD 片段"
    },
    {
      "category": "技术栈",
      "fact": "面试考察 Python 文件处理、接口调用、是否做过项目 demo",
      "source": "面经摘录"
    },
    {
      "category": "学历门槛",
      "fact": "大专及以上优先（优先条件，非硬性要求）",
      "source": "招聘 JD 片段"
    },
    {
      "category": "薪资",
      "fact": "月薪 5-7k",
      "source": "招聘 JD 片段"
    },
    {
      "category": "面经",
      "fact": "面试会问 Python 文件处理、接口调用、是否做过项目 demo",
      "source": "面经摘录"
    }
  ],
  "inferences": [
    {
      "inference": "轻量化模型部署与 PLC 结合 OpenCV 指向工业边缘端侧视觉质检场景",
      "basis": "官网技术关键词组合",
      "confidence": "medium"
    },
    {
      "inference": "薪资 5-7k 与「大专及以上优先」共同暗示该岗位为初级/实习助理级别",
      "basis": "招聘 JD 内容",
      "confidence": "high"
    },
    {
      "inference": "面试题目侧重基础 Python 和接口理解，未涉及 OpenCV 或 PLC，与官网技术栈存在脱节",
      "basis": "面经摘录 vs 官网片段",
      "confidence": "medium"
    }
  ],
  "suggestions": [
    "建议补充轻量化部署的具体框架（如 TensorFlow Lite、ONNX Runtime），当前材料未提及",
    "建议寻找更多面经确认面试中是否包含视觉或 PLC 题目",
    "建议核实薪资对应城市级别，以辅助下游评估"
  ],
  "risks": [
    "薪资低于主流 AI 岗位，可能表示工作内容简单或公司规模较小",
    "「优先」条件不排除非大专候选人，下游不宜作为硬性筛选项",
    "官网技术栈与面试考察不完全匹配，候选人实际工作内容可能与面试预期不符"
  ],
  "evidence_gaps": [
    "公司全称、成立时间、员工规模未提及",
    "具体产品/解决方案名称未提及",
    "轻量化部署使用的具体框架/工具未提及",
    "面试是否涉及 OpenCV 或 PLC 未提及",
    "岗位是自有产品开发、外包还是驻场未说明",
    "办公地点和公司性质（甲/乙方）未说明"
  ],
  "review_suggestions": [
    "建议在下一节点交叉参考工商信息、官网更多页面及更多面经",
    "建议核实薪资学历是否准确代表岗位实际定位",
    "建议将「大专及以上优先」下游使用前明确标记为软性条件"
  ],
  "red_flags": [],
  "blocked": false,
  "manual_review_required": false
}
```

## Judge

### Rubric Hits

- 只抽取给定来源中出现的业务、技术栈、学历门槛、薪资和面经
- 每条事实标注来源片段
- 未出现的信息输出通过 evidence_gaps 列出，满足 unknown/missing 要求
- 不判断候选人是否适合
- 给出证据缺口和复核建议

### Missing

- 未在 extracted_facts 中为缺失类别（如团队规模、文化）显式标注 unknown，但 evidence_gaps 已覆盖

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- evidence_gaps 机制可替代事实级 unknown 标记，但需注意下游客服用场景是否期望结构化 missing 字段
- inferences 与 facts 分离良好，减少混淆

### Prompt Patch Suggestions

- 无
