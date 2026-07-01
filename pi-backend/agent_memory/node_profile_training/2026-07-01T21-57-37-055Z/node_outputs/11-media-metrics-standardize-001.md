# 自媒体指标标准化

- Case ID: `media-metrics-standardize-001`
- Workflow: `WF-17`
- Node Type: `Standardize`
- Target Profile: `weak-structured-operator`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `70`
- Pass: `false`
- Elapsed: `30997ms`
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
      "video_id": "视频A",
      "raw_metrics": {
        "播放": 12000,
        "点赞": 360,
        "评论": 96,
        "转发": 48,
        "私信": 12
      },
      "computed_rates": {
        "互动率": {
          "value": "4.30%",
          "formula": "(点赞+评论+转发+私信)/播放"
        },
        "评论率": {
          "value": "0.80%",
          "formula": "评论/播放"
        },
        "转发率": {
          "value": "0.40%",
          "formula": "转发/播放"
        },
        "私信转化率": {
          "value": "0.10%",
          "formula": "私信/播放"
        }
      }
    },
    {
      "video_id": "视频B",
      "raw_metrics": {
        "播放": 3000,
        "点赞": 45,
        "评论": 9,
        "转发": 3,
        "私信": 0
      },
      "computed_rates": {
        "互动率": {
          "value": "1.90%",
          "formula": "(点赞+评论+转发+私信)/播放"
        },
        "评论率": {
          "value": "0.30%",
          "formula": "评论/播放"
        },
        "转发率": {
          "value": "0.10%",
          "formula": "转发/播放"
        },
        "私信转化率": {
          "value": "0.00%",
          "formula": "私信/播放"
        }
      }
    }
  ],
  "field_mapping": {
    "播放": "play_count",
    "点赞": "like_count",
    "评论": "comment_count",
    "转发": "share_count",
    "私信": "dm_count",
    "互动率": "engagement_rate",
    "评论率": "comment_rate",
    "转发率": "share_rate",
    "私信转化率": "dm_conversion_rate"
  },
  "missing_fields": [],
  "format_warnings": [],
  "handoff_summary": "标准化完成：两个视频的原始播放/互动字段已提取并映射为标准字段，基于播放量计算互动率、评论率、转发率、私信转化率。视频B私信为0，私信转化率保持0，未补造。计算依据附在每条computed_rates中。无缺失字段。"
}
```

## Judge

### Rubric Hits

- 保留原始分子分母
- 私信为 0 时不得补造
- 只做指标转换，不做波动归因
- 输出结构化表格或 JSON

### Missing

- 正确计算率值指标：互动率公式错误，包含了私信，导致视频A互动率输出为4.30%，不符合标准答案的4.2%

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 互动率公式应严格遵循 calculationRules，不包括私信。计算前须核对公式定义。

### Prompt Patch Suggestions

- 在提示中强调互动率计算仅包括点赞、评论、转发，不含私信，以避免公式混淆。
