# 标题封面 A/B 方案

- Case ID: `media-title-draft-001`
- Workflow: `WF-13`
- Node Type: `Generate/Draft`
- Target Profile: `content-draft-producer`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `89379ms`
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
  "node_id": "content-draft-producer",
  "workflow": "WF-13",
  "task": "标题封面 A/B 方案",
  "draft_sections": [
    {
      "variant_id": "B-01",
      "target_audience": "技术执行者 / AI 工程师",
      "title": "LLM 知识库遇上“数据沼泽”：一个制造业踩坑实例",
      "cover_copy": "内部资料没人管，项目第一步就卡住了。这不是别人家的故事，是来自制造业一线反馈的真实全貌。",
      "click_motive": "专业痛点共鸣，吸引工程师点击验证自身的踩坑体验",
      "source_usage": {
        "fact_ids": ["fact_1"],
        "notes": "事实来源于唯一来源访谈，标题中用“一个制造业踩坑实例”定位而不扩大范围"
      }
    },
    {
      "variant_id": "B-02",
      "target_audience": "技术执行者 / 交付方",
      "title": "Demo 验收后，企业客户为什么不愿意为维护迭代付费？",
      "cover_copy": "从“跑得通”到“用得稳”，中间的费用谁来认？一位开发者的真实担忧。",
      "click_motive": "行业共性困惑，交付方希望通过文章得到共情与行业现状认知",
      "source_usage": {
        "fact_ids": ["fact_3"],
        "notes": "事实来源于匿名网络评论，覆盖限定在“一位开发者的担忧”"
      }
    },
    {
      "variant_id": "B-03",
      "target_audience": "企业决策者 / 采购方",
      "title": "企业落地 LLM 的那张成本清单：数据、权限、评测、运维",
      "cover_copy": "四个你不得不提前了解的成本深坑——做预算前先看这篇。",
      "click_motive": "成本控制谨慎感，企业主希望在预算制定前了解真实风险",
      "source_usage": {
        "fact_ids": ["fact_2"],
        "notes": "四个环节来源行业文章分析，未提供具体数字金额"
      }
    },
    {
      "variant_id": "B-04",
      "target_audience": "混合受众 / 项目负责人",
      "title": "给准备上 LLM 项目的企业：开工前先想清楚这几点",
      "cover_copy": "数据治理有人做吗？预算够再调几次？心理准备做好了吗？",
      "click_motive": "决策自检，吸引混合受众在立项前进行软性论证",
      "source_usage": {
        "fact_ids": ["fact_1", "fact_2", "fact_3"],
        "notes": ""
      }
    },
    {
      "variant_id": "B-05",
      "target_audience": "混合受众 / 行业观察者",
      "title": "没有名字的踩坑案例：LLM 企业落地究竟有多现实？",
      "cover_copy": "虽然不能点名，但这个制造业的故事，大概率会在你或你客户的公司重演。",
      "click_motive": "好奇心和代入感，引导读者看是否存在共同问题",
      "source_usage": {
        "fact_ids": ["fact_1"],
        "notes": "单一样本案例，标题用“不能点名”做免责处理"
      }
    }
  ],
  "source_usage_overview": {
    "mapped_facts": {
      "fact_1": ["B-01", "B-04", "B-05"],
      "fact_2": ["B-03", "B-04"],
      "fact_3": ["B-02", "B-04"]
    },
    "gaps_handled": {
      "missing_quantitative_data": "所有标题/封面文案中无具体数字、百分比或金额",
      "missing_solutions": "标题和封面仅陈述问题状态，不做解决路径承诺",
      "single_source_dependency": "B-01、B-05 高度依赖单一匿名访谈，已在文案和备注中做降级定位"
    }
  },
  "unsupported_claims_removed": [],
  "unsupported_numbers_self_check": {
    "status": "PASS",
    "details": "标题和封面文案中未出现具体数字、百分比或金额。“第一个点”“几点”等数量词均为定性概括，不构成承诺性数字。未出现 30 天、翻倍、70%、80% 等。"
  },
  "editable_notes": [
    "B-01 / B-05 中的“制造业”暗示来源行业，若客户对脱敏要求极高可改为“某传统行业”。",
    "B-04 的“几点”为自由概括，若下游节点需增加结构性可从上游证据 gaps 中提取。",
    "所有标题均无“解决方案”或“避坑方法”导向，因为上游素材未提供任何可行解决路径。若最终内容需要完整姿态，需补充采访或技术社区帖。"
  ],
  "risk_flags": [
    {
      "type": "REPRESENTATIVENESS",
      "severity": "low",
      "detail": "B-01 和 B-05 依赖单一企业访谈（某制造企业），文案已限制范围（如“一个制造业踩坑实例”），但仍需下游编辑审校是否有过度渲染为行业通病的风险。",
      "suggestion": "下游编辑可明确将其标注为‘受访者反馈’，而非‘行业调查’。"
    },
    {
      "type": "MISSING_SOLUTION_ANGLE",
      "severity": "info",
      "detail": "所有标题和封面均为问题导向。若任务要求提供建设性内容，5 组文案均不适用，需重新生产。"
    }
  ],
  "red_line_check": {
    "status": "PASS",
    "details": "未补造客户名、具体成本、具体结果、比例数字、绝对承诺。所用素材均锚定上游提供的事实且标注了来源边界。未偏离撮合交易定位。"
  }
}
```

## Judge

### Rubric Hits

- 输出 5 组标题和封面文案
- 每组标注适用受众和点击动机
- 至少覆盖技术者向、企业主向、混合向
- 不新增上游没有支撑的案例、数字或结果
- 避免夸张承诺和标题党

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 用问题导向代替承诺数字，并严格基于上游事实限定范围（如“一位开发者的担忧”），可有效避免标题党和编造。
- 主动进行数字自检（unsupported_numbers_self_check）、标注来源使用（source_usage）并给出编辑笔记（editable_notes）和风险标识（risk_flags），是优秀的安全草稿生产范本。

### Prompt Patch Suggestions

- 无
