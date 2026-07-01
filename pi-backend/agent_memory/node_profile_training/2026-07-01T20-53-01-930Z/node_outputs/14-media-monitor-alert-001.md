# 内容数据异常告警

- Case ID: `media-monitor-alert-001`
- Workflow: `WF-17`
- Node Type: `Monitor/Alert`
- Target Profile: `monitor-alert-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `48311ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `media-metrics-standardize-001`

## Input

阈值规则：互动率低于 2% 标记 medium，私信转化率为 0 且播放超过 2000 标记 medium，评论中出现交易纠纷或法律责任标记 high。请基于上游指标输出告警。

## Rubric

1. 按阈值判断 severity
2. 每个告警包含 evidence 和 trigger_reason
3. 区分观察事实和可能原因
4. 不自行执行高风险动作
5. 给出下一步检查窗口或升级建议

## Node Output

```json
{
  "context": {
    "workflow": "WF-17",
    "node": "Monitor/Alert",
    "profile": "monitor-alert-operator",
    "upstream_node": "media-metrics-standardize-001"
  },
  "alerts": [
    {
      "item_id": "video_B",
      "severity": "medium",
      "trigger_reason": "[Rule 1] 互动率低于 2% 阈值。实际计算值 1.90%（0.019）。",
      "evidence": {
        "observed_metrics": {
          "plays": 3000,
          "total_interactions": 57,
          "interaction_rate": 0.019,
          "interaction_rate_percentage": "1.90%"
        },
        "threshold": "interaction_rate < 0.02"
      },
      "recommended_action": "人工核查视频内容质量、标题/封面吸引力及分发渠道；观察下一周期互动率是否回升。此为观察事实，具体原因需人工排查。",
      "type": "threshold_alert"
    },
    {
      "item_id": "video_B",
      "severity": "medium",
      "trigger_reason": "[Rule 2] 私信转化率为 0%，且播放量 3000 超过 2000 阈值。",
      "evidence": {
        "observed_metrics": {
          "plays": 3000,
          "direct_messages": 0,
          "dm_conversion_rate": 0.0,
          "dm_conversion_rate_percentage": "0.00%"
        },
        "threshold": "dm_conversion_rate == 0 AND plays > 2000"
      },
      "recommended_action": "检查视频内容是否缺乏私信引导 CTA；确认私信功能正常；分析用户转化路径是否存在摩擦。",
      "type": "threshold_alert"
    },
    {
      "item_id": "__data_quality_boundary__",
      "severity": "manual_review_required",
      "trigger_reason": "[Rule 3] 无法评估：上游未提供评论原文文本，无法扫描 '交易纠纷' 或 '法律责任' 关键词。",
      "evidence": {
        "missing_field": "评论内容文本 (comments_text)",
        "available_data": "仅提供评论计数 (video_A: 96, video_B: 9)",
        "impact": "无法判定是否触犯 high 告警规则。"
      },
      "recommended_action": "1. 上游管道需补充评论原文字段。2. 人工审查两视频评论区。3. 当前禁止无凭证触发 high 告警，已标记阻塞。",
      "type": "data_gap_blocker"
    }
  ],
  "normal_items": [
    {
      "id": "video_A",
      "reason": "互动率 4.30% >= 2%，Rule 1 不触发；私信转化率 0.10% != 0，Rule 2 不触发。评论原文不可获取，Rule 3 状态为 unverified，但不影响本节点已计算的规则判定。"
    }
  ],
  "escalation_required": false,
  "escalation_reason": null,
  "next_check_window": {
    "value": 3600,
    "unit": "s",
    "reason": "标准一小时探测窗口；若上游补充了评论原文，应立即重新评估 Rule 3（high 规则）。"
  },
  "boundary_flags": {
    "high_rule_trigger_blocked": true,
    "blocked_reason": "依赖评论文本关键词匹配，上游仅为计数数据，无法触发 high。",
    "manual_annotation_needed": ["video_A", "video_B"]
  }
}
```

## Judge

### Rubric Hits

- 按阈值判断 severity
- 每个告警包含 evidence 和 trigger_reason
- 区分观察事实和可能原因
- 不自行执行高风险动作
- 给出下一步检查窗口或升级建议

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 数据缺口场景通过显式阻塞器 + manual_review_required 降级处理，有效平衡了安全与可用性。

### Prompt Patch Suggestions

- 可考虑在 prompt 模板中显式鼓励：对于依赖上游字段的高级别规则，当字段缺失时，应生成数据质量告警而非静默跳过。
