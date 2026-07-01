# 求职背景诊断

- Case ID: `job-background-strategy-001`
- Workflow: `WF-1`
- Node Type: `Strategize/Plan`
- Target Profile: `strong-task-architect`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `90`
- Pass: `true`
- Elapsed: `49391ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: none

## Input

求职者背景：高中学历，男，29 岁，性格开朗，有 Python/LLM/RAG 相关 AI 编程经验，接过小型 AI 工具和 RAG 外包项目，期望薪资 6k。请诊断真实竞争位置、目标岗位圈、不可逆短板和绕行策略。

## Rubric

1. 明确高中学历对 entry-level 技术岗的现实影响，但不做人格或能力价值判断
2. 圈定 6k 薪资对应的可投岗位类型
3. 把 AI 编程经验转成可验证竞争力
4. 区分不可逆短板、可补短板和叙事绕行策略
5. 输出方向性结论，不写简历正文

## Node Output

```json
{
  "decision_summary": "高中学历对硬性学历门槛岗位形成不可逆限制；建议定位为实践型AI应用开发者，主攻看重项目产出而非学历的中小企业、初创团队或自由职业平台，6k期望在二线城市初级AI开发/工具岗可达成。",
  "positioning_or_strategy": "以“独立交付过RAG/LLM外包项目”为核心叙事，淡化学历，强化可验证工程产出；目标岗位圈锁定Python/AI应用开发、RAG开发、AI工具工程师、自由职业接包等学历要求低的岗位；绕行策略：用作品集+认证+内推替代学历筛选。",
  "constraints": {
    "irreversible": [
      {
        "factor": "高中学历",
        "impact": "无法通过大部分含大专/本科硬性门槛的简历筛选（中大型企业、规范HR流程公司）",
        "type": "fact"
      }
    ],
    "remediable": [
      {
        "factor": "无正式企业工作经验（仅有外包项目，自述）",
        "impact": "背调或稳定工作经历证明困难",
        "type": "unverified"
      },
      {
        "factor": "系统计算机基础知识可能缺失（未验证）",
        "impact": "数据结构/算法等笔试面试可能成短板",
        "type": "unknown"
      }
    ],
    "blocking_risk": [
      {
        "factor": "部分公司或甲方可能要求学历证明/社保记录，入职可能遇阻",
        "action": "提前确认岗位学历要求，避免无效投递",
        "type": "risk"
      }
    ]
  },
  "opportunities": [
    {
      "opportunity": "具备AI/LLM/RAG实践开发经验（自述，待验证）",
      "leverage": "通过GitHub项目、线上demo、技术博客转化为可信竞争力",
      "type": "unverified"
    },
    {
      "opportunity": "性格开朗（自述）",
      "leverage": "若属实，在客户沟通、需求对接、小型团队协作中有加分",
      "type": "unverified"
    },
    {
      "opportunity": "AI应用开发市场更看重实际产出，学历敏感度低于传统IT",
      "leverage": "对需要快速构建RAG原型/AI工具的中小企业或创业者，可成为核心卖点",
      "type": "inferred"
    }
  ],
  "execution_priorities": [
    "整理2-3个实际完成的AI/RAG项目，创建规范GitHub仓库（含README、演示、技术说明）作为核心验证资产",
    "筛选明确不要求大专以上学历的Python/AI开发、RAG开发、AI产品助理等岗位，同步在自由职业平台建立Profile",
    "自评并补齐算法/数据结构等面试薄弱点，确保技术面不溃败",
    "考取至少一个AI相关行业认证（如Azure AI Fundamentals）提供第三方可查证证明",
    "产出一篇技术博客或一段项目演示视频，发布技术社区以构建个人品牌",
    "调研目标城市6k对应岗位薪资水平，准备项目价值论据支撑薪资谈判"
  ],
  "validation_metrics": [
    "GitHub仓库至少含2个AI相关可运行项目，README清晰",
    "获得至少一项行业认证或第三方认可",
    "投递50-100份目标岗位后，初筛通过率/面试邀请数可统计",
    "自由职业平台收到首个客户或好评"
  ],
  "handoff_to_next_nodes": {
    "target_job_categories": [
      "Python开发（AI应用方向）",
      "RAG/LLM应用开发",
      "AI工具开发 / AI产品助理",
      "自由职业 / 外包项目执行"
    ],
    "key_selling_points": [
      "独立完成过RAG应用外包项目，具备从需求到交付的能力",
      "熟悉LLM应用开发栈（Python, LangChain/LlamaIndex等，需确认具体技能）",
      "能快速构建AI原型，降低用人方试错成本"
    ],
    "required_materials": [
      "作品集/GitHub仓库",
      "项目案例文档（含问题描述、技术方案、实现效果）",
      "客户推荐信或评价（如有）",
      "行业认证证书",
      "个人技术博客或演示视频"
    ],
    "risk_flags": [
      "学历可能触发初筛自动过滤，建议通过内推或直达用人经理途径投递",
      "外包项目成果、客户满意度需在面试前核实，避免口头夸大",
      "6k岗位若涉及算法岗描述，属不实定位，需始终坚持初级/应用开发方向"
    ]
  }
}
```

## Judge

### Rubric Hits

- 明确高中学历对 entry-level 技术岗的现实影响，但不做人格或能力价值判断
- 圈定 6k 薪资对应的可投岗位类型
- 把 AI 编程经验转成可验证竞争力
- 区分不可逆短板、可补短板和叙事绕行策略
- 输出方向性结论，不写简历正文

### Missing

- 目标岗位圈未覆盖标准答案中的'爬虫''测试开发边缘岗'等具体方向（仅宽泛列出Python/AI工具开发等）

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 无

### Prompt Patch Suggestions

- 无
