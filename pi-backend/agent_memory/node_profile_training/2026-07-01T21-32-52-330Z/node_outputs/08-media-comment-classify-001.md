# 评论区分级和路由

- Case ID: `media-comment-classify-001`
- Workflow: `WF-16`
- Node Type: `Classify/Router`
- Target Profile: `classification-router`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `31070ms`
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
  "node_id": "classification-router",
  "workflow": "WF-16",
  "task": "评论区分级和路由",
  "items": [
    {
      "id": "comment_1",
      "text": "这个选题太真实了，我们公司知识库就是没人维护。",
      "label": "好评",
      "confidence": 0.95,
      "route": "auto_reply",
      "reason": "用户对选题表示认可并分享自身情况，属于正面情感反馈",
      "risk_flags": []
    },
    {
      "id": "comment_2",
      "text": "能不能推荐靠谱开发者？预算 2 万。",
      "label": "交易需求",
      "confidence": 0.98,
      "route": "manual_review",
      "reason": "明确表达寻找开发者并提供预算，属于交易线索，需人工跟进",
      "risk_flags": [
        {
          "type": "BUDGET_CLAIM",
          "severity": "info",
          "detail": "用户提及预算2万，需核实是否为准入预算并评估匹配可能性",
          "suggestion": "人工确认用户具体需求场景，避免直接承诺匹配结果"
        }
      ]
    },
    {
      "id": "comment_3",
      "text": "你这就是割韭菜吧，AI 都是骗子。",
      "label": "黑粉",
      "confidence": 0.85,
      "route": "ignore",
      "reason": "用户使用'割韭菜''骗子'等攻击性词汇，无具体质疑点，属情绪发泄型评论",
      "risk_flags": [
        {
          "type": "REPUTATION_RISK",
          "severity": "low",
          "detail": "该评论可能代表部分用户对AI行业的负面认知，建议监控类似言论集中度",
          "suggestion": "若多条同类评论出现，可考虑统一对外声明"
        }
      ]
    },
    {
      "id": "comment_4",
      "text": "加我私域领取 AI 资料包。",
      "label": "广告",
      "confidence": 0.99,
      "route": "ignore",
      "reason": "引导至私人领域领取资料，属于商业推广内容",
      "risk_flags": [
        {
          "type": "SPAM",
          "severity": "low",
          "detail": "单条广告骚扰，屏蔽处理",
          "suggestion": "可考虑屏蔽该用户"
        }
      ]
    },
    {
      "id": "comment_5",
      "text": "你们撮合项目出现纠纷谁负责？",
      "label": "投诉",
      "confidence": 0.9,
      "route": "manual_review",
      "reason": "用户对撮合后的责任归属提出质疑，涉及法律和责任界定，必须人工处理",
      "risk_flags": [
        {
          "type": "LEGAL_LIABILITY",
          "severity": "high",
          "detail": "涉及项目纠纷责任归属，可能引发法律风险",
          "suggestion": "需法务或运营团队介入回复，不可自动回应"
        }
      ]
    }
  ],
  "manual_review_items": ["comment_2", "comment_5"],
  "label_conflicts": [],
  "schema_gap_notes": "",
  "red_line_check": {
    "status": "PASS",
    "details": "未自动回复交易/投诉类评论；未发明标签；广告仅忽略；所有输出基于评论内容事实分类。"
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

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 无

### Prompt Patch Suggestions

- 无
