# AI 选题素材搜集

- Case ID: `media-material-gather-001`
- Workflow: `WF-10`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `31916ms`
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
  "extracted_facts": [
    {
      "fact": "某制造企业在试过知识库问答时遇到的最大问题是资料太乱、没人维护。",
      "source": "访谈摘录",
      "source_status": "单案例经验/观点，非行业通识"
    },
    {
      "fact": "LLM 项目常见成本来自数据清洗、权限设计、评测和运维。",
      "source": "文章摘录",
      "source_status": "作者论述，缺乏具体量级或案例支撑"
    },
    {
      "fact": "开发者担心客户只想要 demo，不愿意为后续维护付费。",
      "source": "评论摘录",
      "source_status": "开发者个人观点/担忧"
    }
  ],
  "unknown_fields": [
    "具体项目规模、技术栈或团队配置",
    "模型选型（开源 vs 闭源 API）带来的特定坑",
    "企业主/客户侧对成本构成、维护付费的真实看法（仅持有开发者观点）",
    "法律法规与合规性问题",
    "各项成本（数据清洗、权限等）的具体金额或比例",
    "制造业案例的后续解决方式或最终结果"
  ],
  "evidence_gaps": [
    {
      "缺口描述": "“客户不愿为维护付费”的观点仅来自开发者担忧，缺乏企业主视角验证。",
      "补源建议": "获取甲方项目经理或决策者对项目交付与运维付费的访谈/问卷数据。"
    },
    {
      "缺口描述": "文章提及的成本项（数据清洗、权限设计等）缺乏量级、占比和具体构成。",
      "补源建议": "查找具备成本结构拆解的行业报告、供应商白皮书或甲方复盘长文。"
    },
    {
      "缺口描述": "制造业案例仅有痛点描述，缺少项目背景、供应商选择及后续进展。",
      "补源建议": "搜索制造企业 LLM 知识库落地的完整复盘（含数据准备范围、项目周期、验收标准）。"
    },
    {
      "缺口描述": "全部素材为访谈/文章/评论等间接来源，无一手项目复盘。",
      "补源建议": "寻找参与过完整 LLM 落地项目（开发+交付）的工程师或 PM 的复盘分享（播客/技术大会PPT/博客）。"
    }
  ],
  "handoff_summary": "从给定来源提取三个角度 LLM 落地坑：1）制造业知识库基础资料混乱与维护缺失（访谈）；2）显性工程成本项：数据清洗、权限设计、评测与运维（文章）；3）隐性商业模式信任风险：开发者担忧客户只愿为 demo 付费、不愿为维护付费（评论）。所有条目已标注来源类型与状态。证据缺口在于缺少企业主视角、具体成本量级及完整项目复盘。"
}
```

## Judge

### Rubric Hits

- 逐条提取事实并标注来源
- 保留资料混乱、维护、数据清洗、权限、评测、运维、demo付费问题
- 识别访谈/评论观点并标注source_status
- 输出证据缺口并给出补源建议
- 未扩展外部新闻或行业数据

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 该节点能够严格区分事实与观点，逐一标注来源类型和观点属性，符合Gather/Fetch节点的契约要求。
- evidence_gaps和unknown_fields覆盖全面，且未自行补造数字或案例。

### Prompt Patch Suggestions

- 无
