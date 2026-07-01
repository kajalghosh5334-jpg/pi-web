# 评论区分级和路由

- Case ID: `media-comment-classify-001`
- Workflow: `WF-16`
- Node Type: `Classify/Router`
- Target Profile: `classification-router`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `50`
- Pass: `false`
- Elapsed: `29229ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `media-title-draft-001`

## Input

评论列表：1）这个选题太真实了，我们公司知识库就是没人维护。2）能不能推荐靠谱开发者？预算 2 万。3）你这就是割韭菜吧，AI 都是骗子。4）加我私域领取 AI 资料包。5）你们撮合项目出现纠纷谁负责？请逐条分类为好评/质疑/广告/黑粉/投诉，并输出自动回复、转人工或忽略路由。

## Rubric

1. 逐条输出固定标签，不发明新标签
2. 对预算和撮合纠纷类评论标记转人工
3. 广告标记忽略或删除建议
4. 黑粉和质疑要区分
5. 输出置信度、原因和路由

## Node Output

```json
[
  {
    "comment": "这个选题太真实了，我们公司知识库就是没人维护。",
    "main_tag": "好评",
    "confidence": 0.9,
    "reason": "表达对选题的认同，并分享自身类似经历，属于正面反馈。",
    "route": "auto_reply",
    "auto_reply": "感谢您的认可！知识库维护确实是企业落地LLM的常见挑战，后续内容会深入探讨如何规避这类坑。欢迎持续关注。",
    "transfer_to_human": false
  },
  {
    "comment": "能不能推荐靠谱开发者？预算 2 万。",
    "main_tag": "质疑",
    "confidence": 0.75,
    "reason": "用户实际为交易需求（预算+推荐请求），非内容质疑，但标签体系内最接近的是'质疑'；需人工介入避免违规承诺。",
    "route": "transfer_to_human",
    "auto_reply": "感谢您的咨询。我们提供项目撮合服务，您的需求已转专业团队跟进，请保持联系方式畅通。（不承诺具体匹配结果）",
    "transfer_to_human": true
  },
  {
    "comment": "你这就是割韭菜吧，AI 都是骗子。",
    "main_tag": "黑粉",
    "confidence": 0.85,
    "reason": "无具体论据的全盘否定和情绪化攻击，属于黑粉行为而非建设性质疑。",
    "route": "ignore",
    "auto_reply": null,
    "transfer_to_human": false
  },
  {
    "comment": "加我私域领取 AI 资料包。",
    "main_tag": "广告",
    "confidence": 0.95,
    "reason": "明显引导私域流量的营销推广，非内容互动。",
    "route": "ignore",
    "auto_reply": null,
    "transfer_to_human": false
  },
  {
    "comment": "你们撮合项目出现纠纷谁负责？",
    "main_tag": "投诉",
    "confidence": 0.9,
    "reason": "直接质疑纠纷责任归属，属于交易风险类问题，需人工按规则解释，不可自动答复责任条款。",
    "route": "transfer_to_human",
    "auto_reply": "已收到您的反馈。关于项目纠纷问题我们非常重视，已转人工客服处理，将为您详细说明现有保障机制。（不承诺具体责任判定）",
    "transfer_to_human": true
  }
]
```

## Judge

### Rubric Hits

- 对预算和撮合纠纷类评论标记转人工（第2、5条route为transfer_to_human）
- 广告标记忽略或删除建议（第4条route为ignore）
- 输出置信度、原因和路由（所有条目均包含）

### Missing

- 逐条输出固定标签未完全执行：第2条为交易需求类评论，应使用'交易需求'或'高价值线索'等预设标签，而非'质疑'
- 黑粉处理路由不当：第3条黑粉评论route为'ignore'，标准预期应理性回应或人工视情况，不应直接忽略

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 标签体系缺少'交易需求/高价值线索'类别，导致模型错误借用'质疑'标签，影响下游分类与跟进
- 黑粉自动化屏蔽可能错失挽回机会，需在 prompt 中明确黑粉≠忽略

### Prompt Patch Suggestions

- 在标签体系中增加'交易需求'或类似标签，并给出触发关键词（预算、推荐、撮合等）
- 明确每个标签对应的路由策略，特别是黑粉应路由至'manual_review'或'理性回应'而非'ignore'
- 提供标签路由映射表，减少模型自行推理路由空间
