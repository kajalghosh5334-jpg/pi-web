# AI 选题素材搜集

- Case ID: `media-material-gather-001`
- Workflow: `WF-10`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `49281ms`
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
  "node_type": "Gather/Fetch",
  "profile": "weak-research-extractor",
  "workflow": "WF-10",
  "task": "AI 选题素材搜集 - 企业实际落地 LLM 的坑",
  "output": {
    "extracted_facts": [
      {
        "id": "fact_001",
        "fact": "某制造企业在尝试 LLM 知识库问答项目时，遇到的最大问题是内部资料混乱，且没有专人负责维护。",
        "type": "访谈观点 / 单案例陈述",
        "source": "访谈摘录",
        "source_status": "基于访谈中的一方陈述，仅反映该企业情况，不具备行业普遍性"
      },
      {
        "id": "fact_002",
        "fact": "文章指出，LLM 项目的常见成本主要来自数据清洗、权限设计、评测以及后期运维。",
        "type": "文章断言",
        "source": "文章摘录",
        "source_status": "基于单篇文章的作者观点汇总，未提供具体成本占比或数据来源"
      },
      {
        "id": "fact_003",
        "fact": "有开发者评论表达担忧，认为客户往往只想要一个演示版（Demo），而不愿意为后续的系统持续维护付费。",
        "type": "评论观点",
        "source": "评论摘录",
        "source_status": "基于单一用户的评论，代表了部分从业者的主观担忧，非已验证的行业结论"
      }
    ],
    "unknown_fields": [
      {
        "issue_domain": "具体技术落地坑",
        "missing_detail": [
          "模型幻觉（Hallucination）的控制与检测",
          "上下文窗口限制与长文本处理",
          "Token 成本失控、响应延迟（Latency）",
          "数据隐私与安全合规（如数据泄露、RAG 权限绕过）"
        ]
      },
      {
        "issue_domain": "量化数据与成本结构",
        "missing_detail": [
          "各环节成本的具体占比（如数据清洗占总成本 30%）",
          "项目失败率或交付超支率",
          "部署后 ROI 的量化评估方法"
        ]
      },
      {
        "issue_domain": "多角色视角",
        "missing_detail": [
          "企业主/业务方视角的痛点（如如何验收成果、如何说服管理层、如何评估技术方能力）",
          "数据工程师视角的痛点（如数据质量评估、标注成本）"
        ]
      },
      {
        "issue_domain": "应对方案与最佳实践",
        "missing_detail": [
          "针对‘资料乱、没人维护’的解决路径（如自动化知识库清洗流程）",
          "针对‘成本集中在数据清洗/评测’的优化工具或方法",
          "针对‘Demo 陷阱’的商业模式建议（如分阶段交付、维护合同模板）"
        ]
      }
    ],
    "evidence_gaps": [
      {
        "gap": "第一个事实“资料乱/缺维护”仅来自单个制造企业访谈，缺乏其他行业（金融、医疗、零售）的交叉验证。",
        "suggestion": "补充搜索其他行业的 AI 落地复盘文章，或查找关于企业数据治理现状的行业调查问卷。"
      },
      {
        "gap": "第二个事实“成本集中在数据清洗等环节”缺乏数据支撑，无法判断其来源的权威性。",
        "suggestion": "查找 A16Z、Gartner、McKinsey 等机构关于 AI/LLM 项目成本构成的分析报告，或具体企业的 CTO 技术分享。"
      },
      {
        "gap": "第三个事实“Demo 陷阱”仅为一则开发者评论，不代表整个市场需求方的态度。",
        "suggestion": "搜索 Hacker News、Reddit、V2EX 等社区关于 AI 外包/项目交付的讨论，寻找更多同方向或相反方向的证据。"
      },
      {
        "gap": "整体素材缺乏定量数据（时间、预算、成功率）、技术细节（具体架构、模型版本）和完整的案例叙事。",
        "suggestion": "从技术博客（如 Shopify Engineering、Uber Blog）中寻找完整的 LLM 落地复盘文章作为对标素材。"
      }
    ],
    "handoff_summary": {
      "summary": "已完成给定三份素材（访谈、文章、评论）的显性事实提取。提炼出三个候选痛点假设：(1) 制造型企业数据基础差、缺维护；(2) LLM 项目成本集中在数据清洗/权限/评测/运维；(3) 开发者担忧客户只愿为 Demo 付费。",
      "reliability_assessment": "低可靠性。三个观点均为单方定性表述（一个访谈者、一个文章作者、一个评论者），未经多方验证，不具备行业共识地位。",
      "risks_and_flags": {
        "red_lines_breached": "无。未编造企业名称、金额数据或行业数字。",
        "manual_review_required": "是。强烈建议在内容创作前完成多源交叉验证，或明确标注‘本文观点基于特定访谈/评论，不代表全行业情况’。"
      },
      "recommendation_for_downstream": "请将上述三点作为‘待验证的选题线索’处理，切勿在内容中直接写为行业事实。若需用于‘需求拆解’或‘案例复盘’类内容，必须先补齐上述 evidence_gaps 中的缺失信息。"
    }
  }
}
```

## Judge

### Rubric Hits

- 逐条提取事实并标注来源
- 保留资料混乱、维护、数据清洗、权限、评测、运维、demo 付费问题
- 识别访谈/评论观点，与文章断言区分
- 输出证据缺口，指出缺少行业统计、真实成本数字、可公开客户案例
- 未扩展外部新闻或行业数据

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
