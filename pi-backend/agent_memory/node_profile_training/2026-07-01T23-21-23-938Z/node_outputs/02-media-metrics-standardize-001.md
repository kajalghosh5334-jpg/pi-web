# 自媒体指标标准化

- Case ID: `media-metrics-standardize-001`
- Workflow: `WF-17`
- Node Type: `Standardize`
- Target Profile: `weak-structured-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `41734ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: none

## Input

发布数据：视频 A 播放 12000，点赞 360，评论 96，转发 48，私信 12；视频 B 播放 3000，点赞 45，评论 9，转发 3，私信 0。请转换成互动率、评论率、转发率、私信转化率。

## Rubric

1. 正确计算率值指标
2. 保留原始分子分母
3. 私信为 0 时不得补造
4. 只做指标转换，不做波动归因
5. 输出结构化表格或 JSON

## Node Output

```json
{
  "node_meta": {
    "node_type": "Standardize",
    "target_profile": "weak-structured-operator",
    "workflow": "WF-17",
    "task": "自媒体指标标准化"
  },

  "normalized_items": [
    {
      "item_id": "视频 A",
      "raw_input": {
        "views": 12000,
        "likes": 360,
        "comments": 96,
        "shares": 48,
        "direct_messages": 12
      },
      "standardized_metrics": {
        "interaction_rate": {
          "formula": "(likes + comments + shares) / views",
          "numerator": 504,
          "denominator": 12000,
          "decimal_value": 0.042,
          "percent_display": "4.2%",
          "source_evidence": "发布数据：视频 A 播放 12000，点赞 360，评论 96，转发 48，私信 12"
        },
        "comment_rate": {
          "formula": "comments / views",
          "numerator": 96,
          "denominator": 12000,
          "decimal_value": 0.008,
          "percent_display": "0.8%",
          "source_evidence": "发布数据：视频 A 播放 12000，点赞 360，评论 96，转发 48，私信 12"
        },
        "share_rate": {
          "formula": "shares / views",
          "numerator": 48,
          "denominator": 12000,
          "decimal_value": 0.004,
          "percent_display": "0.4%",
          "source_evidence": "发布数据：视频 A 播放 12000，点赞 360，评论 96，转发 48，私信 12"
        },
        "dm_conversion_rate": {
          "formula": "direct_messages / views",
          "numerator": 12,
          "denominator": 12000,
          "decimal_value": 0.001,
          "percent_display": "0.1%",
          "source_evidence": "发布数据：视频 A 播放 12000，点赞 360，评论 96，转发 48，私信 12"
        }
      }
    },
    {
      "item_id": "视频 B",
      "raw_input": {
        "views": 3000,
        "likes": 45,
        "comments": 9,
        "shares": 3,
        "direct_messages": 0
      },
      "standardized_metrics": {
        "interaction_rate": {
          "formula": "(likes + comments + shares) / views",
          "numerator": 57,
          "denominator": 3000,
          "decimal_value": 0.019,
          "percent_display": "1.9%",
          "source_evidence": "发布数据：视频 B 播放 3000，点赞 45，评论 9，转发 3，私信 0"
        },
        "comment_rate": {
          "formula": "comments / views",
          "numerator": 9,
          "denominator": 3000,
          "decimal_value": 0.003,
          "percent_display": "0.3%",
          "source_evidence": "发布数据：视频 B 播放 3000，点赞 45，评论 9，转发 3，私信 0"
        },
        "share_rate": {
          "formula": "shares / views",
          "numerator": 3,
          "denominator": 3000,
          "decimal_value": 0.001,
          "percent_display": "0.1%",
          "source_evidence": "发布数据：视频 B 播放 3000，点赞 45，评论 9，转发 3，私信 0"
        },
        "dm_conversion_rate": {
          "formula": "direct_messages / views",
          "numerator": 0,
          "denominator": 3000,
          "decimal_value": 0.0,
          "percent_display": "0%",
          "source_evidence": "发布数据：视频 B 播放 3000，点赞 45，评论 9，转发 3，私信 0"
        }
      }
    }
  ],

  "field_mapping": {
    "播放": "views",
    "点赞": "likes",
    "评论": "comments",
    "转发": "shares",
    "私信": "direct_messages",
    "互动率": "interaction_rate",
    "评论率": "comment_rate",
    "转发率": "share_rate",
    "私信转化率": "dm_conversion_rate"
  },

  "missing_fields": [],

  "format_warnings": [],

  "handoff_summary": {
    "summary": "完成非结构化发布数据到标准化率值指标的结构化转换，保留原始分子分母，严格依据公式计算。",
    "items_processed_count": 2,
    "metrics_standardized": [
      "interaction_rate",
      "comment_rate",
      "share_rate",
      "dm_conversion_rate"
    ],
    "evidence_basis": "原始计数均来自用户输入行，未引入外部数据。数值严格遵循确定性预计算参考中的公式。",
    "integrity_statement": "视频 B 私信为 0，dm_conversion_rate 如实输出 0.0%，未做任何估算或补造。互动率严格限制为 (点赞 + 评论 + 转发) / 播放，未纳入私信。"
  },

  "redline_compliance": {
    "no_causal_analysis": true,
    "no_dm_estimation_when_zero": true,
    "calculation_basis_included": true,
    "interaction_rate_scope_correct": true
  }
}
```

## Judge

### Rubric Hits

- 正确计算率值指标
- 保留原始分子分母
- 私信为 0 时不得补造
- 只做指标转换，不做波动归因
- 输出结构化表格或 JSON

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
