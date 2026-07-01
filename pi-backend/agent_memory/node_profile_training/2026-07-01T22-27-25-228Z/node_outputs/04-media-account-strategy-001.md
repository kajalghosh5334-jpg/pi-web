# AI 自媒体账号定位

- Case ID: `media-account-strategy-001`
- Workflow: `WF-9`
- Node Type: `Strategize/Plan`
- Target Profile: `content-strategy-director`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `95`
- Pass: `true`
- Elapsed: `79336ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: none

## Input

账号方向：AI 自媒体，目标是吸引技术开发者和有 AI 落地需求的企业主，商业模式是项目撮合交易。请输出一句话定位、双端受众画像、内容矩阵和季度规划。

## Rubric

1. 一句话定位同时能让技术者和企业主理解
2. 区分技术者和企业主的不同内容动机
3. 内容矩阵包含干货、案例、需求拆解、转介信任建设
4. 商业链路是内容到信任到撮合
5. 不编造客户案例或成交数据

## Node Output

```json
{
  "decision_summary": "打造一个聚焦AI应用落地的产消两端桥梁型账号，以技术干货吸引开发者、以行业痛点解读吸引企业主，通过内容筛选双向意图，最终导向项目撮合交易。",
  "positioning_or_strategy": {
    "one_liner": "AI落地连接器：让技术有人用，让企业有方案。",
    "dual_audience_profile": {
      "developer": {
        "label": "AI开发者/技术极客",
        "interests": ["大模型微调与部署", "开源工具评测", "AI产品原型", "技术变现路径"],
        "pain_points": ["能力无法转化为付费项目", "不理解企业真实需求", "接私单渠道匮乏"],
        "content_motivation": "获取硬核技术干货、发现商业项目机会、展示个人技术品牌"
      },
      "business_owner": {
        "label": "中小企业主/有AI落地需求的业务负责人",
        "interests": ["AI降本增效实例", "行业应用场景", "落地成本与周期", "靠谱技术团队筛选"],
        "pain_points": ["听不懂技术术语", "找不到匹配的技术团队", "担心被技术方忽悠", "投入产出比不明"],
        "content_motivation": "看懂AI能解决什么具体问题、找到可信任的落地实施者"
      }
    },
    "content_matrix": [
      {
        "type": "硬核干货",
        "target": "developer",
        "description": "模型部署教程、开源项目代码拆解、工具效率对比。建立技术可信度。"
      },
      {
        "type": "行业案例拆解",
        "target": "business_owner",
        "description": "基于公开报道/论文提炼的AI落地场景（如零售库存预测、客服机器人），说明问题、方案逻辑、效果。严禁编造客户名与收益数据。"
      },
      {
        "type": "需求拆解/招标模拟",
        "target": "both",
        "description": "将收集到的匿名化企业需求（如“电商公司想要一个自动回复邮件系统”）拆解为技术要求、人力预算、交付物，展示匹配逻辑。需注明需求来源。"
      },
      {
        "type": "信任建设/转介设计",
        "target": "both",
        "description": "技术选型对比指南、AI落地避坑清单、开发者个人品牌访谈（若有）。设置钩子引导需求提交/能力登记。"
      }
    ],
    "quarterly_plan": {
      "overall_goal": "完成冷启动，验证双端内容模型与最小撮合闭环。",
      "month_1_2": [
        "发布≥12篇技术干货，侧重模型部署与工具实战，积累开发者首批关注。",
        "发布≥3篇行业需求洞察（引用公开报告），测试企业主侧内容互动率。",
        "建立内容发布SOP与素材复用流程，不追求日更，重质量。"
      ],
      "month_3": [
        "启动首次撮合实验：匿名发布1个真实企业需求（已获授权），引导开发者提交方案意向。",
        "开通需求收集通道（如私信关键词自动回复），沉淀第一批双边留资。",
        "根据前两月数据调整内容比例，砍掉无效类型。"
      ],
      "data_measurement": [
        "开发者图文均阅读量 / 企业主图文均阅读量",
        "技术文章收藏率 vs 行业解读收藏率",
        "需求帖子引发的方案提交数量",
        "社群/私信需求登记数"
      ]
    }
  },
  "constraints": {
    "factual_limits": [
      "当前无任何真实客户案例、成交记录或过往撮合数据，所有案例类内容必须使用公开可查信息并注明来源。",
      "冷启动期缺乏信任背书，无法依赖口碑推荐。",
      "双端精准获客成本高，需通过内容自然过滤，不适合初期投放泛流量。"
    ],
    "red_lines": [
      "严禁编造成交案例、客户名称、项目金额或收益数据。",
      "严禁只做泛AI热点号（如单纯搬运AI新闻）、必须坚持落地与匹配定位。",
      "内容矩阵必须同时服务于技术与商业两端，不得偏废。"
    ]
  },
  "opportunities": [
    "AI应用落地需求激增，供给侧（开发者）与需求侧（企业）之间存在严重信息不对称，中介价值明确。",
    "现有AI自媒体多为纯技术或纯商业，横跨两端的账号稀缺，定位差异化明显。",
    "平台算法可基于内容关键词精准触达“AI部署”“AI创业”等标签人群。",
    "撮合模式初期轻资产，无需自建平台，可依托现有社交工具完成最小闭环。"
  ],
  "execution_priorities": [
    {
      "priority": 1,
      "item": "构建技术干货内容库（至少10篇雏形），确立在开发者中的专业形象。"
    },
    {
      "priority": 2,
      "item": "产出面向企业主的行业痛点解读内容，测试需求端响应。"
    },
    {
      "priority": 3,
      "item": "搭建需求收集与能力登记的基础设施（关键词自动化回复+表单），形成双边管道。"
    },
    {
      "priority": 4,
      "item": "设计内容->信任->撮合的业务漏斗，并植入转化钩子。"
    },
    {
      "priority": 5,
      "item": "在Q1结束前完成至少一次匿名需求匹配实验，收集完整流程数据。"
    }
  ],
  "validation_metrics": [
    {
      "metric": "开发者侧关注数",
      "target": "达到可进行撮合实验的最低基数（具体数值视平台平均冷启数据定，暂设≥500）。",
      "measurement": "平台后台关注增长曲线。"
    },
    {
      "metric": "企业主侧留资数",
      "target": "收到至少5个有效企业需求（非垃圾信息）。",
      "measurement": "私信/表单提交量。"
    },
    {
      "metric": "撮合意向转化",
      "target": "首次需求帖子发出后，收到≥3份有效的开发者方案意向。",
      "measurement": "评论/私信方案提交数。"
    },
    {
      "metric": "内容互动差异化",
      "target": "技术文章收藏率≥x %，商业解读分享率≥y %（基准待测试后设定）。",
      "measurement": "平台分析后台。"
    }
  ],
  "handoff_to_next_nodes": {
    "content_brief": {
      "target_profiles": "详见 positioning_or_strategy.dual_audience_profile",
      "content_types_to_produce": "干货/行业拆解/需求模拟/信任建设，参考 positioning_or_strategy.content_matrix",
      "first_batch_instruction": "Q1前两月优先生产技术干货与行业洞察，详见 quarterly_plan",
      "tone_guideline": "对开发者：代码说话、直接、不装；对企业主：大白话、场景化、不炫技。"
    },
    "growth_instruction": {
      "acquisition_channels": "技术社区SEO（掘金、知乎技术区）、行业管理类公众号互推、视频号工厂/仓库实景类内容",
      "conversion_design": "内容中嵌入‘我可承接类似项目’（开发者）和‘有类似需求？聊一聊’（企业主）双路径CTA，初期全部引导至私域。"
    },
    "verification_assets_to_collect": [
      "技术文章收藏转发数据包",
      "企业需求留资表（脱敏）",
      "撮合实验双方反馈纪要"
    ]
  },
  "risk_flags": [
    "冷启动期双边任一端的不足可能导致撮合实验失败，需预设备选内容方向。",
    "若收集不到真实企业需求，整个撮合模式将停滞，需准备备用需求来源（如爬取公开招标信息仿写）但需注明虚构性质以免误导。"
  ]
}
```

**Skipped:** 未生成任何正文内容或具体案例细节，严格维持策略节点边界。  
**Add when:** 下游内容生产节点启动时，按 handoff_to_next_nodes 中的 brief 拆解为具体选题。

## Judge

### Rubric Hits

- 一句话定位同时能让技术者和企业主理解
- 区分技术者和企业主的不同内容动机
- 内容矩阵包含干货、案例、需求拆解、转介信任建设
- 商业链路是内容到信任到撮合
- 不编造客户案例或成交数据

### Missing

- 未明确覆盖项目报价/边界科普内容类型，可能影响企业主成本认知
- validation_metrics 中存在待定占位符（x%, y%），未给出可即刻验证的基准值

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 内容矩阵宜补入项目报价/边界科普，强化企业主决策信心
- 策略节点的验证指标应尽可能给出可量化的初始阈值，而非纯占位符

### Prompt Patch Suggestions

- 在 prompt 中明确要求包含项目报价/边界科普类内容
- 建议 validation_metrics 必须给出基于行业经验的合理初值，而非推迟设定
