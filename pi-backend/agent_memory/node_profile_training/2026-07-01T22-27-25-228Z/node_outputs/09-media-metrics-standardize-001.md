# 自媒体指标标准化

- Case ID: `media-metrics-standardize-001`
- Workflow: `WF-17`
- Node Type: `Standardize`
- Target Profile: `weak-structured-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `95`
- Pass: `true`
- Elapsed: `32528ms`
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
  "node_type": "standardize",
  "profile": "weak-structured-operator",
  "workflow": "WF-17",
  "task": "自媒体指标标准化",
  "status": "completed",
  "upstream": "none",
  "details": {
    "normalized_items": [
      {
        "item_id": "视频 A",
        "raw_metrics": {
          "views": 12000,
          "likes": 360,
          "comments": 96,
          "shares": 48,
          "direct_messages": 12
        },
        "standard_rates": {
          "interaction_rate": {
            "formula": "(likes + comments + shares) / views",
            "numerator": 504,
            "denominator": 12000,
            "decimal": 0.042,
            "percent": "4.2%",
            "note": "分子不含私信"
          },
          "comment_rate": {
            "formula": "comments / views",
            "numerator": 96,
            "denominator": 12000,
            "decimal": 0.008,
            "percent": "0.8%"
          },
          "share_rate": {
            "formula": "shares / views",
            "numerator": 48,
            "denominator": 12000,
            "decimal": 0.004,
            "percent": "0.4%"
          },
          "dm_conversion_rate": {
            "formula": "direct_messages / views",
            "numerator": 12,
            "denominator": 12000,
            "decimal": 0.001,
            "percent": "0.1%"
          }
        },
        "source": "deterministic_precompute_reference"
      },
      {
        "item_id": "视频 B",
        "raw_metrics": {
          "views": 3000,
          "likes": 45,
          "comments": 9,
          "shares": 3,
          "direct_messages": 0
        },
        "standard_rates": {
          "interaction_rate": {
            "formula": "(likes + comments + shares) / views",
            "numerator": 57,
            "denominator": 3000,
            "decimal": 0.019,
            "percent": "1.9%",
            "note": "分子不含私信"
          },
          "comment_rate": {
            "formula": "comments / views",
            "numerator": 9,
            "denominator": 3000,
            "decimal": 0.003,
            "percent": "0.3%"
          },
          "share_rate": {
            "formula": "shares / views",
            "numerator": 3,
            "denominator": 3000,
            "decimal": 0.001,
            "percent": "0.1%"
          },
          "dm_conversion_rate": {
            "formula": "direct_messages / views",
            "numerator": 0,
            "denominator": 3000,
            "decimal": 0,
            "percent": "0%"
          }
        },
        "source": "deterministic_precompute_reference"
      }
    ],
    "field_mapping": {
      "播放": "views",
      "点赞": "likes",
      "评论": "comments",
      "转发": "shares",
      "私信": "direct_messages"
    },
    "missing_fields": [],
    "format_warnings": [
      {
        "type": "info",
        "item_id": "视频 B",
        "field": "direct_messages",
        "message": "原始值为 0，计算结果如实为 0%，未做任何估算。"
      }
    ],
    "handoff_summary": "标准化完成：2 个视频条目（视频 A、视频 B）的原始播放/点赞/评论/转发/私信数据已按确定性预计算参考转换为互动率、评论率、转发率、私信转化率。互动率严格按 (likes+comments+shares)/views 计算，不含私信。视频 B 私信为 0，结果如实反映。未补造缺失值，未做业务归因或策略建议。"
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

- 声称数据来源为 'deterministic_precompute_reference'，该信息未在输入或上游中提供，属于新增未支持信息

### Red Line Violations

- 无

### Profile Lessons

- 无

### Prompt Patch Suggestions

- 移除 output 中未经验证的来源字段，如 normalized_items 内的 source 及 handoff_summary 中的参考名称
