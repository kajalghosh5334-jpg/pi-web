# JD 匹配分析

## 基本信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | `job-jd-analyze-001` |
| **工作流 ID** | `WF-4` |
| **节点类型** | `Analyze/Judge` |
| **Profile 目标** | `research-report-analyst` |
| **Profile 状态** | ✅ 生效中 (in agent-profiles.json) |
| **训练模型** | `opencode-go/deepseek-v4-flash` |
| **评分模型 (Judge)** | `opencode-go/deepseek-v4-pro` |
| **最佳训练批次** | `2026-07-01T22-27-25-228Z` |
| **Judge 评分** | `95/100` |
| **是否通过 (pass)** | `True` |

---

## 任务输入

```
候选人简历要点：高中学历；做过 Python 自动化脚本、RAG 知识库 demo、一个小型企业资料问答外包；会 Flask 基础，不熟 Django；Docker 只部署过一次。JD：Python 基础扎实，熟悉接口调用，了解 OpenCV 加分，大专及以上优先，有项目 demo 加分，能和业务方沟通需求。请输出命中项、缺漏项、弱化项、学历屏障和简历定制策略。
```

---

## 标准答案

> 命中项包括 Python、接口调用相关经验、项目 demo、业务沟通潜力；OpenCV 未出现真实经验，应标缺漏或可补；学历是大专及以上优先，属于风险但非硬卡；Flask 可作为 Web 基础弱化 Django 缺口，Docker 只写了解或部署经验。定制策略应放大 RAG 外包、企业资料问答、Python 自动化，把学历放在简历后部如实呈现。

### 评分 Rubric

1. 逐条对照 JD 输出命中、缺漏、弱化
2. 明确学历是优先项而非硬卡
3. 把 RAG/脚本/外包项目映射到岗位需求
4. 对不熟 Django、Docker 经验弱等问题给可补策略
5. 区分事实、推断、建议和置信度
6. 当上游背景诊断缺失或失败时，显式标记 upstream_missing，不得用标准答案或常识补齐候选人画像

### 红线规则

1. 不得把未掌握技能写成熟练
2. 不得建议隐藏或伪造学历
3. 不得把推断写成已验证事实
4. 不得把 failed/missing 上游依赖当成已验证结论

---

## Profile 答案（训练输出）

输出模型: `opencode-go/deepseek-v4-flash`  
耗时: `52704ms`  

