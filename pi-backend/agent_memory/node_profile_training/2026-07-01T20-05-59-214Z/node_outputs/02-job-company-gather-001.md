# 公司调研资料搬运

- Case ID: `job-company-gather-001`
- Workflow: `WF-3`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `95`
- Pass: `true`
- Elapsed: `37880ms`
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
  "profile_node": "weak-research-extractor",
  "workflow": "WF-3",
  "node_phase": "Gather/Fetch",
  "target_company": "星河智造",
  "task": "公司调研资料搬运",
  "extracted_facts": [
    {
      "category": "业务方向",
      "fact": "公司为制造业客户提供质检自动化和设备数据采集服务。",
      "source": "官网片段 (Source 1)",
      "source_status": "公司自述",
      "risk_warning": "官网片段来源简短，未提供具体产品功能边界。"
    },
    {
      "category": "技术栈（官网展示）",
      "fact": "官网展示的技术关键词为 Python、OpenCV、PLC、轻量化模型部署。",
      "source": "官网片段 (Source 1)",
      "source_status": "公司自述",
      "risk_warning": "此为官网对外宣传标签，不代表实际生产环境全貌。"
    },
    {
      "category": "招聘岗位",
      "fact": "招聘岗位为「初级 AI 工具开发助理」。",
      "source": "招聘 JD 片段 (Source 2)",
      "source_status": "招聘方发布"
    },
    {
      "category": "薪资范围",
      "fact": "薪资为 5-7k。",
      "source": "招聘 JD 片段 (Source 2)",
      "source_status": "招聘方发布"
    },
    {
      "category": "学历门槛",
      "fact": "学历写的是「大专及以上优先」。",
      "source": "招聘 JD 片段 (Source 2)",
      "source_status": "招聘方发布",
      "red_line_check": "TRUE — 此条为优先条件，非硬性门槛。下游不得改写成「要求大专以上」。"
    },
    {
      "category": "硬性技能要求",
      "fact": "要求的技能为 Python 基础、能读懂接口文档。",
      "source": "招聘 JD 片段 (Source 2)",
      "source_status": "招聘方发布"
    },
    {
      "category": "面试考察点",
      "fact": "面试会问到 Python 文件处理、接口调用、是否做过项目 demo。",
      "source": "面经摘录 (Source 3)",
      "source_status": "面试者经验分享",
      "risk_warning": "样本量为 1 且经第三方转述，不保证覆盖全部面试流程。"
    }
  ],
  "unknown_fields": [
    {"field": "公司工商全名 / 注册信息", "status": "missing"},
    {"field": "员工规模 / 经营规模", "status": "missing"},
    {"field": "融资历史", "status": "missing"},
    {"field": "公司新闻或近况", "status": "missing"},
    {"field": "公司文化 / 价值观", "status": "missing"},
    {"field": "核心团队背景", "status": "missing"},
    {"field": "具体产品线 / 成功客户案例", "status": "missing"},
    {"field": "办公地点", "status": "missing"}
  ],
  "evidence_gaps": [
    {
      "gap": "官网仅提供一句话片段与技术关键词列表，缺乏产品页、团队页等关键信息。",
      "suggestion": "如需深度调研，建议补抓完整官网及其子页面。"
    },
    {
      "gap": "JD 仅此一封初级岗位，无法反向推断公司整体技术层级或高级岗位要求。",
      "suggestion": "建议搜索该公司其他高级或非技术岗位 JD 以获得完整人才画像。"
    },
    {
      "gap": "面经来源单一，未提供结构化题库或面试轮次信息，存在幸存者偏差。",
      "suggestion": "建议交叉比对其他招聘网站或面经平台以确认一致性。"
    }
  ],
  "handoff_summary": "已完成给定三份原材料的显性事实搬运。星河智造：制造业质检自动化+设备数据采集，技术标签含 Python/OpenCV/PLC。招聘初级 AI 工具助理 5-7k，学历「大专优先」不是硬门槛，面试核心覆盖 Python 文件操作、API 调用和项目 demo。缺失信息（融资、规模、文化、办公地、完整产品矩阵）均标记为 missing。学历红线已在事实中显式标注，下游判断时不应提升为硬性要求。如需更多维度，建议补源。"
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

- unknown_fields 未明确覆盖「实际录取学历」和「长期发展空间」等标准答案提及的未出现信息，虽已涵盖大部分关键缺失项

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 对学历红线的显式标注与风险提示是优秀实践，可防止下游误读
- 整体事实搬运质量高，未掺杂判断或幻觉

### Prompt Patch Suggestions

- 可要求 unknown_fields 对齐任务定义中的所有关键关注维度（如录取学历、发展空间），避免遗漏标准答案期望的缺失字段
