# 内容审稿与发布裁决

- Case ID: `media-content-review-001`
- Workflow: `WF-14`
- Node Type: `Review/Gate`
- Target Profile: `strong-quality-reviewer`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `80`
- Pass: `false`
- Elapsed: `56950ms`
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
  "summary": "标题草案 ab-test-002 存在无依据的具体数字（70%），阻塞发布；其余草案可接受，评论路由方案通过。整体裁决为 revise，需返工 ab-test-002 后重新提交审查。",
  "title_review": {
    "decision_detail": "5 份 AB 草案中，ab-test-002 因含无数据支撑的占位数字被阻塞，其他草案虽存在少量推测性修辞，但在观点表达允许范围内，不构成阻塞。",
    "publishable_sections": ["ab-test-001", "ab-test-003", "ab-test-004", "ab-test-005"],
    "blocked_sections": ["ab-test-002"]
  },
  "comment_routing_review": {
    "decision_detail": "approve",
    "notes": "路由方案符合平台红线：交易需求（id2）和投诉/法律风险（id5）转人工；广告（id4）建议删除；黑粉（id3）忽略；好评（id1）自动回复。标签冲突解决合理，无路由遗漏。"
  },
  "issues": [
    {
      "severity": "high",
      "target_node": "media-title-draft-001",
      "location": "ab-test-002 (标题 & 封面文案)",
      "problem": "标题与封面中使用了具体数字 '70%'，但上游素材 (extracted_facts) 中无任何量化数据支撑，草案自身也标记为 placeholder。若发布，构成虚假数据引用风险，违反事实核查红线。",
      "action": "替换为定性表述（如“大量”“多数”“绝大部分”），或由调研节点补充真实比例后填入数字。禁止直接以占位符形式发布。",
      "acceptance_criteria": "标题及封面中不再包含任何无来源的具体数值（百分比、金额等）；若保留数字，需附可追溯数据来源及核查记录。"
    },
    {
      "severity": "medium",
      "target_node": "media-title-draft-001",
      "location": "ab-test-003 (封面文案)",
      "problem": "封面文案‘每笔订单的最终结局’为全称推断（‘每笔’），虽属修辞，但在撮合业务语境下可能被解读为平台对交易结果的负面预期，存在轻微纠纷风险。",
      "action": "调整为更中性的表述，如‘不少项目的背后’或‘一个常见结局’，避免全称断言。如保留原句，需标注为个人观点而非平台立场。",
      "acceptance_criteria": "表述不暗示所有交易必然走向负面结局；或已添加免责声明。"
    },
    {
      "severity": "low",
      "target_node": "media-title-draft-001",
      "location": "ab-test-004, ab-test-005 (封面文案)",
      "problem": "使用了‘黑洞’‘洗不干净的数据会让一切归零’等比喻/推断，缺乏直接数据支撑。风险较低，可作为修辞接受，但建议留意可能引发的读者预期。",
      "action": "维持当前文案，无需阻塞；后续如 A/B 测试数据反馈用户困惑，可微调。",
      "acceptance_criteria": "不作为阻塞条件，仅记录以供数据观察。"
    }
  ],
  "evidence_checks": [
    {
      "claim": "制造企业知识库卡在资料混乱、缺乏维护",
      "source": "上游 extracted_facts[0]",
      "status": "verified",
      "used_in": ["ab-test-001", "ab-test-005"]
    },
    {
      "claim": "常见成本来自数据清洗、权限设计、评测和运维",
      "source": "上游 extracted_facts[1]",
      "status": "verified",
      "used_in": ["ab-test-001", "ab-test-002", "ab-test-004", "ab-test-005"]
    },
    {
      "claim": "客户只要 Demo 不愿为维护付费",
      "source": "上游 extracted_facts[2]",
      "status": "verified",
      "used_in": ["ab-test-002", "ab-test-003"]
    },
    {
      "claim": "70% 时间用于数据清洗",
      "source": "unsupported — 无上游事实支撑",
      "status": "unverified",
      "used_in": ["ab-test-002"],
      "action": "阻賽发布，或补充证据"
    }
  ],
  "rework_assignment": {
    "node": "media-title-draft-001",
    "scope": "仅修改 ab-test-002 中的无依据数字，并调整 ab-test-003 的绝对化表述。其余章节无需改动。",
    "deliverable": "输出修正后的 ab-test-002 及 ab-test-003（如适用），重新提交至本审查节点。",
    "skip_rework_for": "ab-test-001, ab-test-004, ab-test-005 可直接进入发布队列。"
  }
}
```

## Judge

### Rubric Hits

- 给出明确 publish/revise/block 裁决
- 检查标题和素材证据是否一致
- 识别交易、法律、夸张承诺风险
- 只给短裁决和返工任务，不重写长文

### Missing

- 检查 CTA 和撮合交易定位是否自然：输出仅检查了评论区路由和风险，未对正文中是否存在 CTA、CTA 是否自然、是否夸大承诺进行审查

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- Review/Gate 节点输出应覆盖所有 rubric 维度；缺失 CTA 审查可能导致未发现的误导性内容

### Prompt Patch Suggestions

- 增加 CTA/撮合相关检查项，要求节点明确审查正文中的行动号召是否过度承诺或与交易风险不一致
