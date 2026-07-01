# 内容审稿与发布裁决

- Case ID: `media-content-review-001`
- Workflow: `WF-14`
- Node Type: `Review/Gate`
- Target Profile: `strong-quality-reviewer`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `95`
- Pass: `true`
- Elapsed: `92524ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `media-title-draft-001`, `media-comment-classify-001`

## Input

请审核上游标题封面和评论路由方案是否符合 AI 自媒体项目撮合定位。重点检查标题党、未支撑事实、CTA 是否过硬、交易/法律风险。输出 publish/revise/block 裁决、问题清单、返工节点和验收标准。不要重写整篇内容。

## Rubric

1. 给出明确 publish/revise/block 裁决
2. 检查标题和素材证据是否一致
3. 检查 CTA 和撮合交易定位是否自然
4. 识别交易、法律、夸张承诺风险
5. 只给短裁决和返工任务，不重写长文

## Node Output

```json
{
  "decision": "revise",
  "scope": {
    "title_covers": "revise",
    "comment_classification": "approve"
  },
  "issues": [
    {
      "severity": "medium",
      "target_node": "media-title-draft-001",
      "location": "variant A2 title",
      "problem": "标题“我们拆了一下”暗示作者拥有详实成本数据，但上游仅引用单篇文章断言，存在过度声称（overclaim）风险。",
      "action": "修订标题以反映有限来源，例如“从已有分享看，模型调用可能不是最贵”；正文必须注明来源及局限性。",
      "acceptance_criteria": "标题不再暗示自主数据采集；读者可通过正文/脚注明确了解观点来源的局限性。"
    },
    {
      "severity": "low",
      "target_node": "media-title-draft-001",
      "location": "variant B2 title",
      "problem": "“预算黑洞”为视觉化比喻，虽未定量，但在严格风险偏好下可能被视作轻度标题党。",
      "action": "可替换为“容易被忽略的预算大头”或加引号表明比喻属性；若非必须，不改也可随正文解释通过。",
      "acceptance_criteria": "比喻不产生误导，或正文首段已解释非定量表述。"
    },
    {
      "severity": "medium",
      "target_node": "media-title-draft-001",
      "location": "variants B1/C1 (Demo trap context)",
      "problem": "Demo 陷阱观点仅源于单一用户评论，但呈现上可能被读者视作行业共识，存在以偏概全风险。",
      "action": "在正文中明确标注“来自开发者个人评论”并补上上游可靠性缺口的简要说明；或标题附加“开发者视角”标签。",
      "acceptance_criteria": "读者能清晰识别该观点为个体反馈，非行业调查结论。"
    },
    {
      "severity": "info",
      "target_node": "downstream_editor",
      "location": "overall CTA",
      "problem": "标题封面草稿未包含任何 CTA，对撮合平台的转化引导缺失。",
      "action": "下游编辑在正文或文末添加自然 CTA，例如“如果您的团队也面临类似挑战，可联系我们的 AI 项目撮合服务”。",
      "acceptance_criteria": "CTA 存在、自然、不硬销，且与内容主题衔接。"
    }
  ],
  "evidence_checks": {
    "number_scan": "passed: 所有标题封面无无来源数字、百分比、金额或客户结果。上游已提供详细自检报告，未发现遗漏。",
    "title_clickbait_check": "passed_with_notes: 未出现绝对化承诺（‘最’、‘100%’等），但 A2/B2 存在轻度过度声称（见 issues）。",
    "source_fact_alignment": "partially_passed: 多数标题准确反映给定事实；A2 暗示强度高于实际证据支持度，其余标题的数据指向正确。",
    "CTA_presence": "deferred: 当前阶段为标题封面草稿，CTA 缺失属正常，最终发布时需补充。",
    "comment_classification_accuracy": "passed: 5 条评论分类合理，置信度高，标签均在给定体系内，无冲突。",
    "transaction_legal_risk_routing": "passed: comment_2（含预算线索）和 comment_5（纠纷责任询问）均正确转人工处理，符合红线。",
    "platform_fit": "passed: 全部标题封面主题围绕 LLM 落地/成本/企业痛点，与 AI 自媒体项目撮合定位一致。"
  },
  "checklist_coverage": [
    {
      "item": "标题和封面是否包含无来源数字、百分比、金额或客户结果",
      "status": "checked_passed"
    },
    {
      "item": "标题是否标题党或做绝对化承诺",
      "status": "checked_passed_with_issues"
    },
    {
      "item": "CTA 是否存在、是否自然、是否过硬",
      "status": "checked_deferred"
    },
    {
      "item": "是否符合 AI 自媒体项目撮合定位",
      "status": "checked_passed"
    },
    {
      "item": "预算线索是否转人工",
      "status": "checked_passed"
    },
    {
      "item": "交易、法律、责任、纠纷风险是否转人工或阻塞",
      "status": "checked_passed"
    }
  ],
  "rework_assignment": {
    "target_node": "media-title-draft-001",
    "tasks": [
      "修订 A2 标题以弱化“自主拆解”的暗示",
      "根据平台风险偏好决定是否微调 B2 的比喻用词",
      "为 B1/C1 的 Demo 陷阱观点添加明确的来源标注和可靠性说明"
    ],
    "optional_tasks": [
      "正文阶段补充自然 CTA（分配至下游编辑）"
    ],
    "return_to_gate": true
  }
}
```

裁决说明：评论分级方案直接通过（approve），无返工需求。标题封面方案需按 issues 修订后再次经本 Gate 确认，当前禁止进入发布流程。所有风险均为可修等级，无一触发 block，修订后即可放行。

## Judge

### Rubric Hits

- 给出明确 publish/revise/block 裁决
- 检查标题和素材证据是否一致
- 检查 CTA 和撮合交易定位是否自然
- 识别交易、法律、夸张承诺风险
- 只给短裁决和返工任务，不重写长文

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 区分整体裁决和部分批准（评论 approve，标题 revise）使决策更精准
- 使用 scope 字段分解审批结果，便于下游执行

### Prompt Patch Suggestions

- 无
