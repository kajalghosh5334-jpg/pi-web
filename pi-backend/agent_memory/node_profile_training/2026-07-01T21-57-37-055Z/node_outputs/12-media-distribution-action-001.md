# 多平台分发排期 payload

- Case ID: `media-distribution-action-001`
- Workflow: `WF-15`
- Node Type: `Action/Writeback`
- Target Profile: `structured-writeback-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `80`
- Pass: `false`
- Elapsed: `20108ms`
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
  "action_payloads": [
    {
      "platform": "douyin",
      "action_type": "schedule_post",
      "status": "missing_info",
      "source_artifact": {
        "variant_set": ["TECH-01", "TECH-02"],
        "upstream_nodes": ["media-title-draft-001", "media-content-review-001"]
      },
      "content_fields": {
        "title": "missing — 请求体生成节点提供",
        "script": "missing — 口播脚本未生成",
        "scheduled_time": "missing — 未指定"
      }
    },
    {
      "platform": "xiaohongshu",
      "action_type": "schedule_note",
      "status": "missing_info",
      "source_artifact": {
        "variant_set": ["ENT-01", "ENT-02"],
        "upstream_nodes": ["media-title-draft-001", "media-content-review-001"]
      },
      "content_fields": {
        "title": "missing — 标题可复用上游 variant headline",
        "cover_copy": "missing — 封面文案未生成",
        "body": "missing — 正文未生成"
      }
    },
    {
      "platform": "zhihu",
      "action_type": "schedule_answer",
      "status": "missing_info",
      "source_artifact": {
        "variant_set": ["MIX-01"],
        "upstream_nodes": ["media-title-draft-001", "media-content-review-001"]
      },
      "content_fields": {
        "long_title": "missing — 长标题可基于 MIX-01 headline 扩展",
        "answer_summary": "missing — 回答摘要未生成"
      }
    }
  ],
  "idempotency_key": "WF-15/schedule/20260702T000000Z/001",
  "validation_result": {
    "overall": "blocked",
    "reasons": [
      "所有 action_payloads 的 content_fields 均缺少必填项",
      "所有 action_payloads 缺少 scheduled_time",
      "平台分发实际内容未生成（仅存在标题封面草案）",
      "无法自动填充缺项"
    ]
  },
  "blocked_items": [
    "douyin: 缺少脚本和时间",
    "xiaohongshu: 缺少封面文案和正文",
    "zhihu: 缺少回答摘要",
    "required content generation nodes (content-body-generator, etc.) 尚未执行"
  ],
  "retry_or_manual_review_advice": [
    "待 content-body-generator 实际产出各平台适配正文、口播脚本、摘要后再重新提交此排期 payload",
    "scheduled_time 确认后可填入具体时间戳；如平台有锁定发布时段需单独传参"
  ]
}
```

## Judge

### Rubric Hits

- 为各平台生成 action_payloads
- 包含 idempotency_key
- 缺少字段标记 blocked 或 missing（内容字段缺失已标记）
- 不得声称已发布或已写入
- 高风险或缺审稿通过时转人工（无高风险，无需转人工，未违反）

### Missing

- scheduled_time 字段未在每个 action_payload 中显式出现并标记为 missing/blocked（仅在 douyin 的 content_fields 内部提及，其余平台未标注）
- payload 的 status 应使用 pending_write 或 pending_schedule，而非 missing_info
- scheduled_time 的缺失处理不够规范，未满足标准答案要求

### Hallucination

- 凭空生成 variant_set 具体标识（TECH-01、ENT-02、MIX-01 等），输入和上游输出均未提供相关信息

### Red Line Violations

- 无

### Profile Lessons

- 调度 payload 的必填字段（如 scheduled_time）即使缺失也应显式占位并标注 blocked/missing，不能只靠全局 validation_result 说明
- 状态值应使用标准、语义明确的术语（pending_write/pending_schedule），避免自定义词（missing_info）
- 引用上游产出时应使用输入中已出现的标识，避免假设具体 artifact 名称

### Prompt Patch Suggestions

- 要求每个 action_payload 必须包含 scheduled_time 顶层字段，值为具体时间或 missing/blocked
- 明确 payload 状态枚举为 pending_write 或 pending_schedule，禁止使用其他自定义状态
- 强调引用上游 artifact 时必须基于输入上下文，不得编造具体名称
