# AI 选题素材搜集

- Case ID: `media-material-gather-001`
- Workflow: `WF-10`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `95`
- Pass: `true`
- Elapsed: `37860ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `media-account-strategy-001`

## Input

选题：企业实际落地 LLM 的坑。给定来源材料：1）访谈摘录：某制造企业试过知识库问答，最大问题是资料太乱、没人维护。2）文章摘录：LLM 项目常见成本来自数据清洗、权限设计、评测和运维。3）评论摘录：开发者担心客户只想要 demo，不愿意为后续维护付费。请提取结构化素材包。

## Rubric

1. 逐条提取事实并标注来源
2. 把资料混乱、维护、数据清洗、权限、评测、运维、demo 付费问题保留下来
3. 识别哪些 claim 只是访谈/评论观点
4. 输出证据缺口
5. 不扩展外部新闻或行业数据

## Node Output

```json
{
  "node_type": "weak-research-extractor",
  "profile": "gather/fetch",
  "workflow": "WF-10",
  "task": "AI 选题素材搜集 —— 企业实际落地 LLM 的坑",
  "extracted_facts": [
    {
      "fact": "某制造企业尝试了知识库问答，最大的问题是资料太乱。",
      "source": "访谈摘录",
      "source_status": "采访对象观点（非公开一手数据）"
    },
    {
      "fact": "某制造企业尝试了知识库问答，最大的问题是没人维护（知识库资料）。",
      "source": "访谈摘录",
      "source_status": "采访对象观点（非公开一手数据）"
    },
    {
      "fact": "LLM 项目的常见成本来自于数据清洗、权限设计、评测和运维。",
      "source": "文章摘录",
      "source_status": "文章观点/陈述"
    },
    {
      "fact": "有开发者担心客户只想要一个 demo，不愿意为后续维护付费。",
      "source": "评论摘录",
      "source_status": "个人评论观点"
    }
  ],
  "unknown_fields": [
    "该制造企业的具体名称、行业细分、知识库的具体规模",
    "“资料太乱”的详细表征（格式不一、标注缺失、隐私混入等）",
    "“成本”一词对应的具体金额量级或占总预算比例",
    "“权限设计”的具体粒度（文档级 / 属性级 / 角色级）",
    "开发者的身份背景或该评论对应的具体项目经验",
    "是否存在成功化解上述问题的案例或行业通用方案"
  ],
  "evidence_gaps": [
    "缺乏成本金额或百分比数据，无法支撑“常见成本”的普遍性判断",
    "“资料太乱、没人维护”的现象有多普遍无法判断，仅为一个样本",
    "三个来源互相独立，且均为非量化的经验或观点陈述，无交叉验证",
    "缺乏“开发者担心 Demo 陷阱”在真实项目中的发生率或影响数据"
  ],
  "inferences_and_risks": {
    "allowable_inferences": [
      "从文章摘录可推断：数据清洗、权限、评测、运维是当前业界在 LLM 落地中经常被提及的成本项",
      "从访谈摘录可推断：知识库数据质量是落地实操中的阻力点之一"
    ],
    "risks_and_notes": [
      "若将评论摘录中“客户只想要 Demo”直接表述为行业普遍事实，将触及红线（评论/访谈观点 ≠ 行业事实）",
      "若将访谈中单一制造企业的个案描述为通病，可能误导下游读者对问题规模的认知",
      "文章所列成本项（数据清洗、权限等）与用户端感知（答案不准）之间的因果关系未说明，下游若直接建立因果链需标注推理逻辑"
    ]
  },
  "red_lines_compliance": {
    "no_fabricated_cases": "passed —— 未补造任何企业名、客户名、产品名",
    "no_fabricated_numbers": "passed —— 未编造任何金额、成功率、员工数等数字",
    "opinion_not_fact": "passed —— 访谈/评论观点均已标注来源类型，未写成客观事实"
  },
  "handoff_summary": "给定 3 条非量化定性材料：访谈（制造企业知识库=资料乱+无人维护）、文章（LLM 成本=数据清洗/权限/评测/运维）、评论（开发者担心 Demo 陷阱/不愿为维护付费）。已逐条提取并标注来源类型，未做外部补充。下游节点使用时应保留来源标注，避免将个案或评论上升为行业定论。如需量化支撑，建议补充调研报告或白皮书。"
}
```

## Judge

### Rubric Hits

- 逐条提取事实并标注来源
- 把资料混乱、维护、数据清洗、权限、评测、运维、demo 付费问题保留下来
- 识别哪些 claim 只是访谈/评论观点
- 输出证据缺口
- 不扩展外部新闻或行业数据

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 拆分复合事实为多条独立条目提升下游引用精度
- 通过 source_status 明确区分采访观点、文章陈述、个人评论
- 将 allowable_inferences 与 risks 并列辅助下游安全使用

### Prompt Patch Suggestions

- 建议在提取事实时尽量保留原文措辞，以便下游溯源。
