# AI 选题素材搜集

- Case ID: `media-material-gather-001`
- Workflow: `WF-10`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `27405ms`
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
      "fact": "某制造企业曾尝试知识库问答项目，遇到的最大问题是资料混乱、缺乏专人持续维护。",
      "source": "访谈摘录（用户给定）",
      "source_status": "受访者直接陈述"
    },
    {
      "fact": "文章指出：LLM 项目常见成本来自数据清洗、权限设计、评测和运维。",
      "source": "文章摘录（用户给定）",
      "source_status": "文章关键段落摘录"
    },
    {
      "fact": "一位开发者评论中担心：客户只想要 Demo，不愿意为后续维护付费。",
      "source": "评论摘录（用户给定）",
      "source_status": "评论者个人观点"
    }
  ],
  "unknown_fields": [
    "具体企业名称、行业、规模",
    "知识库技术栈/平台",
    "资料数量、格式及混乱程度的具体描述",
    "数据清洗、权限设计等各项成本的实际金额或占比",
    "Demo 需求与维护付费意愿的市场数据或统计",
    "文章/评论的具体出处（标题、作者、日期）"
  ],
  "evidence_gaps": [
    "知识库场景只描述了问题现象，缺少项目细节（周期、团队、投入、失败指标）",
    "成本构成无定量数据，无法判断重头在哪项",
    "开发者评论仅为个人观点，无调研或案例支撑",
    "所有素材均为二手或匿名引用，无法交叉验证",
    "缺失任何可定位的来源文件、链接或原始数据"
  ],
  "handoff_summary": "从给定三份素材中提取出：1）制造企业知识库落地卡在资料维护；2）LLM 项目主要成本集中在数据清洗、权限、评测、运维；3）开发者担心客户只愿为 Demo 付费。所有陈述均标明来源且标注为观点/引述，未补充任何外部信息。证据缺口集中在具体数据、案例细节和可验证出处上，下游需决定是否补充调研或仅做定性分析。"
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

- 无

### Prompt Patch Suggestions

- 无