```
{
  "upstream_missing": [
    {
      "node": "job-background-strategy-001",
      "status": "failed",
      "impact": "该节点提供的背景诊断和绕行策略未通过校验，不得作为已验证事实使用。候选人基本信息（学历、技能）以当前节点输入为准。"
    }
  ],
  "analysis_items": [
    {
      "item": "Python 基础扎实",
      "category": "hit",
      "claim_type": "inference",
      "evidence": "候选人完成过 Python 自动化脚本、RAG 知识库 demo 和外包问答项目，均依赖 Python 基础。",
      "confidence": 0.8,
      "counter_evidence": "未说明对数据结构、异常处理、文件 I/O 等底层掌握程度；项目可能存在大量依赖外部库/复制代码的情况。",
      "recommendation": "面试中安排编码题验证文件处理、函数封装和基础算法能力。"
    },
    {
      "item": "熟悉接口调用（REST/API）",
      "category": "hit",
      "claim_type": "inference",
      "evidence": "RAG 项目和外包问答涉及调用 LLM API 或数据库接口，候选人大概率具备接口调用经验。",
      "confidence": 0.7,
      "counter_evidence": "输入未明确提及调用第三方 API 的案例，仅推断。",
      "recommendation": "要求候选人在简历中列举一个具体 API 调用场景（如请求、鉴权、错误处理），面试中追问细节。"
    },
    {
      "item": "项目 demo 经验",
      "category": "hit",
      "claim_type": "fact",
      "evidence": "有 RAG 知识库 demo 和企业资料问答外包项目。",
      "confidence": 0.9,
      "counter_evidence": "demo 完整度、可部署性、代码质量未知。",
      "recommendation": "要求候选人提供可在线演示的链接（如 HuggingFace Spaces、Streamlit Cloud）和 GitHub 仓库。"
    },
    {
      "item": "Python 文件处理",
      "category": "hit",
      "claim_type": "inference",
      "evidence": "面经提到面试会问 Python 文件处理；候选人自动化脚本经验很可能包含文件读写。",
      "confidence": 0.6,
      "counter_evidence": "未提供具体文件处理项目细节。",
      "recommendation": "面试中准备文件处理测试题（如 CSV 解析、日志分析）。"
    },
    {
      "item": "OpenCV / 计算机视觉",
      "category": "missing",
      "claim_type": "fact",
      "evidence": "候选人未提及任何 OpenCV 或 CV 相关经验。",
      "confidence": 0.95,
      "counter_evidence": "无",
      "recommendation": "投递前学习 OpenCV 基础（图像读取、预处理、简单检测）并做一个 demo 项目（如颜色追踪、轮廓识别），预计投入 1–2 周。"
    },
    {
      "item": "Django / Web 框架",
      "category": "weak",
      "claim_type": "fact",
      "evidence": "候选人自称不熟 Django，仅会用 Flask 基础。",
      "confidence": 0.9,
      "counter_evidence": "JD 未要求 Django，Flask 足以覆盖该岗位常见 Web 任务。",
      "recommendation": "无需补 Django；若后续需 Web 能力，建议深化 Flask 或转学 FastAPI（异步支持更好）。"
    },
    {
      "item": "Docker 容器化",
      "category": "weak",
      "claim_type": "fact",
      "evidence": "仅部署过一次 Docker，缺乏容器化工程经验。",
      "confidence": 0.9,
      "counter_evidence": "该岗位未明确要求 Docker，但初级开发常用容器化部署。",
      "recommendation": "完成 Docker 官方入门教程，并用 Docker 部署一个 Python Web 服务到云平台，预计 3–5 天可掌握。"
    },
    {
      "item": "与业务方沟通需求",
      "category": "weak",
      "claim_type": "inference",
      "evidence": "外包项目经验可能涉及客户沟通，但输入未明确。",
      "confidence": 0.5,
      "counter_evidence": "无直接证据，可能仅按需求文档执行，不主动沟通。",
      "recommendation": "通过模拟场景考察：让候选人复述项目背景、用户痛点、技术方案选择，评估其业务语言表达能力。"
    },
    {
      "item": "学历（大专及以上优先）",
      "category": "education_barrier",
      "claim_type": "fact",
      "evidence": "JD 注「大专及以上优先」，候选人学历为高中。",
      "confidence": 0.95,
      "counter_evidence": "「优先」非硬性，部分企业可凭项目经验破格。",
      "recommendation": "简历上如实填写高中，不隐藏。重点突出 3 个以上高质量项目（含可演示 demo）作为替代证明。面试话术中强调自学路径和交付结果，主动将话题引向技术能力。"
    }
  ],
  "gap_handling": [
    {
      "gap": "OpenCV 经验缺失",
      "priority": "high",
      "action": "系统学习 OpenCV 基础（图像读取、处理、轮廓检测），完成一个小型 demo",
      "expected_cost": "1–2 周"
    },
    {
      "gap": "学历短板",
      "priority": "high",
      "action": "如实填写学历，同时准备 3 个高质量、可在线演示的项目 demo，简历中完整展示项目技术栈和交付成果",
      "expected_cost": "持续"
    },
    {
      "gap": "Docker 经验薄弱",
      "priority": "medium",
      "action": "通过 Docker 官方 Get Started 教程学习，并用 Docker 部署一个 Web 服务到免费云平台",
      "expected_cost": "3–5 天"
    },
    {
      "gap": "沟通需求能力待验证",
      "priority": "medium",
      "action": "准备项目陈述模板（背景–任务–行动–结果），练习用非技术语言解释技术方案",
      "expected_cost": "1 周"
    },
    {
      "gap": "接口调用经验未确认",
      "priority": "medium",
      "action": "在简历或作品集中补充一个接口调用案例（截图或代码段）",
      "expected_cost": "1–2 天"
    }
  ],
  "overall_confidence": 0.65,
  "escalation_flag": false,
  "notes": "上游 job-background-strategy-001 失败，其输出未被采用。候选人基本事实来源于当前节点输入。学历为优先项，非硬阻塞。以下游简历定制时，应重点包装项目经验，不隐藏学历，同时附带 OpenCV 和 Docker 补课计划。"
}
```

---

## Judge 评估详情

| 维度 | 结果 |
|------|------|
| **评分** | 95/100 |
| **通过** | True |

### Rubric 命中项

- ✅ 逐条对照 JD 输出命中、缺漏、弱化
- ✅ 明确学历是优先项而非硬卡
- ✅ 把 RAG/脚本/外包项目映射到岗位需求
- ✅ 对不熟 Django、Docker 经验弱等问题给可补策略
- ✅ 区分事实、推断、建议和置信度
- ✅ 当上游背景诊断缺失或失败时，显式标记 upstream_missing，不得用标准答案或常识补齐候选人画像

### 缺失项

- 无

### 幻觉检测

- 无

### 红线违规

- 无

---

## 节点依赖

上游依赖: 
- `job-background-strategy-001`
- `job-company-gather-001`
