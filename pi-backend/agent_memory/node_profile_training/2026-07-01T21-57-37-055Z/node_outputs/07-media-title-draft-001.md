# 标题封面 A/B 方案

- Case ID: `media-title-draft-001`
- Workflow: `WF-13`
- Node Type: `Generate/Draft`
- Target Profile: `content-draft-producer`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `76222ms`
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
  "node": "content-draft-producer",
  "profile": "Generate/Draft (Title & Cover A/B for WF-13)",
  "input_summary": "3 single-source facts (manufacturing KB mess, four cost categories, dev demo-worry)",
  "output": {
    "draft_sections": [
      {
        "variant_id": "TECH-01",
        "type": "title_cover_pair",
        "audience": "开发者 / 技术决策者",
        "click_motivation": "成本焦虑、经验预判",
        "headline": "LLM 项目成本不易算：数据清洗、权限设计、评测、运维，哪个最烧钱？",
        "cover_copy": "四个被作者列举的常见成本项，哪些是预见到也躲不开的坑？"
      },
      {
        "variant_id": "TECH-02",
        "type": "title_cover_pair",
        "audience": "开发者 / 项目交付团队",
        "click_motivation": "身份共鸣、观点验证",
        "headline": "客户只想看演示、不愿为后续付费？从一个开发者吐槽看交付难题。",
        "cover_copy": "一位开发者的担心。这是个体的声音，还是行业普遍困境？"
      },
      {
        "variant_id": "ENT-01",
        "type": "title_cover_pair",
        "audience": "企业信息化负责人 / CIO",
        "click_motivation": "案例警醒、决策参考",
        "headline": "制造企业试用知识库：资料太乱、没人维护，谁的问题？",
        "cover_copy": "单一企业案例，不具统计代表性，但提出的问题值得每个准备上知识库的企业自问。"
      },
      {
        "variant_id": "ENT-02",
        "type": "title_cover_pair",
        "audience": "高层管理者 / 预算决策者",
        "click_motivation": "预算审视、长期视角",
        "headline": "别只看演示效果：LLM 项目的「持续成本」谁在买单？",
        "cover_copy": "文章列出数据清洗、权限、评测、运维四类持续成本；开发者担心客户停下迭代。这是典型的供需错位？"
      },
      {
        "variant_id": "MIX-01",
        "type": "title_cover_pair",
        "audience": "行业观察者 / 双向参与者",
        "click_motivation": "全景视角、跳出单方叙事",
        "headline": "开发者在抱怨、企业在踩坑——LLM 落地的三条真实片段能拼出什么？",
        "cover_copy": "三份素材、三个视角。不包装成完整真相，只作为深入追问的起点。"
      }
    ],
    "source_usage": {
      "TECH-01": {
        "headline_basis": ["extracted_facts[1]: article_observation (cost categories)"],
        "fact_status": "single article observation, no data support"
      },
      "TECH-02": {
        "headline_basis": ["extracted_facts[2]: commenter_opinion (dev demo-worry)"],
        "fact_status": "single commenter opinion"
      },
      "ENT-01": {
        "headline_basis": ["extracted_facts[0]: reported_individual_experience (manufacturing)"],
        "fact_status": "single interview case (n=1)"
      },
      "ENT-02": {
        "headline_basis": ["extracted_facts[1]: cost categories", "extracted_facts[2]: payment concern"],
        "fact_status": "synthesis of two unlinked sources"
      },
      "MIX-01": {
        "headline_basis": ["extracted_facts[0]", "extracted_facts[1]", "extracted_facts[2]"],
        "fact_status": "triangulation of three independent pieces"
      }
    },
    "unsupported_claims_removed": [
      "所有标题不含任何上游未支持的百分比、金额、客户成功结果。",
      "TECH-01 使用了‘烧钱’一词，属非数字化的口语表达，未引入具体金额。",
      "TECH-02 标题明确以‘一位开发者’限定来源，未泛化为全体开发者。",
      "ENT-01 案例明确注明为单一制造企业案例。",
      "MIX-01 主动声明素材边界，避免虚假全面感。"
    ],
    "unsupported_numbers_self_check": {
      "status": "PASS — 无一例外",
      "details": [
        "所有文本中无百分比（70%、80%）、金额（万元、美金）、天数（30天）、倍数（翻倍）。",
        "所有数字均为列举类别数（四个成本项、三个视角、一条评论…），直接来源于上游 JSON 结构或明确限定，不存在无据数字。",
        "无任何将 Demo 表述为生产级成果的措辞。"
      ]
    },
    "editable_notes": [
      "通用：上游仅有 3 份素材（访谈摘录×1、文章摘录×1、评论摘录×1），所有标题均基于这些有限材料。人类编辑应结合更广泛的调研验证方向。",
      "TECH-01/TECH-02: 技术向标题偏内部分享，与破圈传播可能存在张力，请确认优先级。",
      "ENT-01: 案例唯一性可能让企业读者感到缺乏代表性。建议定稿时加入‘你的行业可能不同’等免责语境。",
      "MIX-01: 如果选题策略为‘深度特写’，这组标题最妥；若策略是‘痛点切入’，TECH-01 或 ENT-01 的钩子更强。建议下游复制进行 A/B 测试。"
    ],
    "risk_flags": [
      {
        "risk": "事实基础薄弱",
        "level": "high",
        "description": "所有输出依赖于三个孤立的小片段。正文必须充分披露来源局限，避免读者误认为普遍真理。",
        "action": "正文首段需明确提醒素材边界。"
      },
      {
        "risk": "红线上限合规",
        "level": "clean",
        "description": "逐条对照红线：①未编造客户成功案例或收益数字；②未输出标题党式绝对承诺；③未偏离撮合交易定位（内容旨在帮助双方理性决策）。全部通过。"
      },
      {
        "risk": "观点平衡风险",
        "level": "medium",
        "description": "TECH-02 和 ENT-02 均引用单方观点。若组合使用可能被认定立场偏颇。正文应加入平衡声明段落。"
      }
    ]
  },
  "blocked": false,
  "manual_review_required": false
}
```

→ 5组标题覆盖技术者向(2)、企业主向(2)、混合向(1)。所有数字已逐字段扫描清零，未新增任何上游无据数字/案例/结果。风险集中标注为事实基础薄弱，下游保留占位需补充定量调研后才能定稿。

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

- 所有输出主动声明素材局限性和来源状态，是一种良好的防幻觉实践
- unsupported_numbers_self_check 机制可普遍推广到 Generate 类节点

### Prompt Patch Suggestions

- 无
