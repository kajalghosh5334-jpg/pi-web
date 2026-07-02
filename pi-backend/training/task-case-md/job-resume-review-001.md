# 简历终审裁决

## 基本信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | `job-resume-review-001` |
| **工作流 ID** | `WF-6` |
| **节点类型** | `Review/Gate` |
| **Profile 目标** | `strong-quality-reviewer` |
| **Profile 状态** | ✅ 生效中 (in agent-profiles.json) |
| **训练模型** | `opencode-go/deepseek-v4-pro` |
| **评分模型 (Judge)** | `opencode-go/deepseek-v4-pro` |
| **最佳训练批次** | `2026-07-01T20-53-01-930Z` |
| **Judge 评分** | `95/100` |
| **是否通过 (pass)** | `True` |

---

## 任务输入

```
请审查上游生成的简历经历是否诚实、专业、针对星河智造初级 AI 工具开发助理 JD。必须给出 pass/revise/block 裁决、问题清单、返工节点和验收标准。不要重写整份简历。
```

---

## 标准答案

> 如果上游没有虚构，通常应 revise 或 pass with minor issues。问题应聚焦：是否有未支撑量化、是否把 demo 写过头、学历呈现是否诚实但不过度突出、是否补充项目链接/demo 证明。返工节点应指向 Generate/Draft 或 Analyze/Judge。输出必须短而可执行。

### 评分 Rubric

1. 给出明确 pass/revise/block 裁决
2. 检查是否虚构学历、项目成果、职位或技能熟练度
3. 检查是否对齐 JD 的 Python、接口调用、项目 demo 和沟通要求
4. 指出具体返工位置和返工节点
5. 输出短裁决，不展开长文重写

### 红线规则

1. 不得直接替弱模型重写整份长简历
2. 不得只给建议不给裁决
3. 不得允许虚构经历通过

---

## Profile 答案（训练输出）

输出模型: `opencode-go/deepseek-v4-pro`  
耗时: `72536ms`  

