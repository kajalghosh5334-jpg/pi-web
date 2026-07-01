# JD 匹配分析

- Case ID: `job-jd-analyze-001`
- Workflow: `WF-4`
- Node Type: `Analyze/Judge`
- Target Profile: `research-report-analyst`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `92`
- Pass: `true`
- Elapsed: `40547ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `job-background-strategy-001`, `job-company-gather-001`

## Input

候选人简历要点：高中学历；做过 Python 自动化脚本、RAG 知识库 demo、一个小型企业资料问答外包；会 Flask 基础，不熟 Django；Docker 只部署过一次。JD：Python 基础扎实，熟悉接口调用，了解 OpenCV 加分，大专及以上优先，有项目 demo 加分，能和业务方沟通需求。请输出命中项、缺漏项、弱化项、学历屏障和简历定制策略。

## Rubric

1. 逐条对照 JD 输出命中、缺漏、弱化
2. 明确学历是优先项而非硬卡
3. 把 RAG/脚本/外包项目映射到岗位需求
4. 对不熟 Django、Docker 经验弱等问题给可补策略
5. 区分事实、推断、建议和置信度

## Node Output

```json
{
  "node_type": "Analyze/Judge",
  "profile": "research-report-analyst",
  "workflow": "WF-4",
  "task": "JD 匹配分析",
  "analysis_items": [
    {
      "jd_requirement": "Python 基础扎实",
      "claim_type": "inference",
      "evidence": "候选人完成过 Python 自动化脚本、RAG 知识库 demo、小型企业资料问答外包项目，且会 Flask 基础，说明有实际 Python 编写经验。",
      "confidence": "medium",
      "counter_evidence": "未提及数据结构/算法等基础概念掌握程度，项目规模、代码质量未知。",
      "recommendation": "在简历中列出具体 Python 库 (requests, flask, langchain 等) 和项目细节，展示基础扎实程度。"
    },
    {
      "jd_requirement": "熟悉接口调用",
      "claim_type": "inference",
      "evidence": "RAG 知识库 demo 和小型企业问答外包很可能涉及调用 LLM API 或外部数据接口，但未明确说明。",
      "confidence": "medium",
      "counter_evidence": "未直接提及 API 调用经验，也无代码仓库可验证。",
      "recommendation": "在简历中明确描述如何调用 API（如 OpenAI、本地模型接口），并补充接口文档阅读能力。"
    },
    {
      "jd_requirement": "了解 OpenCV 加分",
      "claim_type": "fact",
      "evidence": "候选人简历中未提到任何 OpenCV 经验。",
      "confidence": "high",
      "counter_evidence": "可能学习过但未写在简历中。",
      "recommendation": "如时间允许，完成一个小型 OpenCV 入门项目（如边缘检测/文字识别 demo）；否则在简历中注明「愿意快速学习并已开始了解」。"
    },
    {
      "jd_requirement": "大专及以上优先",
      "claim_type": "fact",
      "evidence": "JD 明确写「大专及以上优先」，上游公司信息节点确认非硬性门槛。候选人学历为高中，不满足优先项。",
      "confidence": "high",
      "counter_evidence": "无。",
      "recommendation": "不要隐藏学历，在简历中将项目经验和作品集置于教育背景之前，用实战能力弥补。"
    },
    {
      "jd_requirement": "有项目 demo 加分",
      "claim_type": "fact",
      "evidence": "候选人有 RAG 知识库 demo 和企业资料问答外包项目，可直接作为 demo 展示。",
      "confidence": "high",
      "counter_evidence": "demo 是否可公开查看/运行未知，需要确认版权与可展示权限。",
      "recommendation": "将 demo 整理为 GitHub 仓库（README、截图、运行说明）或部署到 Hugging Face Space，在简历中附上链接。"
    },
    {
      "jd_requirement": "能和业务方沟通需求",
      "claim_type": "inference",
      "evidence": "候选人有外包项目经验，性格开朗（上游推断），推测具备与业务方沟通的基本能力。",
      "confidence": "medium",
      "counter_evidence": "无具体客户评价或沟通场景描述，面试验证后方可确认。",
      "recommendation": "在简历中用 STAR 法则描述一个与客户沟通需求并完成交付的案例，突出理解和转化能力。"
    }
  ],
  "mapped_hits": [
    "Python 基础：有实际项目（自动化脚本、RAG demo、Flask 应用）",
    "接口调用：项目涉及 API 调用的可能性高",
    "项目 demo：已有多个可展示项目",
    "沟通能力：外包经历暗示具备基本沟通能力"
  ],
  "mapped_misses": [
    "OpenCV：无任何经验",
    "学历：高中，不满足优先条件"
  ],
  "mapped_weaknesses": [
    "Django：不熟悉（JD 未要求，但可能涉及内部框架）",
    "Docker：仅部署一次，经验薄弱（JD 未要求，但可能用于部署）",
    "项目细节：未提供代码仓库、客户评价等可验证材料"
  ],
  "education_barrier": {
    "type": "soft_preference",
    "description": "JD 写「大专及以上优先」，上游证实为非硬性门槛。高中不满足优先项，但不构成硬性拒绝条件。",
    "strategy": "项目优先展示，教育放末尾；面试中主动将话题引向技术能力和交付成果。"
  },
  "resume_customization_strategy": [
    "1. 项目经验优先：将 RAG demo、企业问答外包、自动化脚本按相关性排序放在教育之前，每个项目包含：目标、技术栈、个人职责、成果，附 GitHub 链接或 Demo URL。",
    "2. 接口调用突出：在项目描述中写明调用了哪些 API（如 GPT-4、文心一言、Elasticsearch 接口），强调「能独立阅读接口文档并实现调用」。",
    "3. 沟通能力举例：选择一个外包项目写一段「客户需求→方案沟通→交付验收」的简短案例，体现业务理解与沟通。",
    "4. 弱项处理：开视频或「技能」区注明「了解基本概念，可快速上手」应对 OpenCV、Docker；对 Django 不写也不提，除非面试问起。",
    "5. 学历：放在简历最后，只写「高中」，不模糊处理。",
    "6. 关键词对齐：在技能摘要中直接使用 JD 用语：「Python 基础扎实」「接口调用」「项目 demo」「沟通需求」。"
  ],
  "gap_handling": [
    {
      "gap": "OpenCV 无经验",
      "action": "若有一周以上准备时间，完成一个入门 demo（如图像灰度化、轮廓检测）并加到 GitHub。否则在面试中主动表达学习意愿，并用过往学习 Python/LLM 的速度作为佐证。"
    },
    {
      "gap": "Django / Docker 不熟",
      "action": "JD 未要求，但可花 2-3 天完成 Django 官方教程和 Docker 部署 Flask 练习，补充简历中的「了解」描述。非紧急可忽略。"
    },
    {
      "gap": "项目可验证性不足",
      "action": "尽快整理代码到 GitHub（脱敏后），每个项目写 README 和运行指南；若有客户评价截图（脱敏），加入作品集。"
    }
  ],
  "overall_confidence": "medium",
  "escalation_flag": {
    "required": false,
    "reason": "未触发任何红线（不隐瞒学历、不伪造技能、区分事实/推断）。无需人工审查。"
  },
  "red_line_checklist": [
    {"rule": "不得把未掌握技能写成熟练", "status": "合规，弱项均如实标注「无经验」「不熟悉」"},
    {"rule": "不得建议隐藏或伪造学历", "status": "合规，策略明确建议不隐藏、不伪造"},
    {"rule": "不得把推断写成已验证事实", "status": "合规，所有推断均标注 claim_type=inference 并提供证据和置信度"}
  ]
}
```

## Judge

### Rubric Hits

- 逐条对照 JD 输出命中、缺漏、弱化
- 明确学历是优先项而非硬卡
- 把 RAG/脚本/外包项目映射到岗位需求
- 对不熟 Django、Docker 经验弱等问题给可补策略
- 区分事实、推断、建议和置信度

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 可进一步利用候选人已有 Flask 经验明确弱化 Django 缺口，而不只建议补学
- 对外包项目的接口调用推断可要求更直接的证据描述以提升简历说服力

### Prompt Patch Suggestions

- 可在 Analyze/Judge 节点 prompt 中增加一条：'若存在可替代技能，应明确映射关系以弱化对不熟悉工具的要求'
- 强调对外包类经历应提取出可直接写入简历的量化或具体调用证据
