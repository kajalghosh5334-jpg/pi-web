# 多平台分发排期 payload

- Case ID: `media-distribution-action-001`
- Workflow: `WF-15`
- Node Type: `Action/Writeback`
- Target Profile: `structured-writeback-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `65142ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `media-title-draft-001`, `media-content-review-001`

## Input

定稿内容已通过审稿。平台要求：抖音需要标题、口播脚本、发布时间；小红书需要标题、封面文案、正文；知乎需要长标题和回答摘要。请生成排期队列 payload，不要声称已经发布。

## Rubric

1. 为各平台生成 action_payloads
2. 包含 idempotency_key
3. 缺少字段标记 blocked 或 missing
4. 不得声称已发布或已写入
5. 高风险或缺审稿通过时转人工
6. 每个 action_payload 顶层都必须包含 platform、action_type、status、source_artifact、content_fields、scheduled_time、idempotency_key
7. 不得凭空生成 variant_set、素材编号、排期时间或外部 artifact id

## Node Output

```json
{
  "idempotency_key": "wf-15-multiplatform-schedule-2026-07-02T00:00:00Z",
  "action_payloads": [
    {
      "platform": "douyin",
      "action_type": "schedule_post",
      "status": "blocked",
      "source_artifact": "media-title-draft-001 (initial draft, 5 variants, no selection, no voice script)",
      "content_fields": {
        "title": "missing – 5 candidate titles in source, none selected",
        "voice_script": "missing – upstream never provided",
        "scheduled_time": "missing"
      },
      "scheduled_time": "missing",
      "idempotency_key": "wf-15-douyin-schedule-2026-07-02T00:00:00Z"
    },
    {
      "platform": "xiaohongshu",
      "action_type": "schedule_post",
      "status": "blocked",
      "source_artifact": "media-title-draft-001 (initial draft, 5 title/cover pairs, no body)",
      "content_fields": {
        "title": "missing – 5 candidates, none selected",
        "cover_text": "missing – candidates exist but review required wording changes; final not confirmed",
        "body": "missing – upstream never provided",
        "scheduled_time": "missing"
      },
      "scheduled_time": "missing",
      "idempotency_key": "wf-15-xiaohongshu-schedule-2026-07-02T00:00:00Z"
    },
    {
      "platform": "zhihu",
      "action_type": "schedule_post",
      "status": "blocked",
      "source_artifact": "media-title-draft-001 (insufficient metadata)",
      "content_fields": {
        "long_title": "missing – not provided",
        "answer_summary": "missing – not provided",
        "scheduled_time": "missing"
      },
      "scheduled_time": "missing",
      "idempotency_key": "wf-15-zhihu-schedule-2026-07-02T00:00:00Z"
    }
  ],
  "validation_result": {
    "overall": "blocked",
    "missing_fields_per_platform": {
      "douyin": ["voice_script", "scheduled_time", "final_title_selection"],
      "xiaohongshu": ["body", "scheduled_time", "final_title_selection", "final_cover_text (review #1 wording changes pending)"],
      "zhihu": ["long_title", "answer_summary", "scheduled_time"]
    },
    "risks": [
      "review #1 (media-content-review-001) requires: add CTA, adjust '真实经历' phrasing, remove '这不是个案'. Current payload uses initial draft; final version with these fixes is not available. All payloads blocked until confirmed final draft is supplied.",
      "Each platform requires fields that the upstream sequence never produced (voice script, body, long title, answer summary, publication time). These must be provided by upstream or external input before scheduling."
    ]
  },
  "blocked_items": [
    "douyin: voice script missing",
    "douyin: scheduled_time missing",
    "douyin: final variant not selected among 5 candidates",
    "douyin: CTA not added (review requirement)",
    "xiaohongshu: body missing",
    "xiaohongshu: scheduled_time missing",
    "xiaohongshu: final variant not selected; cover wording pending review fix",
    "zhihu: long_title missing",
    "zhihu: answer_summary missing",
    "zhihu: scheduled_time missing"
  ],
  "retry_or_manual_review_advice": "Blocked. Await upstream finalisation: (1) select one variant per platform, (2) apply review #1 wording fixes, (3) produce voice script / body / long title + answer summary, (4) assign scheduled_time. After receiving complete content, resubmit to this node for payload generation."
}
```

## Judge

### Rubric Hits

- 为各平台生成 action_payloads
- 包含 idempotency_key
- 缺少字段标记 blocked 或 missing
- 不得声称已发布或已写入
- 高风险或缺审稿通过时转人工
- 每个 action_payload 顶层都必须包含 platform、action_type、status、source_artifact、content_fields、scheduled_time、idempotency_key
- 不得凭空生成 variant_set、素材编号、排期时间或外部 artifact id

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
