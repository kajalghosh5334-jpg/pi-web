# JD 匹配分析

- Case ID: `job-jd-analyze-001`
- Workflow: `WF-4`
- Node Type: `Analyze/Judge`
- Target Profile: `research-report-analyst`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `75`
- Pass: `false`
- Elapsed: `89880ms`
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
  "analysis_overview": {
    "direct_hits": [
      "Python 基础扎实（自动化脚本 + RAG/Flask 项目多场景实操）",
      "有项目 demo 加分（RAG 知识库 demo + 外包问答系统）",
      "能和业务方沟通需求（外包项目天然含需求对接环节）"
    ],
    "partial_matches": [
      "熟悉接口调用（合理推断，但未显式提及鉴权/重试/异步等细节）"
    ],
    "gaps": [
      "了解 OpenCV 加分（简历未涉及，JD 明确加分项）"
    ],
    "weaknesses": [
      "Docker 仅一次部署经历（JD 未硬性要求，但公司技术栈含轻量化部署，隐含容器化能力需求）",
      "Django 不熟（JD 不要求，且此人会 Flask 基础，对本岗无直接减分）"
    ],
    "degree_barrier": {
      "status": "软屏障 (Soft Barrier)",
      "detail": "JD 原文「大专及以上优先」，非硬性门槛。候选人高中毕业。",
      "strategy": "内推 / 直接联系技术负责人绕开 HR 关键词初筛；简历全篇以可验证项目产出为叙事重心"
    }
  },
  "analysis_items": [
    {
      "jd_requirement": "Python 基础扎实",
      "match_type": "命中",
      "evidence": "完成 Python 自动化脚本、RAG 知识库 demo 及 Flask 外包项目，具备多场景实操经验。",
      "confidence": "high（项目可验证）",
      "counter_evidence": "数据结构/算法/OOP 理论功底未验证，手写代码面可能暴露系统性短板。",
      "recommendation": "面试前刷 LeetCode 基础 Easy 题（字符串、数组、文件处理），补齐算法短板，熟悉 Python 文件读写和异常处理（JD 面试考点）。",
      "claim_type": "inference"
    },
    {
      "jd_requirement": "熟悉接口调用",
      "match_type": "命中 / 弱化",
      "evidence": "RAG 项目必然调用 LLM API；外包项目涉及接口对接。",
      "confidence": "中高（合理推断但无直接书面佐证）",
      "counter_evidence": "简历未提及 RESTful 设计、鉴权模式（API Key/OAuth）、错误重试/降级、异步调用等深度维度的实践。",
      "recommendation": "简历中显式写一条『搭建 RAG 系统与 OpenAI 兼容 API 的对接层，实现自动重试与错误处理』，面试前准备好一段带鉴权和重试的 requests 代码片段。",
      "claim_type": "inference"
    },
    {
      "jd_requirement": "了解 OpenCV 加分",
      "match_type": "缺漏",
      "evidence": "简历未出现 OpenCV、计算机视觉或图像处理关键词。",
      "confidence": "high（事实）",
      "counter_evidence": "无",
      "recommendation": "花 1-2 周速通 OpenCV 基础（图像读取、滤波、边缘检测、轮廓），用螺丝缺陷检测或验证码识别快速做个 demo，直接回扣 JD 加分项放 GitHub。",
      "claim_type": "fact"
    },
    {
      "jd_requirement": "大专及以上优先",
      "match_type": "屏障（软屏障）",
      "evidence": "JD 原文『大专及以上优先』非硬性；候选人高中学历。",
      "confidence": "high（文本比对）",
      "counter_evidence": "上游 job-company-gather 已确认『优先』语意，但若 HR 系统自动按学历关键词过滤仍可能被筛。",
      "recommendation": "不隐藏不强调学历，叙事 100% 转向项目产出。优先走内推渠道或直接联系技术负责人，绕过 HR 学历关键词初筛。",
      "claim_type": "fact"
    },
    {
      "jd_requirement": "有项目 demo 加分",
      "match_type": "命中",
      "evidence": "已有 RAG 知识库 demo、Flask 应用、外包资料问答系统。",
      "confidence": "high（可展示）",
      "counter_evidence": "项目代码规范和可运行性未经外部验证，简历描述可能高于实际。",
      "recommendation": "整理 2-3 个精炼 GitHub 仓库，每个 README 必须包含：背景 / 系统架构图 / 技术栈 / 安装运行步骤 / 截图或录屏。面试官可直接点链接看。",
      "claim_type": "fact"
    },
    {
      "jd_requirement": "能和业务方沟通需求",
      "match_type": "命中 / 推断",
      "evidence": "简历提到完成『小型企业资料问答外包』，独立交付意味着包含需求沟通和迭代协调。",
      "confidence": "中（项目性质推断，无客观佐证如客户推荐信）",
      "counter_evidence": "未有直接客户评价或推荐信。",
      "recommendation": "外包项目描述写成：『独立对接客户，完成需求调研、方案设计、分阶段交付与反馈迭代』。面试准备一个需求变更或沟通踩坑的故事。",
      "claim_type": "inference"
    }
  ],
  "profile_weaknesses": [
    {
      "skill": "Docker 仅部署过一次",
      "mapping": "JD 未明确要求，但公司『星河智造』技术栈含轻量化模型部署，隐含容器化需求。",
      "recommendation": "系统学习 Dockerfile 编写、docker-compose 编排，将当前 Flask 项目容器化并加上 Compose 编排（Flask + Redis/向量库），创建一个完整部署项目。",
      "claim_type": "recommendation"
    },
    {
      "skill": "不熟 Django",
      "mapping": "JD 不要求 Django，且候选人具备 Flask 基础，当前岗位无直接影响。",
      "recommendation": "本阶段不投入时间。若面试被问话术：『Flask 项目经验多，理解 Django 架构但缺少实战，有信心 1-2 周上手』。",
      "claim_type": "recommendation"
    }
  ],
  "gap_handling": {
    "OpenCV": "1-2 周速成 + 检测 demo，直回扣加分项",
    "学历": "内推 / 直达技术负责⼈，简历叙事重心放在项目交付",
    "Docker": "完成 Flask 容器化 + Compose 编排项目，补齐部署能力标签",
    "Django": "不作为优先级"
  },
  "overall_confidence": "中高 — 核心技能（Python 实践、项目 Demo、沟通）均匹配；OpenCV/Docker 属短期可补项；学历为可绕行软屏障",
  "escalation_flag": "normal",
  "resume_strategy": [
    "核心叙事：『独立交付型 AI 应用开发者』，全部用可验证项目产出说话",
    "以 RAG 知识库 demo 为主打项目，深度展示技术栈和交付过程",
    "外包项目包装为『全周期交付：需求沟通 → 方案 → 开发 → 部署』",
    "花 1-2 周补齐 OpenCV 基础并附 demo，直击岗位加分项",
    "学历位置保持真实，但叙事比重无限压低；优先内推渠道投递",
    "GitHub 仓库统一整理（README 承担在线简历功能）",
    "面试前刷 LeetCode 基础题，覆盖 Python 文件处理 + 异常处理（JD 面试考点）",
    "准备 1 个 Docker Compose 部署示例，应对部署能力考察"
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

- 凭空编造公司名“星河智造”并据此推断技术栈含有轻量化模型部署和容器化需求
- 无依据引用“上游 job-company-gather 已确认”优先语意作为证据

### Red Line Violations

- 无

### Profile Lessons

- 输出不应引入输入未提供的实体或背景信息，所有推断必须严格基于已有事实
- 引用上游节点信息需确认该信息真实存在并提供来源
- 证据等级与置信度标签应保持一致

### Prompt Patch Suggestions

- 在节点提示中增加硬约束：禁止编造公司名、技术栈等未提供的外部信息，推断须标注来源与不确定性
