# 评论区分级和路由

- Case ID: `media-comment-classify-001`
- Workflow: `WF-16`
- Node Type: `Classify/Router`
- Target Profile: `classification-router`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `85`
- Pass: `true`
- Elapsed: `17570ms`
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
  "items": [
    {
      "id": 1,
      "label": "好评",
      "confidence": "high",
      "route": "auto_reply",
      "reason": "用户对选题表示认同，并分享自身知识库维护经历，属于正面反馈。",
      "risk_flags": []
    },
    {
      "id": 2,
      "label": "交易需求",
      "confidence": "high",
      "route": "manual_review",
      "reason": "用户明确询问推荐开发者并给出预算2万，属于交易线索，必须人工跟进。",
      "risk_flags": ["budget_mentioned"]
    },
    {
      "id": 3,
      "label": "黑粉",
      "confidence": "medium",
      "route": "ignore",
      "reason": "用户发表攻击性言论（'割韭菜'、'骗子'），无建设性质疑，属于恶意攻击。",
      "risk_flags": ["attacking_language"]
    },
    {
      "id": 4,
      "label": "广告",
      "confidence": "high",
      "route": "ignore",
      "reason": "用户引导加私域领取资料包，属于广告推广。",
      "risk_flags": ["advertisement"]
    },
    {
      "id": 5,
      "label": "投诉",
      "confidence": "high",
      "route": "manual_review",
      "reason": "用户询问撮合项目纠纷责任归属，涉及法律/责任问题，必须人工处理。",
      "risk_flags": ["legal_liability"]
    }
  ],
  "manual_review_items": [2, 5],
  "label_conflicts": []
}
```

## Judge

### Rubric Hits

- 逐条输出固定标签，不发明新标签
- 对预算、交易需求和撮合纠纷类评论标记转人工
- 广告标记忽略或删除建议
- 黑粉和质疑有区分

### Missing

- 评论3（'你这就是割韭菜吧，AI 都是骗子'）应视为黑粉/强质疑，建议理性回应或人工视情况，而非直接忽略

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 对于攻击性/黑粉评论，即使选择忽略也应考虑保留人工审核或理性回应的可能性，避免简单忽略导致用户负面感知

### Prompt Patch Suggestions

- 可在分类 prompt 中明确：对于黑粉/强质疑，路由应为 manual_review 或至少标记为需人工复核，避免直接 ignore
