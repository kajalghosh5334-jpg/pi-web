# 多平台分发排期 payload

- Case ID: `media-distribution-action-001`
- Workflow: `WF-15`
- Node Type: `Action/Writeback`
- Target Profile: `structured-writeback-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `75`
- Pass: `false`
- Elapsed: `59984ms`
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

## Node Output

```json
{
  "node_type": "Action/Writeback",
  "profile": "structured-writeback-operator",
  "workflow": "WF-15",
  "task": "多平台分发排期 payload",
  "action_payloads": [
    {
      "platform": "douyin",
      "action": "schedule_post",
      "parameters": {
        "title": "missing — 候选标题见 upstream media-title-draft-001 output.draft_sections，待选定 variant",
        "script": "missing",
        "scheduled_time": "missing"
      },
      "blocked": true,
      "block_reason": "口播脚本、发布时间缺失；标题未选定 variant。"
    },
    {
      "platform": "xiaohongshu",
      "action": "schedule_post",
      "parameters": {
        "title": "missing — 候选标题见 upstream media-title-draft-001 output.draft_sections，待选定 variant",
        "cover_copy": "missing — 候选封面文案见 upstream，待选定 variant",
        "body": "missing"
      },
      "blocked": true,
      "block_reason": "正文缺失；标题及封面文案未选定 variant。"
    },
    {
      "platform": "zhihu",
      "action": "schedule_post",
      "parameters": {
        "long_title": "missing — 需基于选定标题扩展",
        "answer_summary": "missing — 需基于选定文案撰写"
      },
      "blocked": true,
      "block_reason": "长标题、回答摘要缺失；且未选定 variant。"
    }
  ],
  "idempotency_key": "wf-15-distribution-20260702T205301z",
  "validation_result": {
    "status": "blocked",
    "summary": "所有平台 action_payloads 因关键字段缺失被阻塞，无法加入排期队列。",
    "missing_fields": {
      "douyin": ["口播脚本", "发布时间"],
      "xiaohongshu": ["正文"],
      "zhihu": ["长标题", "回答摘要"],
      "common": ["最终选定 variant", "各平台目标排期时间"]
    },
    "blocked_items": ["douyin_payload", "xiaohongshu_payload", "zhihu_payload"]
  },
  "blocked_items": [
    {
      "item": "douyin_action_payload",
      "reason": "口播脚本、发布时间缺失，标题 variant 待定"
    },
    {
      "item": "xiaohongshu_action_payload",
      "reason": "正文缺失，标题/封面 variant 待定"
    },
    {
      "item": "zhihu_action_payload",
      "reason": "长标题、回答摘要缺失，内容 variant 待定"
    }
  ],
  "retry_or_manual_review_advice": "需上游补充：(1) 从 5 组 variant 中选定最终标题及封面文案；(2) 抖音口播脚本、小红书正文、知乎长标题及回答摘要；(3) 各平台目标发布时间。补充完毕后重新生成 payload。",
  "notes": {
    "candidate_variants": "5 组 variant 详情见 media-title-draft-001 output.draft_sections，此处未重复列出以保持 payload 简洁。",
    "review_status": "上游审稿（media-content-review-001）已通过，内容层面无阻塞；当前阻塞仅因排期所需专有字段缺失。",
    "claimed_execution": false
  }
}
```

## Judge

### Rubric Hits

- 为各平台生成 action_payloads
- 包含 idempotency_key
- 缺少字段标记 blocked 或 missing
- 不得声称已发布或已写入
- 高风险或缺审稿通过时转人工（已检查审稿状态且无违规）

### Missing

- 每个平台 action_payload 缺少 source_artifact 字段
- 每个平台 action_payload 缺少显式的 status 字段（如 pending_schedule），当前仅通过 blocked: true 暗含状态
- 小红书和知乎的 payload 中未包含 scheduled_time 字段，即使值缺失也应设为 'missing'
- content_fields 未作为独立字段呈现，而是隐藏在 parameters 下，建议标准化

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 结构化 action_payload 必须包含标准字段：platform, status, source_artifact, scheduled_time, content_fields；即使缺失也应用 'missing' 占位，确保下游解析一致。

### Prompt Patch Suggestions

- 在任务提示中显式要求每个 action_payload 必须携带 status（默认为 pending_schedule）、source_artifact 和 scheduled_time 字段，缺失时使用 'missing' 字符串。
