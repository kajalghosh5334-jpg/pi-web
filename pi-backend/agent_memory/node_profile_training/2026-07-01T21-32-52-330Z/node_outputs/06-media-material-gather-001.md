# AI 选题素材搜集

- Case ID: `media-material-gather-001`
- Workflow: `WF-10`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `39909ms`
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
  "node_id": "weak-research-extractor",
  "workflow": "WF-10",
  "task": "AI选题素材搜集_LLM落地坑",
  "upstream_context": "基于上游策略，本素材将服务于P1内容基座中的'行业痛点'类选题，需严格限定为事实搬运，不做判断分析。",
  "extracted_facts": [
    {
      "fact": "某制造企业尝试知识库问答项目，遇到的最大问题是内部资料混乱、且无人负责维护。",
      "source": "访谈摘录（某制造企业）",
      "source_status": "匿名访谈，单一来源个体经验",
      "fact_type": "受访者观点",
      "claim_level": "个体经验/单一样本观察"
    },
    {
      "fact": "LLM项目的常见成本与风险主要来自：数据清洗、权限设计、评测和运维四个环节。",
      "source": "文章摘录",
      "source_status": "行业文章分析，未附具体定量数据或研究样本量",
      "fact_type": "作者分析/行文观点",
      "claim_level": "作者基于行业观察的归纳"
    },
    {
      "fact": "部分开发者担忧企业客户只想要一个Demo验证效果，而不愿意为后续的持续维护和迭代付费。",
      "source": "评论摘录（开发者）",
      "source_status": "匿名网络评论，单方面观点",
      "fact_type": "评论者担忧/经验之谈",
      "claim_level": "开发者个人视角或从业经验"
    }
  ],
  "unknown_fields": [
    "具体企业名称（所有来源均为匿名）—— missing",
    "具体成本金额或各环节耗时占比—— missing",
    "涉及的模型名称、框架或工具—— missing",
    "数据量级或项目规模—— missing",
    "成功案例、正向数据或补救方案—— missing",
    "权限设计的具体难点类型—— missing",
    "评测方法和运维团队配置—— missing"
  ],
  "evidence_gaps": [
    {
      "gap": "单一企业样本：访谈仅覆盖一家匿名制造企业，无法代表全行业或做严谨归因。",
      "suggestion": "补充3-5家不同行业的匿名访谈，或引用公开行业报告（如Gartner、CSDN调研）。"
    },
    {
      "gap": "成本论述无定量支撑：文章指出的四个成本来源缺少具体比例或金额数据。",
      "suggestion": "寻找包含LLM项目预算拆解的公开研究或工具厂商白皮书。"
    },
    {
      "gap": "开发者担忧缺乏普遍性验证：评论观点的样本大小和代表性不可知。",
      "suggestion": "设计面向AI开发者的问卷，统计‘非标维护费’的接受度与谈判成功率。"
    },
    {
      "gap": "缺少“解决路径”信息：所有来源只谈问题（坑），未涉及任何可行的避坑措施或行业最佳实践。",
      "suggestion": "补充一篇技术社区的避坑经验汇总帖，或采访有交付经验的开发者。"
    }
  ],
  "handoff_summary": "本节点从三份给定来源中搬运了三条关于 LLM 落地困难的显性事实。所有内容均为单方观点（访谈/文章/评论），缺乏多来源交叉验证和定量数据。下游节点若用于内容生产，建议：1）明确标注信息来源的局限性（“受访者反馈”、“行业观察”等）；2）不宜将单一制造企业的经验上升为“行业通病”；3）该素材足够支撑一篇“心态/流程避坑”类软文，但不足以独立支撑成本分析或行业报告类内容。",
  "red_line_check": {
    "status": "PASS",
    "details": "未补造任何企业案例、成本金额、成功数据。所有观点已严格按来源立场进行标注（访谈观点 / 文章观点 / 评论观点），未升格为行业事实。"
  },
  "blocked_items": []
}
```

## Judge

### Rubric Hits

- 逐条提取事实并标注来源
- 保留资料混乱、维护、数据清洗、权限、评测、运维、demo付费问题
- 识别哪些claim只是访谈/评论观点并标注claim_level
- 输出evidence_gaps涵盖缺失的统计、成本数字、客户案例
- 未扩展外部新闻或行业数据

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 已严格区分观点类型与信息来源，证据缺口总结精准，可直接复用为Gather节点标杆样本

### Prompt Patch Suggestions

- 无
