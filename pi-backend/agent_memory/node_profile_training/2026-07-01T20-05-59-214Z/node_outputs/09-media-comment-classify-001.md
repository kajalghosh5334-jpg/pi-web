# 评论区分级和路由

- Case ID: `media-comment-classify-001`
- Workflow: `WF-16`
- Node Type: `Classify/Router`
- Target Profile: `classification-router`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `85`
- Pass: `true`
- Elapsed: `30187ms`
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
  "node": "classification-router",
  "target_profile": "评论区分级和路由",
  "workflow": "WF-16",
  "classification_results": {
    "items": [
      {
        "id": 1,
        "text": "这个选题太真实了，我们公司知识库就是没人维护。",
        "label": "好评",
        "confidence": 0.95,
        "route": "auto_reply",
        "reason": "用户表达共鸣，对选题揭示的困境给出正面反馈，属于情感共鸣类好评，适合自动回复致谢或引导讨论。",
        "risk_flags": []
      },
      {
        "id": 2,
        "text": "能不能推荐靠谱开发者？预算 2 万。",
        "label": "交易需求",
        "confidence": 0.98,
        "route": "manual_review",
        "reason": "包含具体预算和开发者推荐需求，属交易线索。红线要求：预算/交易线索必须转人工，避免不当承诺或导流纠纷。",
        "risk_flags": ["交易线索", "预算提及"]
      },
      {
        "id": 3,
        "text": "你这就是割韭菜吧，AI 都是骗子。",
        "label": "黑粉",
        "confidence": 0.92,
        "route": "ignore",
        "reason": "无具体论据，情绪化攻击加全盘否定（都是骗子），符合黑粉特征。建议忽略，不生成自动回复以免升级冲突。",
        "risk_flags": ["黑粉攻击"]
      },
      {
        "id": 4,
        "text": "加我私域领取 AI 资料包。",
        "label": "广告",
        "confidence": 0.99,
        "route": "delete_suggested",
        "reason": "明确推广私域链接/导流，符合广告定义。红线要求：广告只能忽略/删除建议，不应生成任何响应。",
        "risk_flags": ["私域导流", "广告"]
      },
      {
        "id": 5,
        "text": "你们撮合项目出现纠纷谁负责？",
        "label": "投诉",
        "confidence": 0.90,
        "route": "manual_review",
        "reason": "涉及撮合平台法律责任和纠纷归属，属高风险法律/责任问询。红线要求：法律/纠纷/投诉必须转人工，严禁自动回复承诺。",
        "risk_flags": ["法律风险", "纠纷责任", "撮合投诉"]
      }
    ],
    "manual_review_items": [2, 5],
    "label_conflicts": [
      {
        "item_id": 3,
        "conflict": "黑粉 vs 质疑",
        "resolution": "选黑粉。全盘否定（都是骗子）和人身攻击（割韭菜）无建设性，情绪和否定程度远超质疑范畴。"
      },
      {
        "item_id": 5,
        "conflict": "投诉 vs 质疑",
        "resolution": "选投诉。虽以疑问句式出现，内容直接指向平台责任归属，属于潜在投诉/法律问询，按红线归为投诉处理。"
      }
    ]
  }
}
```

## Judge

### Rubric Hits

- 逐条输出固定标签，不发明新标签
- 对预算、交易需求和撮合纠纷类评论标记转人工
- 广告标记忽略或删除建议
- 黑粉和质疑要区分
- 输出置信度、原因和路由

### Missing

- 黑粉/强质疑评论（id3）宜建议人工处理或理性回应，而非直接忽略

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 黑粉或强质疑评论路由应为 manual_review 或 auto_reply（理性回应），避免采用 ignore 导致舆情升级

### Prompt Patch Suggestions

- 在分类 prompt 中新增路由指引：黑粉/强质疑类评论应标记为 manual_review 或生成理性回应，仅广告/无关 spam 可用 ignore
