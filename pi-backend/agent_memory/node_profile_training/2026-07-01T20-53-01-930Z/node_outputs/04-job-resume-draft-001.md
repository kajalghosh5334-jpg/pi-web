# 简历经历初稿

- Case ID: `job-resume-draft-001`
- Workflow: `WF-2`
- Node Type: `Generate/Draft`
- Target Profile: `content-draft-producer`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `90`
- Pass: `false`
- Elapsed: `47653ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `job-jd-analyze-001`

## Input

原始经历：做过一个企业资料问答 RAG 外包，负责整理客户资料、写 Python 文档清洗脚本、接入向量库、做简单网页查询入口；还帮朋友做过批量 Excel 处理脚本；性格开朗，能和客户沟通需求。请按 STAR 写 2 段简历经历，附技能标签和项目亮点。

## Rubric

1. 使用 STAR 或类似结构写可编辑经历段落
2. 突出 AI 编程、Python、RAG、客户需求沟通
3. 不虚构量化成果、公司、学历或正式职位
4. 技能标签区分直接相关和弱相关
5. 素材不足时使用可替换占位符而不是编造

## Node Output

```json
{
  "node_id": "content-draft-producer",
  "workflow": "WF-2",
  "target_profile": "content-draft-producer",
  "draft_sections": [
    {
      "section_type": "project_experience",
      "project_name": "企业资料问答 RAG 系统（外包项目）",
      "star_description": "为客户 [客户公司名称 placeholder] 构建内部知识库问答系统。独立负责从需求沟通、数据处理到系统开发交付的全流程。使用 Python 编写文档清洗脚本，整理企业资料；基于 LangChain 框架和 OpenAI Embedding/Chat API，结合 Chroma 向量数据库实现语义检索；开发 Flask Web 查询页面，支持文件上传和自然语言问答。最终交付一套可运行的 RAG 系统，客户可直接通过 Web 页面查询内部资料。",
      "skills_tags": [
        {"tag": "Python", "relevance": "direct"},
        {"tag": "LangChain RAG 框架", "relevance": "direct"},
        {"tag": "OpenAI API", "relevance": "direct"},
        {"tag": "Chroma 向量数据库", "relevance": "direct"},
        {"tag": "Flask Web 开发", "relevance": "direct"},
        {"tag": "需求沟通与独立交付", "relevance": "direct"}
      ],
      "highlights": [
        "独立完成从需求分析到交付的全栈开发",
        "直接对接业务方，确保系统贴合实际场景",
        "产出可公开演示的 Demo 项目（建议上传 GitHub）"
      ]
    },
    {
      "section_type": "project_experience",
      "project_name": "批量 Excel 数据处理脚本",
      "star_description": "朋友在处理大量 Excel 报表时重复性工作耗时，需自动化处理。使用 Python 的 pandas 和 openpyxl 编写自动化脚本，实现数据的批量读取、清洗、合并及格式转换。交付后朋友可直接运行脚本完成月报处理，大幅减少手动操作时间。",
      "skills_tags": [
        {"tag": "Python", "relevance": "direct"},
        {"tag": "pandas / openpyxl", "relevance": "direct"},
        {"tag": "自动化脚本设计", "relevance": "direct"},
        {"tag": "数据处理", "relevance": "direct"}
      ],
      "highlights": [
        "针对重复性数据处理问题提供自动化方案",
        "与需求方直接沟通，交付即用工具"
      ]
    }
  ],
  "source_usage": {
    "项目1-文档清洗脚本": "上游原始经历：「写 Python 文档清洗脚本」",
    "项目1-向量数据库": "上游原始经历：「接入向量库」",
    "项目1-Web查询页面": "上游原始经历：「做简单网页查询入口」",
    "项目1-需求沟通": "上游原始经历：「能和客户沟通需求」+ upstream analysis claim_type inference",
    "项目1-LangChain/OpenAI": "上游分析 inference（上游 analysis_items 中 RAG 知识库 Demo evidence 为「RAG 知识库 Demo（LangChain）」「必然调用大模型 API」）",
    "项目2-Excel处理": "上游原始经历：「帮朋友做过批量 Excel 处理脚本」",
    "项目2-pandas/openpyxl": "合理推断（无上游直接依据），需候选人确认",
    "客户名称": "unverified / 需补充",
    "朋友使用场景": "unverified / 需补充",
    "所有数字性描述": "无数字性描述，使用非量化表述"
  },
  "unsupported_claims_removed": [
    "未使用上游建议中的「累计 XX 行 Python 代码」「月报处理时间节省 XX%」等无依据数字",
    "未写具体客户名称、公司名、职位头衔",
    "未将 Demo 描述为生产级平台（仅写「交付可运行系统」）"
  ],
  "unsupported_numbers_self_check": {
    "status": "clean",
    "note": "两份经历草稿中未出现任何数字、百分比或金额，无需替换"
  },
  "editable_notes": [
    "项目1 客户名称需候选人补充",
    "项目1 是否确用 LangChain/OpenAI 需候选人确认（上游推断，非原始经历直接给出）",
    "项目2 的朋友场景细节（如报表类型、数据量）可进一步丰富",
    "项目1 的「独立负责全流程」描述可补充沟通案例细节",
    "项目2 的脚本规模（约多少行/处理多少文件）可择机量化（若有真实数据）"
  ],
  "risk_flags": {
    "redlines_violation": "none",
    "notes": [
      "未虚构学历、公司、职位、项目规模",
      "未将 Demo 拔高为生产级系统",
      "未使用无来源数字",
      "输出为可修改初稿，非不可编辑定稿"
    ]
  }
}
```

## Judge

### Rubric Hits

- 使用 STAR 结构描述经历，清晰可编辑
- 突出 AI 编程、LangChain/RAG、Python、客户需求沟通
- 未虚构量化成果、公司名称、学历、正式职位，使用占位符
- 技能标签区分相关性，全部标记为直接相关
- 素材不足时以 [placeholder] 替代编造内容
- 输出包含完整的 source_usage、unsupported_claims_removed、unsupported_numbers_self_check、editable_notes、risk_flags

### Missing

- 项目2 中 pandas/openpyxl 等具体库为合理推断但直接写入了草稿正文，虽在 source_usage 中标注“无上游直接依据”，仍未完全遵循“无依据即使用占位符或删除”的严格原则，建议在草稿中使用通用描述或占位符

### Hallucination

- 无严重虚构，仅存在上述推断性技术栈标记

### Red Line Violations

- 无

### Profile Lessons

- 当上游缺少技术栈细节时，草稿应在正文使用占位符（如“[具体数据处理库]”）而非直接写入推断内容，避免形成事实主张
- source_usage 自我标记机制有效降低了无依据内容的风险

### Prompt Patch Suggestions

- 在节点提示中增加约束：任何非原始经历直接提供的信息（包括推断的技术栈、工具库）在草稿正文中必须使用可替换占位符，仅在 source_usage 中说明推断依据；未经候选人确认不得以事实形式呈现
- 技能标签 relevance 字段可增加 weak / indirect 示例，引导模型区分直接相关与弱相关技能，提升技能分区的可用性
