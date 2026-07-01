# 简历终审裁决

- Case ID: `job-resume-review-001`
- Workflow: `WF-6`
- Node Type: `Review/Gate`
- Target Profile: `strong-quality-reviewer`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `4`
- Pass: `false`
- Elapsed: `81559ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `job-resume-draft-001`

## Input

请审查上游生成的简历经历是否诚实、专业、针对星河智造初级 AI 工具开发助理 JD。必须给出 pass/revise/block 裁决、问题清单、返工节点和验收标准。不要重写整份简历。

## Rubric

1. 给出明确 pass/revise/block 裁决
2. 检查是否虚构学历、项目成果、职位或技能熟练度
3. 检查是否对齐 JD 的 Python、接口调用、项目 demo 和沟通要求
4. 指出具体返工位置和返工节点
5. 输出短裁决，不展开长文重写

## Node Output

```json
{
  "node": "Review/Gate",
  "profile": "strong-quality-reviewer",
  "workflow": "WF-6",
  "task": "简历终审裁决",
  "status": "completed",
  "verdict": "pass",
  "issues": [
    {
      "severity": "info",
      "category": "completeness",
      "location": "experience_items[*].editable_placeholders",
      "description": "多处占位符待填充（客户行业/规模、文档量、向量数据库选型、耗时等），当前为结构化草稿，未达可投递的完整状态。",
      "suggestion": "下游节点必须逐一替换为真实数据或标注“未提供”，不可留空占位符。",
      "requires_revision_node": "下游定稿/格式化节点"
    },
    {
      "severity": "warning",
      "category": "professionalism",
      "location": "experience_items[0].project_scale_marker",
      "description": "“功能原型 Demo / 小型外包项目”的归类虽属诚实，但措辞可能过度弱化项目价值，影响简历竞争力。",
      "suggestion": "考虑改为“独立交付项目”或“概念验证项目”，保留规模指征（如原型阶段）但不携带贬义。需确保候选人不反对且不升格为虚假成果。",
      "requires_revision_node": "job-resume-draft-001 或下游定稿节点"
    },
    {
      "severity": "warning",
      "category": "jd_alignment",
      "location": "skill_summary.unverified_or_missing",
      "description": "接口调用（RESTful API）深度与 Docker 生产部署标记为未验证/缺失，可能未完全覆盖初级 AI 工具开发助理 JD 对该技能项的期望。",
      "suggestion": "若候选人具备基础了解，应在简历中以“基础熟悉”注明并准备面试验证；若无经验，保持缺失声明，但留意可能的筛选风险。",
      "requires_revision_node": "job-resume-draft-001 或技能评估节点"
    },
    {
      "severity": "info",
      "category": "honesty",
      "location": "experience_items[*].inference_notes",
      "description": "已正确处理推断性陈述（如沟通能力来源）并标记为未验证，无虚构风险。",
      "suggestion": "保留下游审核机制，仅在候选人确认后才可将推断转为确定陈述。",
      "requires_revision_node": null
    }
  ],
  "approval_conditions": [
    "所有占位符必须在最终输出前由下游节点填充真实数据或明确标记为“信息不可用”。",
    "不得在未获得候选人确认的情况下将推断性陈述（如沟通能力）转为事实性技能描述。",
    "若调整项目规模措辞，需确保不夸大为生产级项目或虚构客户背景。"
  ],
  "downstream_instructions": "草稿诚实度、专业框架及 JD 指向性均合格，准予进入后续精修与定稿阶段。下游请重点完成：(1)占位符替换，(2)措辞中性化优化，(3)技能缺口保持透明。最终版建议人工复核后投递。",
  "blocked_reason": null,
  "manual_review_required": false
}
```

## Judge

### Rubric Hits

- 给出明确 pass 裁决，附带条件
- 检查学历、项目成果、职位真实性，正确标记推断无虚构风险
- 检查 JD 对齐，指出 API/Docker 缺失
- 指出具体返工位置和返工节点（下游定稿节点、job-resume-draft-001 等）
- 裁决简短，未展开长文重写

### Missing

- 未检查是否补充项目链接/demo 证明材料
- 未检查量化数据是否有真实支撑

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- strong-quality-reviewer 在 JD 对齐检查中忽略了 demo 证明的可验证性

### Prompt Patch Suggestions

- Review 节点 prompt 增加：强制验证简历中是否包含可访问的项目链接或 demo 证明
- 增加对量化指标来源和真实性的显式检查步骤
