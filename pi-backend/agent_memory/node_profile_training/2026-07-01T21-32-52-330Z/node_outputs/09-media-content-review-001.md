# 内容审稿与发布裁决

- Case ID: `media-content-review-001`
- Workflow: `WF-14`
- Node Type: `Review/Gate`
- Target Profile: `strong-quality-reviewer`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `95`
- Pass: `true`
- Elapsed: `121486ms`
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
  "node_id": "strong-quality-reviewer",
  "workflow": "WF-14",
  "task": "内容审稿与发布裁决",
  "decision": "revise",
  "issues": [
    {
      "severity": "high",
      "target_node": "content-draft-producer",
      "location": "variant B-05, cover_copy",
      "problem": "Cover states '大概率会在你或你客户的公司重演', extrapolating from a single anonymous interview (fact_1) with no statistical backing. This is an unsupported predictive claim—clickbait/overgeneralization that violates the content truthfulness red line.",
      "action": "Revise cover copy to stay within the single-case scope. Replace prediction with a reflexive question or bounded observation (e.g., 'this story may feel familiar' with explicit sourcing caveat).",
      "acceptance_criteria": "Revised copy contains no prediction of likelihood ('大概率', 'most', 'will happen'). Any inference must use hedges ('may', 'perhaps') and note it is one data point, not a trend."
    },
    {
      "severity": "medium",
      "target_node": "content-draft-producer",
      "location": "variant B-01, cover_copy",
      "problem": "Cover uses '真实全貌' (full picture), implying comprehensive coverage, but source is a single interview. Overstates the source scope and risks misleading readers.",
      "action": "Replace '真实全貌' with a narrower term such as '真实反馈' or '一线声音' that matches the single-source nature.",
      "acceptance_criteria": "Wording does not imply completeness or representativeness. Consistent with a single-interview source."
    },
    {
      "severity": "info",
      "target_node": "manual_review_handler (downstream)",
      "location": "comment_5, workflow WF-16",
      "problem": "User questions liability and dispute responsibility—legal sensitivity. Routed correctly to manual_review. No action on classification-router is needed, but downstream manual operator must respond within SLA (recommended 24 h) to prevent reputation escalation.",
      "action": "Assign to human operator with legal review. Do not auto-close or ignore.",
      "acceptance_criteria": "comment_5 status marked as 'responded' with legal-reviewed reply; response logged in system within agreed SLA."
    }
  ],
  "evidence_checks": {
    "unsupported_numbers": {
      "status": "PASS",
      "detail": "No specific dollar amounts, percentages, customer counts, or ROI claims found in any headline/cover. Upstream self-check confirmed and re-verified."
    },
    "headline_clickbait_and_absolute_claims": {
      "status": "FAIL",
      "detail": "B-05 cover asserts a high-probability prediction without data—treated as clickbait/overpromise. B-01 '全貌' overstates source scope.",
      "affected_variants": ["B-05", "B-01"]
    },
    "cta_appropriateness": {
      "status": "PASS",
      "detail": "No hard CTA (buy now, sign up, limited time). B-03 '先看这篇' is a soft content teaser, natural for editorial media."
    },
    "fit_for_platform_positioning": {
      "status": "PASS",
      "detail": "All variants attract target audiences (engineers, decision-makers) via pain-point resonance, which supports the AI talent/project matchmaking funnel at the awareness stage. Matchmaking intent is latent—acceptable for headline/cover level."
    },
    "comment_routing_budget_lead": {
      "status": "PASS",
      "detail": "comment_2 (budget 2万) correctly routed to manual_review. Risk flag documented."
    },
    "comment_routing_liability_legal": {
      "status": "PASS",
      "detail": "comment_5 (liability dispute) correctly routed to manual_review with high severity. Requires timely human follow-up—see info issue above."
    }
  },
  "checklist_coverage": {
    "checked": [
      "Headline/cover contains no unsourced numbers, percentages, or client results",
      "Headline clickbait / absolute promises",
      "CTA presence, naturalness, and hardness",
      "Fit with AI self-media project matchmaking positioning",
      "Budget lead routed to manual review",
      "Transaction, legal, liability, dispute risks routed to manual/blocked"
    ],
    "unchecked_due_to_scope": [
      "Full article body fact-checking (out of scope for this gate)",
      "Auto-reply template compliance (downstream reply-generator responsibility)",
      "User identity / budget authenticity verification (manual follow-up)",
      "External links or privacy compliance"
    ],
    "missing_info": []
  },
  "rework_assignment": {
    "target_node": "content-draft-producer",
    "tasks": [
      {
        "variant_id": "B-05",
        "action": "Revise cover copy to remove probabilistic prediction; anchor to single-case narrative.",
        "suggestion": "Change '大概率会重演' to '这个故事或许并不陌生' or '值得你警惕的相似信号' with explicit note 'based on one interview'.",
        "acceptance_criteria": "No prediction of likelihood; must convey limited sourcing."
      },
      {
        "variant_id": "B-01",
        "action": "Adjust cover wording to avoid implying completeness.",
        "suggestion": "Replace '真实全貌' with '真实反馈' or '一线声音'.",
        "acceptance_criteria": "Wording aligned with single-source scope."
      },
      {
        "variant_id": "B-02",
        "decision": "publish_as_is"
      },
      {
        "variant_id": "B-03",
        "decision": "publish_as_is"
      },
      {
        "variant_id": "B-04",
        "decision": "publish_as_is"
      }
    ],
    "resubmit_required": true
  },
  "red_line_check": {
    "status": "REVISE_REQUIRED",
    "details": "B-05 cover violates representativeness and unsupported-claim red lines. B-01 wording inflates source scope. No fabricated numbers, fake stories, or hard-CTAs detected. All legal/transaction comment risks correctly routed. Block not warranted; revise and resubmit the two variants."
  }
}
```

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

- 无

### Prompt Patch Suggestions

- 无
