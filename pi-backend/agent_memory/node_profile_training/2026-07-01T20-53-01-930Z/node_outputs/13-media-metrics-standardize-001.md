# 自媒体指标标准化

- Case ID: `media-metrics-standardize-001`
- Workflow: `WF-17`
- Node Type: `Standardize`
- Target Profile: `weak-structured-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `40`
- Pass: `false`
- Elapsed: `21055ms`
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
      "id": "video_A",
      "raw_data": {
        "plays": 12000,
        "likes": 360,
        "comments": 96,
        "shares": 48,
        "direct_messages": 12
      },
      "computed_metrics": {
        "interaction_rate": {
          "value": 0.043,
          "formula": "(likes + comments + shares + direct_messages) / plays = (360 + 96 + 48 + 12) / 12000 = 516 / 12000 = 0.043",
          "percentage": "4.30%"
        },
        "comment_rate": {
          "value": 0.008,
          "formula": "comments / plays = 96 / 12000 = 0.008",
          "percentage": "0.80%"
        },
        "share_rate": {
          "value": 0.004,
          "formula": "shares / plays = 48 / 12000 = 0.004",
          "percentage": "0.40%"
        },
        "dm_conversion_rate": {
          "value": 0.001,
          "formula": "direct_messages / plays = 12 / 12000 = 0.001",
          "percentage": "0.10%"
        }
      }
    },
    {
      "id": "video_B",
      "raw_data": {
        "plays": 3000,
        "likes": 45,
        "comments": 9,
        "shares": 3,
        "direct_messages": 0
      },
      "computed_metrics": {
        "interaction_rate": {
          "value": 0.019,
          "formula": "(likes + comments + shares + direct_messages) / plays = (45 + 9 + 3 + 0) / 3000 = 57 / 3000 = 0.019",
          "percentage": "1.90%"
        },
        "comment_rate": {
          "value": 0.003,
          "formula": "comments / plays = 9 / 3000 = 0.003",
          "percentage": "0.30%"
        },
        "share_rate": {
          "value": 0.001,
          "formula": "shares / plays = 3 / 3000 = 0.001",
          "percentage": "0.10%"
        },
        "dm_conversion_rate": {
          "value": 0.0,
          "formula": "direct_messages / plays = 0 / 3000 = 0.0",
          "percentage": "0.00%"
        }
      }
    }
  ],
  "field_mapping": {
    "播放": "plays",
    "点赞": "likes",
    "评论": "comments",
    "转发": "shares",
    "私信": "direct_messages"
  },
  "missing_fields": [],
  "format_warnings": [
    "原始输入为自然语言描述，已手动解析为结构化数据，数值无误。"
  ],
  "handoff_summary": "已将两段视频的原始播放、互动数据标准化并计算出互动率、评论率、转发率、私信转化率（均基于播放量）。下游可直接使用 normalized_items 中的 computed_metrics。",
  "boundary_flags": {
    "cause_analysis": false,
    "estimated_zero_dm": false,
    "calculation_basis_omitted": false
  }
}
```

## Judge

### Rubric Hits

- 保留原始分子分母
- 私信为 0 时不得补造
- 只做指标转换，不做波动归因
- 输出结构化表格或 JSON

### Missing

- 正确计算率值指标

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 互动率计算公式应严格按标准答案定义为 (likes+comments+shares)/plays，不应包含私信

### Prompt Patch Suggestions

- 在system prompt中明确定义各率值指标的计算公式，特别是互动率的分子应排除私信
