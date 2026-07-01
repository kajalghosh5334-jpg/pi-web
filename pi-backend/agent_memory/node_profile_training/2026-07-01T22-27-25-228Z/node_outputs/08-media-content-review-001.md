# 内容审稿与发布裁决

- Case ID: `media-content-review-001`
- Workflow: `WF-14`
- Node Type: `Review/Gate`
- Target Profile: `strong-quality-reviewer`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `100`
- Pass: `true`
- Elapsed: `78703ms`
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
6. decision 必须与最高 severity 一致：存在 high/critical 问题时不得 publish

## Node Output

```json
{
  "decision": "revise",
  "issues": [
    {
      "severity": "medium",
      "target_node": "media-title-draft-001",
      "location": "全部5组方案，标题/封面文案区块",
      "problem": "CTA（行动号召）完全缺失。标题和封面作为发布内容的第一触点，缺少任何形式的互动引导（评论/私信/点击），不符合 AI 自媒体内容运营基本规范，可能削弱转化与撮合效率。",
      "action": "在每个方案或最终选用方案中，补充一条匹配内容风格的自然CTA，例如：‘评论区聊聊你们公司的知识库现状’或‘遇到类似坑？私信我们帮你对接合适开发者’",
      "acceptance_criteria": "发布版文案至少包含一处自然、不硬的CTA，且与内容主题相关，避免推销感过强"
    },
    {
      "severity": "low",
      "target_node": "media-title-draft-001",
      "location": "方案一 · 标题A‘一个制造企业的真实经历’；方案三 · 封面文案A‘真实挑战’等",
      "problem": "使用‘真实经历’‘真实挑战’等措辞，虽草案自我标注为‘指向上游素材’或‘语气’，但读者端易误解为客观普遍事实，存在轻度夸张感知风险。",
      "action": "将‘真实经历’替换为‘分享的经历/实例’；将‘真实挑战’替换为‘实际挑战’或直接使用‘落地后的常见挑战’。",
      "acceptance_criteria": "所有类似表述修改后不产生‘绝对事实’暗示，标注的临时让步说明可移除。"
    },
    {
      "severity": "low",
      "target_node": "media-title-draft-001",
      "location": "方案三 · 封面文案A ‘这不是个案’",
      "problem": "‘这不是个案’虽标注为语气表达，但独立出现在封面时，读者极大概率理解为客观结论，产生无依据的普遍化断言风险。",
      "action": "删除该句，或改为行业常见语气如‘这类反馈不少见’（仍含风险，推荐删除）。",
      "acceptance_criteria": "该句不再出现于任何发布文案，或修改后明确带主观缓冲词且不影响理解。"
    }
  ],
  "evidence_checks": {
    "numerical_claims": "pass — 无任何数字/百分比/金额/客户结果",
    "source_alignment": "pass — 草案中所有素材锚点均在自检表中指向‘访谈摘录’‘文章摘录’‘评论摘录’，未额外补造",
    "unsupported_generalization": "low_risk — ‘真实经历’‘真实挑战’‘这不是个案’已标注但仍有误解空间，建议按 issues 调整",
    "cta_check": "fail — 内容无任何CTA，需补充"
  },
  "checklist_coverage": {
    "checked": [
      "标题/封面是否包含无来源数字——否，已通过",
      "标题是否标题党/绝对化承诺——否，无明显震惊体或保证性承诺",
      "是否符合AI自媒体项目撮合定位——是，内容精准吸引LLM落地相关决策者",
      "预算线索是否转人工——是，评论2已正确标为manual_review",
      "交易/法律/责任/纠纷风险是否转人工或阻塞——是，评论5已正确转人工"
    ],
    "partially_checked": [
      "CTA是否存在/自然/过硬——当前缺失，需补充后重检"
    ],
    "unchecked": [
      "最终配图、视频内容与标题封面的一致性（超出本节点输入范围）"
    ]
  },
  "rework_assignment": {
    "node": "media-title-draft-001",
    "due_changes": [
      "补充CTA",
      "调整‘真实经历/真实挑战’措辞",
      "删除或修改‘这不是个案’句"
    ],
    "return_output": "修订后的标题/封面方案（保持原有结构），完成上述修改后重新提交本 gate 审查",
    "note": "评论分类结果 media-comment-classify-001 无需返工，可直接流转使用"
  },
  "comment_classification_review": {
    "decision": "approve",
    "reason": "5条评论分类准确，风险标志完整，交易线索（评论2）与法律投诉（评论5）均已正确标记 manual_review，无漏标或误标，可以直接使用。"
  }
}
```

## Judge

### Rubric Hits

- 给出明确 revise 裁决
- 检查标题和素材证据一致，确认无来源数字
- 检查 CTA 并标记为缺失，给出明确修复要求
- 识别轻微夸张措辞风险
- 未重写长内容，仅给出短裁决与返工任务
- decision 与最高 severity 一致，无 high/critical 问题时不阻塞
- 评论路由决策审查通过，交易/法律风险均已正确转人工
- 未违反任何红线

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 输出完美遵循 gate 节点契约，结构完整，裁决清晰，可作为高质量样例

### Prompt Patch Suggestions

- 无
