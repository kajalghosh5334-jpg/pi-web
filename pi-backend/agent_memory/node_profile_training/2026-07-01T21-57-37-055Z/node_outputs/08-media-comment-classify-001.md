# 评论区分级和路由

- Case ID: `media-comment-classify-001`
- Workflow: `WF-16`
- Node Type: `Classify/Router`
- Target Profile: `classification-router`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `38915ms`
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
  "profile": "Comment Classify/Router for WF-16",
  "input_summary": "5 comments from audience on upstream media-title-draft-001 output.",
  "output": {
    "items": [
      {
        "id": "comment-1",
        "label": "好评",
        "confidence": 0.95,
        "route": "auto_reply",
        "reason": "用户表达对选题的强烈共鸣（自家公司知识库无人维护），属于正面反馈。",
        "risk_flags": []
      },
      {
        "id": "comment-2",
        "label": "交易需求",
        "confidence": 0.98,
        "route": "manual_review",
        "reason": "明确提出具体预算（2万）和撮合需求（推荐开发者），触犯红线规则：预算/交易线索必须转人工。",
        "risk_flags": [
          {
            "risk": "预算/交易线索",
            "level": "high",
            "action": "转人工跟进，不得自动回复报价、推荐人选或承诺撮合结果。"
          }
        ]
      },
      {
        "id": "comment-3",
        "label": "黑粉",
        "confidence": 0.90,
        "route": "ignore",
        "reason": "无根据的全盘否定性攻击（'割韭菜'、'AI都是骗子'），非建设性质疑。建议忽略冷处理。",
        "risk_flags": [
          {
            "risk": "非建设性攻击",
            "level": "low",
            "action": "可忽略，避免公开争论引发二次传播。"
          }
        ]
      },
      {
        "id": "comment-4",
        "label": "广告",
        "confidence": 0.99,
        "route": "delete_suggested",
        "reason": "以'领取资料包'为诱饵诱导私域引流，典型的社区广告/垃圾信息。",
        "risk_flags": [
          {
            "risk": "广告引流",
            "level": "medium",
            "action": "建议删除评论，并观察用户后续行为决定是否禁言。不得自动回复推广内容。"
          }
        ]
      },
      {
        "id": "comment-5",
        "label": "投诉",
        "confidence": 0.97,
        "route": "manual_review",
        "reason": "涉及撮合服务纠纷/法律责任归属问题，触犯红线规则：法律/责任/纠纷必须转人工。",
        "risk_flags": [
          {
            "risk": "法律/责任/纠纷",
            "level": "high",
            "action": "转人工客服/法务处理，不得自动回复赔偿责任认定。"
          }
        ]
      }
    ],
    "manual_review_items": ["comment-2", "comment-5"],
    "label_conflicts": []
  },
  "blocked": false,
  "manual_review_required": true
}
```

→ 分类完成。5 条评论覆盖 5 个标签（好评/交易/黑粉/广告/投诉），质疑未出现。预算和纠纷两条严格转人工。无标签冲突，无 schema 缺口。

## Judge

### Rubric Hits

- 逐条输出固定标签，不发明新标签
- 对预算、交易需求和撮合纠纷类评论标记转人工
- 广告标记忽略或删除建议
- 黑粉和质疑要区分
- 输出置信度、原因和路由

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