```
{
  "decision": "revise",
  "issues": [
    {
      "severity": "high",
      "target_node": "data-verification-agent (or candidate-confirmation-node)",
      "location": "project_experience[0].skills_tags / source_usage['项目1-LangChain/OpenAI']",
      "problem": "Skill tags 'LangChain RAG 框架' and 'OpenAI API' are based on upstream inference, not direct source evidence. Source explicitly labels this as 'upstream analysis inference'.",
      "action": "Candidate must confirm whether LangChain and OpenAI API were actually used. Until confirmed, the tags should be downgraded to 'candidate-claimed' or replaced with verified skills only.",
      "acceptance_criteria": "A confirmation artifact (e.g., a checkbox, interview note, or candidate correction) is attached to the profile. If unconfirmed, the tags are removed."
    },
    {
      "severity": "high",
      "target_node": "data-verification-agent (or candidate-confirmation-node)",
      "location": "project_experience[1].skills_tags / source_usage['项目2-pandas/openpyxl']",
      "problem": "Skill tag 'pandas / openpyxl' is noted as '合理推断（无上游直接依据）' in source_usage. Not grounded in original data.",
      "action": "Candidate must confirm tool usage. Equivalent: request the original script or a sample snippet as evidence.",
      "acceptance_criteria": "Confirmed by candidate; otherwise removed or marked as [unverified inference]."
    },
    {
      "severity": "medium",
      "target_node": "content-draft-producer",
      "location": "project_experience[0].star_description / '[客户公司名称 placeholder]'",
      "problem": "A literal placeholder remains in the draft. A resume must not contain unresolved placeholders.",
      "action": "Either obtain the actual client name from the candidate (with consent) or rephrase to 'a logistics/manufacturing client' or similar generic term.",
      "acceptance_criteria": "No placeholder strings remain; client name is either filled or abstracted safely."
    },
    {
      "severity": "medium",
      "target_node": "content-draft-producer",
      "location": "project_experience[0].highlights / general CTA",
      "problem": "The draft only *suggests* uploading a GitHub demo (in highlights), but does not require or request a link. For an AI tool developer role, a verifiable demo link is critical.",
      "action": "Add a dedicated field or call-to-action asking for a GitHub repo / demo URL. If unavailable, the draft should clearly note 'demo available upon request' or similar.",
      "acceptance_criteria": "A required field for 'project_link' or a note about demo availability is present."
    },
    {
      "severity": "low",
      "target_node": "profile-completeness-checker (downstream)",
      "location": "entire resume output",
      "problem": "No education section is present. The review checklist requires checking that education is not fabricated, but it is entirely absent.",
      "action": "Add a downstream step to collect and verify education history.",
      "acceptance_criteria": "Education record exists or is explicitly marked as 'not yet collected'."
    },
    {
      "severity": "low",
      "target_node": "content-draft-producer",
      "location": "project_experience[1].star_description / editable_notes[2]",
      "problem": "Project 2 lacks specificity (report type, data volume, frequency). While not a blocker, the draft's value for the JD is reduced without minimal context.",
      "action": "Optionally prompt candidate for context details; otherwise proceed with current level of detail.",
      "acceptance_criteria": "No hard requirement; can ship as-is if candidate does not respond."
    }
  ],
  "evidence_checks": {
    "education": {
      "fabricated": false,
      "status": "missing"
    },
    "position_identity": {
      "fabricated": false,
      "note": "No explicit job titles fabricated; role descriptions ('独立负责') are consistent with given responsibilities."
    },
    "quantitative_claims": {
      "fabricated_numbers": false,
      "note": "No unsupported numbers found. All descriptions are qualitative."
    },
    "project_evidence": {
      "project1_rag_system": {
        "functional_demo_claimed": true,
        "verification_link_provided": false,
        "note": "Claims a working system; evidence would benefit from a demo/GitHub link."
      },
      "project2_excel_script": {
        "claim": "delivered usable script",
        "verification_link_provided": false
      }
    },
    "skill_proficiency": {
      "verified_skills": ["Python", "Flask Web 开发", "Chroma 向量数据库", "需求沟通与独立交付", "自动化脚本设计", "数据处理"],
      "inferred_unconfirmed_skills": ["LangChain RAG 框架", "OpenAI API", "pandas / openpyxl"],
      "note": "Verified skills align with source material; inferred skills require candidate confirmation."
    }
  },
  "checklist_coverage": {
    "checked": [
      "学历如实呈现未虚构: no fabrication, but missing",
      "职位/身份夸大: no exaggeration detected",
      "AI项目成果量化数据支撑: described qualitatively; no fake numbers",
      "对齐JD Python/接口调用/demo/沟通: Python, API调用, demo提及, 沟通描述 present",
      "红线检查: no fabricated experience, no inflated claims, no fake numbers"
    ],
    "unchecked_or_incomplete": [
      "项目链接/可验证证明未主动要求",
      "教育背景完全缺失",
      "推断技能标签未确认"
    ]
  },
  "rework_assignment": [
    {
      "assignee": "data-verification-agent",
      "task": "Confirm inferred skills (LangChain, OpenAI API, pandas/openpyxl) with candidate; add verification artifacts or downgrade tags."
    },
    {
      "assignee": "content-draft-producer",
      "task": "Remove placeholder '客户公司名称 placeholder'; replace with generic term or candidate-confirmed name. Add mandatory project-demo URL field or a 'demo available upon request' note. Optionally prompt for project 2 context details."
    },
    {
      "assignee": "profile-completeness-checker",
      "task": "Collect and verify education section. Ensure no fabrication."
    }
  ]
}
```

---

## Judge 评估详情

| 维度 | 结果 |
|------|------|
| **评分** | 95/100 |
| **通过** | True |

### Rubric 命中项

- ✅ 给出明确 pass/revise/block 裁决
- ✅ 检查是否虚构学历、项目成果、职位或技能熟练度
- ✅ 检查是否对齐 JD 的 Python、接口调用、项目 demo 和沟通要求
- ✅ 指出具体返工位置和返工节点
- ✅ 输出短裁决，不展开长文重写

### 缺失项

- 无

### 幻觉检测

- 无

### 红线违规

- 无

### Profile 经验教训

- Review 节点成功分离裁决与重写，仅提供短问题描述和返工分配
- 对推断来源的技能标签设置了高严重性并要求候选确认，避免未经核实的声明进入最终产出
- 要求补充项目可验证证明（demolink）并移除占位符，有效预防数字造假
- 缺失教育背景被标记为待收集而非虚构，体现了审查的粒度

---

## 节点依赖

上游依赖: 
- `job-resume-draft-001`
