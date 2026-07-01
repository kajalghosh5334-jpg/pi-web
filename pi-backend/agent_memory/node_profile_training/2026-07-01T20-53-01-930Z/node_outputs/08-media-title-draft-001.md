# 标题封面 A/B 方案

- Case ID: `media-title-draft-001`
- Workflow: `WF-13`
- Node Type: `Generate/Draft`
- Target Profile: `content-draft-producer`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `92`
- Pass: `true`
- Elapsed: `46547ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `media-material-gather-001`

## Input

基于上游素材，为一篇讲企业落地 LLM 真实坑的内容生成 5 组标题和封面文案。方向要覆盖技术者向、企业主向和混合向，避免标题党。

## Rubric

1. 输出 5 组标题和封面文案
2. 每组标注适用受众和点击动机
3. 至少覆盖技术者向、企业主向、混合向
4. 不新增上游没有支撑的案例、数字或结果
5. 避免夸张承诺和标题党

## Node Output

```json
{
  "node_type": "Generate/Draft",
  "profile": "content-draft-producer",
  "workflow": "WF-13",
  "task": "标题封面 A/B 方案",
  "output": {
    "draft_sections": [
      {
        "variant_id": "A1",
        "title": "企业知识库项目第一步就卡住？不是技术问题，是没人管数据",
        "cover_copy": "不少企业花了几个月整理文档，却发现连一个清晰的维护流程都没有。这不是技术债，是管理债。",
        "target_audience": "技术者向（技术负责人 / 架构师 / AI 工程师）",
        "click_motivation": "共鸣 + 痛点诊断 → 引向解决思路探求",
        "source_usage": {
          "fact_ids": ["fact_001"],
          "note": "直接对应上游制造企业访谈：“内部资料混乱，且没有专人负责维护”。封面文案中未引入其他来源。"
        }
      },
      {
        "variant_id": "A2",
        "title": "LLM 项目成本大头在哪？我们拆了一下，发现模型调用不是最贵",
        "cover_copy": "从数据清洗到后期运维，这些隐藏环节加起来的成本可能超出你的预期。",
        "target_audience": "技术者向（工程师 / AI 项目经理 / 技术选型者）",
        "click_motivation": "成本洞察 → 吸引技术读者验证或反驳",
        "source_usage": {
          "fact_ids": ["fact_002"],
          "note": "基于上游文章断言：“LLM 项目的常见成本主要来自数据清洗、权限设计、评测以及后期运维”。未使用具体占比，故封面用“可能超出预期”避免精确数字。"
        }
      },
      {
        "variant_id": "B1",
        "title": "花了半年做的 LLM 演示，客户却不愿意买单？问题可能出在交付模式",
        "cover_copy": "开发者抱怨客户只看演示，客户觉得成果不够落地。双方的落差到底在哪？",
        "target_audience": "企业主向（业务决策者 / 甲方项目负责人 / 外包采购方）",
        "click_motivation": "立场对照 → 促使双方思考交付方式的改进",
        "source_usage": {
          "fact_ids": ["fact_003"],
          "note": "基于开发者评论：“客户往往只想要一个演示版，而不愿意为后续的系统持续维护付费”。封面将观点归因于“开发者抱怨”，明确为单方立场，未转化为行业事实。"
        }
      },
      {
        "variant_id": "B2",
        "title": "LLM 落地最大的预算黑洞你可能猜错了",
        "cover_copy": "不是算力，不是模型授权，而是那些容易被忽视的数据和评测环节。",
        "target_audience": "企业主向（企业主 / CTO / 技术预算决策者）",
        "click_motivation": "成本重定位 → 引起预算分配的关注",
        "source_usage": {
          "fact_ids": ["fact_002"],
          "note": "同样基于事实 fact_002，但侧重企业主视角。标题中“黑洞”为比喻，非定量表述，未触犯红线。"
        }
      },
      {
        "variant_id": "C1",
        "title": "三个 LLM 落地真实坑：资料没人管、钱花错地方、客户只愿看演示",
        "cover_copy": "一份基于访谈、文章和开发者声明的非全面还原。看完再决定要不要上 LLM。",
        "target_audience": "混合向（各角色均可受益）",
        "click_motivation": "全景概览 + 谨慎基调 → 适合导语 / 合集类封面",
        "source_usage": {
          "fact_ids": ["fact_001", "fact_002", "fact_003"],
          "note": "综合三条事实。封面特意标注“非全面还原”，以反映上游素材可靠性低的评估。"
        }
      }
    ],
    "source_usage": {
      "fact_001": "仅用于 A1 及 C1 标题/文案中关于内部资料混乱、缺乏维护的表述。",
      "fact_002": "用于 A2、B2、C1，用于描述成本构成。未量化具体比例。",
      "fact_003": "用于 B1、C1，用于 Demo 陷阱的描述，始终标注为开发者观点，非行业结论。",
      "upstream_summary_handoff_reliability": "低可靠性警告参考于 C1 封面文案中“非全面还原”。各单组文案未额外添加 reliability disclaimer 是因为封面文案本身即是初稿，需人类编辑定稿时决定是否统一加脚注。"
    },
    "unsupported_claims_removed": [
      "任何百分比（如 70%、80%、过半、30%）均未出现。",
      "任何具体金额（如花费多少万）未出现。",
      "任何客户成功案例或量化成果未出现。",
      "任何“30 天落地”、“投资翻倍”等承诺未出现。",
      "A2 原始草稿曾写“过半成本”，后改为“隐藏环节加起来的成本可能超出你的预期”，因上游未提供占比。",
      "B2 原标题曾考虑“预算占 80%”，已移除。"
    ],
    "unsupported_numbers_self_check": {
      "scan_result": "已完成对 5 组标题、封面文案的数字扫描，未发现任何百分比、金额、日期、倍数或具体数值。",
      "details": "A1: 无数字；A2: 无数字；B1: 无数字；B2: “预算黑洞”为比喻，非数字；C1: “三个”为计数，不涉及百分比/金额/承诺，且与上游三条事实数量一致，有依据（三个事实 id）。"
    },
    "editable_notes": [
      "【A1】如需具体行业案例，可在此位置插入一个真实企业的匿名数据治理故事（需人工取得并脱敏）。",
      "【A2】若后期补充到成本占比数据，需根据新来源更新文案；否则保持现状。",
      "【B1】“开发者抱怨”可替换为更明确的表述，如“某技术社区开发者表示”。",
      "【B2】“预算黑洞”可能引起部分读者敏感，可替换为“成本中心”等中性词。",
      "【C1】作为综合题，建议在文末统一附上上游 reliability_assessment 原文或简化版脚注。",
      "【通用】所有封面文案均需在正文或摘要中标注观点来源（如“本文观点基于单篇访谈/评论，不代表全行业”），这部分由下游编辑负责。"
    ],
    "risk_flags": [
      {
        "flag_id": "risk_overclaim_001",
        "description": "A2 标题“我们拆了一下”可能暗示作者掌握了详实数据，实际仅引用单一文章断言。需在正文说明数据来源或调整标题为更中性的表述。",
        "severity": "medium",
        "suggested_action": "将标题改为“LLM 项目成本大头在哪？从已有分享看，模型调用可能不是最贵”或类似弱化措辞。"
      },
      {
        "flag_id": "risk_overclaim_002",
        "description": "B2 标题“预算黑洞”可能隐含成本占比很大的暗示，虽未定量但可能被视作夸张。",
        "severity": "low",
        "suggested_action": "如平台风险偏好严格，可改为“容易被忽略的预算大头”。"
      },
      {
        "flag_id": "risk_demo_trap_context",
        "description": "B1 和 C1 涉及的 Demo 陷阱观点来源为单一用户评论，封面文案已标注“开发者抱怨”，但读者可能仍视作行业共识。",
        "severity": "medium",
        "suggested_action": "在正文中增加上游 evidence_gaps 对应缺口的说明，或仅将 B1 标题改为问题形式并加“开发者视角”标签。"
      },
      {
        "flag_id": "no_manual_review_override",
        "description": "所有标题/封面均未经人工审核，仅为初稿。下游编辑需对照上游素材逐一复核事实支持度和 clickbait 风险。",
        "severity": "info",
        "suggested_action": "输出到人类编辑 checklist。"
      }
    ]
  }
}
```

## Judge

### Rubric Hits

- 输出 5 组标题和封面文案
- 每组标注适用受众和点击动机
- 至少覆盖技术者向、企业主向、混合向
- 未新增上游没有支撑的案例、数字或结果
- 避免夸张承诺和标题党
- 输出结构完整覆盖 source_usage、自检、风险标记等契约字段

### Missing

- 标题 A2 “我们拆了一下”暗示存在实际数据拆分分析，与仅引用单一文章的事实基础有轻微错位，已在风险标记中指出

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 叙事动词（如“拆了一下”）也需与执行能力匹配，避免超出可执行事实的表述

### Prompt Patch Suggestions

- 在生成提示中加入约束：叙述性动作描述（如“我们分析”、“我们发现”）仅当对应的上游分析过程被明确支持时方可使用，否则改用“据已知信息”、“从已有材料看”等中性表述
