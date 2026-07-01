# 评论区分级和路由

- Case ID: `media-comment-classify-001`
- Workflow: `WF-16`
- Node Type: `Classify/Router`
- Target Profile: `classification-router`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `78`
- Pass: `false`
- Elapsed: `34987ms`
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
      "confidence": 0.95,
      "route": "auto_reply",
      "reason": "用户分享亲身经历并表达共鸣，属于积极的用户正向反馈。",
      "risk_flags": []
    },
    {
      "id": 2,
      "label": "交易需求",
      "confidence": 0.98,
      "route": "manual_review",
      "reason": "用户明确提出寻找开发者并给出明确预算（2万），属于交易线索和预算窗口条，必须人工跟进。",
      "risk_flags": ["budget_clue", "transaction_request"]
    },
    {
      "id": 3,
      "label": "黑粉",
      "confidence": 0.90,
      "route": "ignore",
      "reason": "用户使用「割韭菜」「骗子」等标签化、非建设性的攻击性语言，符合黑粉特征，无具体质疑点或投诉要素。",
      "risk_flags": []
    },
    {
      "id": 4,
      "label": "广告",
      "confidence": 0.98,
      "route": "delete_suggested",
      "reason": "典型的私域引流和资料推广，属于垃圾广告内容，建议删除。",
      "risk_flags": ["spam_advertisement", "private_traffic_promotion"]
    },
    {
      "id": 5,
      "label": "投诉",
      "confidence": 0.85,
      "route": "manual_review",
      "reason": "用户询问撮合服务的纠纷责任归属，直接涉及法律责任和平台风险，按高风险原则归类为投诉以触发人工审核。",
      "risk_flags": ["legal_liability", "dispute_resolution", "platform_risk"]
    }
  ],
  "manual_review_items": [2, 5],
  "label_conflicts": [
    {
      "item_id": 5,
      "detail": "标签「投诉」与「质疑」边界模糊。该评论语气为假设性质问，但内容直接关联平台纠纷责任。按高风险原则归类为「投诉」以触发人工审核。建议下游核实用户是否确有投诉经历；若无具体案例，可降为「质疑」并采用不含法律责任承诺的 auto_reply 模板。"
    }
  ]
}
```

## Judge

### Rubric Hits

- 逐条输出固定标签体系内标签，无发明新标签
- 预算交易需求(第2条)正确标记转人工，附budget_clue等风险标记
- 撮合纠纷(第5条)正确识别为投诉转人工，附法律/平台风险标记
- 广告(第4条)正确标记delete_suggested
- 黑粉与质疑做了区分(第3条理由指出无具体质疑点)
- 每条均有label、confidence、route、reason，结构完整
- label_conflicts记录第5条投诉/质疑边界模糊并附处理建议

### Missing

- 第3条路由不应为ignore；标准答案明确建议'理性回应或人工视情况'，应路由到manual_review或auto_reply
- label_conflicts未记录第3条黑粉/质疑标签歧义，标准答案指出该条可能为'黑粉或强质疑'

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 黑粉类评论即使无具体质疑点，不宜直接忽略；应至少触发人工判断或预备理性回应模板
- 标准答案指出标签歧义(黑粉/质疑)时，应在label_conflicts中记录供下游核实

### Prompt Patch Suggestions

- 明确：黑粉默认路由为manual_review或auto_reply(理性回应)，确认纯垃圾才用ignore
- 要求：单条存在标签歧义(黑粉vs质疑、投诉vs质疑)时必须在label_conflicts记录并给出降级/升级建议
