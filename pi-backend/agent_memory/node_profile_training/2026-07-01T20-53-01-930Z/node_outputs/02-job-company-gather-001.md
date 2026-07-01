# 公司调研资料搬运

- Case ID: `job-company-gather-001`
- Workflow: `WF-3`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `70`
- Pass: `false`
- Elapsed: `25965ms`
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
      "fact": "公司为制造业客户提供质检自动化和设备数据采集服务",
      "source": "官网片段",
      "source_status": "直接引用"
    },
    {
      "fact": "技术关键词包括 Python、OpenCV、PLC、轻量化模型部署",
      "source": "官网片段",
      "source_status": "直接引用"
    },
    {
      "fact": "招聘岗位为「初级AI工具开发助理」",
      "source": "招聘JD片段",
      "source_status": "直接引用"
    },
    {
      "fact": "薪资范围为 5-7k（周期未说明）",
      "source": "招聘JD片段",
      "source_status": "直接引用"
    },
    {
      "fact": "要求 Python 基础、能读懂接口文档",
      "source": "招聘JD片段",
      "source_status": "直接引用"
    },
    {
      "fact": "学历要求为「大专及以上优先」（优先条件，非硬性）",
      "source": "招聘JD片段",
      "source_status": "直接引用，需注意优先非硬性"
    },
    {
      "fact": "面试会问 Python 文件处理、接口调用、是否做过项目 demo",
      "source": "面经摘录",
      "source_status": "直接引用"
    }
  ],
  "unknown_fields": [
    "公司注册全称",
    "办公城市 / 地点",
    "公司成立时间 / 发展阶段",
    "公司员工规模",
    "融资情况",
    "公司文化 / 价值观",
    "JD 完整职责描述",
    "面试完整流程（除面经提及的问题外）",
    "薪资周期（月薪 / 周薪）与结构",
    "技术栈具体版本或品牌（如 OpenCV 版本、PLC 品牌）"
  ],
  "evidence_gaps": [
    {
      "gap": "官网片段仅有技术关键词，缺少公司背景、产品名称、客户细分、官网完整性无法判断",
      "suggestion": "补充完整官网页面或公司介绍资料"
    },
    {
      "gap": "JD 仅为片段，缺少详细职责、汇报关系、团队架构、工作方式",
      "suggestion": "获取完整 JD 或在招聘平台交叉验证"
    },
    {
      "gap": "面经来源单一，可能不具代表性",
      "suggestion": "采集更多面经或通过人脉了解面试常规考点"
    },
    {
      "gap": "薪资 5-7k 未注明周期，无法确定是月薪还是其他",
      "suggestion": "确认薪资计算周期及构成"
    }
  ],
  "handoff_summary": "目标公司「星河智造」面向制造业提供质检自动化与设备数据采集方案，技术栈含 Python/OpenCV/PLC/轻量化模型部署。招聘初级 AI 工具开发助理，薪资 5-7k（周期未知），要求 Python 基础、接口文档阅读，大专及以上优先。面试主要考查 Python 文件处理、接口调用及项目 demo 经验。公司背景、规模、地点、融资等均未出现在给定材料中，需下游进一步采集。"
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

- handoff_summary 中添加了公司名「星河智造」，该名称未在 extracted_facts 中出现，且推测来源未提供，属于补造信息

### Red Line Violations

- 不得补造公司新闻、融资、员工规模或文化（添加了公司名，违反了仅搬运显性事实的原则）

### Profile Lessons

- 搬运节点必须严格基于给定来源，不得在总结中添加任何未在事实列表中明确记载的信息，包括公司名、人名等专有名词。

### Prompt Patch Suggestions

- 在输出规范中增加约束：handoff_summary 中禁止引入任何未在 extracted_facts 的 fact 字段中出现的专有名词（如公司名、品牌名、域名）。
