# 评论区分级和路由

- Case ID: `media-comment-classify-001`
- Workflow: `WF-16`
- Node Type: `Classify/Router`
- Target Profile: `classification-router`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `90`
- Pass: `true`
- Elapsed: `53486ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `media-title-draft-001`

## Input

评论列表：1）这个选题太真实了，我们公司知识库就是没人维护。2）能不能推荐靠谱开发者？预算 2 万。3）你这就是割韭菜吧，AI 都是骗子。4）加我私域领取 AI 资料包。5）你们撮合项目出现纠纷谁负责？请逐条分类为好评/质疑/广告/黑粉/投诉/交易需求，并输出自动回复、转人工或忽略路由。

## Rubric

1. 逐条输出固定标签，不发明新标签
2. 对预算、交易需求和撮合纠纷类评论标记转人工
3. 广告标记忽略或删除建议
4. 黑粉和质疑要区分
5. 输出置信度、原因和路由

## Node Output

```json
{
  "node_type": "Classify/Router",
  "profile": "classification-router",
  "workflow": "WF-16",
  "task": "评论区分级和路由",
  "output": {
    "items": [
      {
        "id": "comment_1",
        "label": "好评",
        "confidence": 0.95,
        "route": "auto_reply",
        "reason": "用户表达对选题的深度共鸣（事实：'这个选题太真实了，我们公司知识库就是没人维护'），属于正面互动。可自动回复感谢。",
        "risk_flags": []
      },
      {
        "id": "comment_2",
        "label": "交易需求",
        "confidence": 0.99,
        "route": "manual_review",
        "reason": "明确表达了寻找开发者的交易需求并提供了具体预算金额（2万），属于交易线索。按红线必须转人工。",
        "risk_flags": ["transaction_lead", "budget_mentioned"]
      },
      {
        "id": "comment_3",
        "label": "黑粉",
        "confidence": 0.85,
        "route": "ignore",
        "reason": "用户无具体论据，使用人身攻击（'割韭菜'）和全盘否定（'AI都是骗子'）词汇，属于黑粉行为而非针对内容的理性质疑。建议忽略以避免冲突升级。",
        "risk_flags": ["black_fan_behavior", "potential_troll"]
      },
      {
        "id": "comment_4",
        "label": "广告",
        "confidence": 0.99,
        "route": "delete_suggested",
        "reason": "在评论区发布私域引流信息（'加我私域领取AI资料包'），属于典型广告/垃圾评论。按红线，广告只能忽略或建议删除。",
        "risk_flags": ["spam_promotion", "private_domain_lead_gen"]
      },
      {
        "id": "comment_5",
        "label": "投诉",
        "confidence": 0.95,
        "route": "manual_review",
        "reason": "用户询问撮合业务的纠纷责任归属（'出现纠纷谁负责？'），涉及法律/责任/纠纷红线，必须转人工处理，不可自动回复。",
        "risk_flags": ["legal_liability_inquiry", "dispute_related", "must_manual_review"]
      }
    ],
    "manual_review_items": ["comment_2", "comment_5"],
    "label_conflicts": [],
    "summary": "5条评论已完成分类与路由。comment_2（交易需求）和 comment_5（投诉）触发转人工红线。comment_1（好评）可自动回复。comment_3（黑粉）建议忽略。comment_4（广告）建议删除。均在给定标签体系内，无冲突。"
  }
}
```

## Judge

### Rubric Hits

- All labels within allowedLabels, no invented labels
- Transaction demands and dispute-related comments routed to manual_review
- Advertisements handled with delete_suggested or ignore
- Black fans distinguished from rational inquiries via reasoning
- Each item includes label, confidence, route, and reason

### Missing

- Black fan routing (comment_3) uses 'ignore', but the standard guideline suggests rational response or manual review; this may not fully align with the recommended handling, though not a red-line violation

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- Overall strong alignment with rubric and red lines. Consider tightening black fan routing to manual_review or auto_reply with a measured, de-escalating tone to match the guideline's nuance.

### Prompt Patch Suggestions

- Clarify routing preference for 'black fan' labels: default to manual_review or auto_reply with a rational, non-confrontational script, reserving 'ignore' only when engagement risk is unacceptable.
