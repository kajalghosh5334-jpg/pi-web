# 自媒体指标标准化

- Case ID: `media-metrics-standardize-001`
- Workflow: `WF-17`
- Node Type: `Standardize`
- Target Profile: `weak-structured-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `13390ms`
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
  "normalized_items": [
    {
      "item_id": "视频 A",
      "source": "发布数据",
      "raw_fields": {
        "播放": 12000,
        "点赞": 360,
        "评论": 96,
        "转发": 48,
        "私信": 12
      },
      "standard_fields": {
        "views": 12000,
        "likes": 360,
        "comments": 96,
        "shares": 48,
        "direct_messages": 12
      },
      "derived_metrics": {
        "interaction_rate": {
          "label": "互动率",
          "formula": "(likes + comments + shares) / views",
          "numerator": 504,
          "denominator": 12000,
          "decimal": 0.042,
          "percent": "4.2%"
        },
        "comment_rate": {
          "label": "评论率",
          "formula": "comments / views",
          "numerator": 96,
          "denominator": 12000,
          "decimal": 0.008,
          "percent": "0.8%"
        },
        "share_rate": {
          "label": "转发率",
          "formula": "shares / views",
          "numerator": 48,
          "denominator": 12000,
          "decimal": 0.004,
          "percent": "0.4%"
        },
        "dm_conversion_rate": {
          "label": "私信转化率",
          "formula": "direct_messages / views",
          "numerator": 12,
          "denominator": 12000,
          "decimal": 0.001,
          "percent": "0.1%"
        }
      }
    },
    {
      "item_id": "视频 B",
      "source": "发布数据",
      "raw_fields": {
        "播放": 3000,
        "点赞": 45,
        "评论": 9,
        "转发": 3,
        "私信": 0
      },
      "standard_fields": {
        "views": 3000,
        "likes": 45,
        "comments": 9,
        "shares": 3,
        "direct_messages": 0
      },
      "derived_metrics": {
        "interaction_rate": {
          "label": "互动率",
          "formula": "(likes + comments + shares) / views",
          "numerator": 57,
          "denominator": 3000,
          "decimal": 0.019,
          "percent": "1.9%"
        },
        "comment_rate": {
          "label": "评论率",
          "formula": "comments / views",
          "numerator": 9,
          "denominator": 3000,
          "decimal": 0.003,
          "percent": "0.3%"
        },
        "share_rate": {
          "label": "转发率",
          "formula": "shares / views",
          "numerator": 3,
          "denominator": 3000,
          "decimal": 0.001,
          "percent": "0.1%"
        },
        "dm_conversion_rate": {
          "label": "私信转化率",
          "formula": "direct_messages / views",
          "numerator": 0,
          "denominator": 3000,
          "decimal": 0,
          "percent": "0%"
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
  "format_warnings": [
    "私信转化率公式中 direct_messages=0 为非缺失值，保持原值 0 未补造"
  ],
  "handoff_summary": "将 2 条视频播放数据的 5 个原始字段（播放、点赞、评论、转发、私信）标准化为 views/likes/comments/shares/direct_messages，并按指定比率公式计算出 4 个派生指标（互动率、评论率、转发率、私信转化率），分子分母及百分比均保留。私信为 0 的条目未做估计补造。无业务判断或归因分析。"
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
