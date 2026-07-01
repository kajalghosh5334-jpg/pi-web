# 求职背景诊断

- Case ID: `job-background-strategy-001`
- Workflow: `WF-1`
- Node Type: `Strategize/Plan`
- Target Profile: `strong-task-architect`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `95`
- Pass: `true`
- Elapsed: `76615ms`
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
  "decision_summary": "以 Python/LLM/RAG 实战能力为核心竞争力，主攻“能力导向”的初级 AI 应用开发/工具开发岗，利用作品集绕过学历硬门槛，6k 在非头部城市或小型团队可实现。",
  
  "positioning_or_strategy": "定位为“具备 LLM/RAG 落地经验的初级 Python 开发者”。目标企业圈：① 对学历无硬性要求的小型科技公司、AI 初创团队；② 接外包项目的软件公司、数字化服务商；③ 远程自由职业平台上的 AI 工具开发任务。核心策略是用 2-3 个可演示的项目作品集替代学历背书，将“性格开朗”转化为“客户沟通与交付能力”叙事，集中投递“重能力轻学历”的显性岗位。",

  "constraints": {
    "irreversible": [
      "高中学历：在招聘平台自动筛选中会被大量中大型企业、国企、政府外包直接过滤，这是不可逆的短期结构化短板。",
      "经验仅为外包项目：缺少正式企业任职经历，可能影响背调与雇主信任度，需要更长的信任建立过程。"
    ],
    "reducible": [
      "基础计算机知识可能不系统（数据结构、操作系统、网络等），面试可能被问到，属于可补短板。",
      "缺少团队协作与正式开发流程经验（code review、CI/CD、敏捷流程），影响部分岗位匹配。",
      "薪资 6k 在一线城市属于偏低水平，但在二三线城市或远程岗位竞争力中等。"
    ],
    "red_lines": [
      "不虚构任何学历、工作年限、大厂经历或项目成果。",
      "不对年龄或性别做能力价值判断，仅客观描述市场现实约束。",
      "不将 6k 岗位包装为高阶算法岗、研究岗。"
    ]
  },

  "opportunities": [
    "当前 AI 浪潮下 LLM/RAG 方向需求增速快，大量中小企业、创业团队缺乏相关人才，对学历容忍度高。",
    "小型 AI 外包项目经验可包装为“独立交付闭环能力”——从需求理解、方案设计到代码实现和交付，这是很多企业看重的实干特质。",
    "GitHub、V2EX、BOSS 直聘、即刻等技术社区存在直接联系创业者的机会，可绕过 HR 简历过滤。",
    "性格开朗有利于面试沟通与项目沟通，降低协作顾虑。",
    "国家开放大学、自考等在职学历提升路径存在，可作为中长期“去短板”选项。"
  ],

  "execution_priorities": [
    "项目资产化：挑选 2-3 个最完整的 AI 工具/RAG 外包项目，整理清晰的 README、效果截图/演示链接，并托管在 GitHub 形成作品集（标注技术栈、难点、交付成果），直接作为可验证竞争力。",
    "岗位清单圈定：明确投递岗位类型为“Python 开发工程师”“AI 应用开发工程师”“RAG 开发工程师”“AI 实施工程师”等，筛选 BOSS 直聘等平台上明确标注“学历不限”或“大专亦可”的岗位，初步圈定 30-50 个目标。",
    "渠道侧验证：在 BOSS 直聘/前程无忧完成 20 次以上投递，同时注册 Upwork、码市等平台尝试远程 AI 项目，收集“学历是否导致秒拒”的真实反馈。",
    "技能底线补课：在 2 周内快速过一遍 Python 基础面试高频考点、SQL 基础、Linux 常用命令、Git 协作流程，确保面试不因基础翻车。",
    "面试话术设计：围绕“交付能力”而非“学历”设计自我介绍和项目讲解框架，准备应对“学历为什么是高中”的回答话术，保持诚实的同时引导对话向能力倾斜。",
    "中长期学历规划（非紧急）：了解成人高考/自考/国家开放大学路径，评估时间与金钱成本，作为后续晋升通道的备份方案。"
  ],

  "validation_metrics": [
    "投递 30 家后，获得 ≥5 个有效面试邀请（排除学历直接拒信后）。",
    "面试转化率（面试数/投递数）≥ 15%，若不达标则分析是渠道问题还是简历/项目问题。",
    "最终获得 ≥1 个月薪 ≥6k 的正式 offer。",
    "GitHub 项目主页在 1 个月内获得自然访问（star/fork 非硬性指标，但体现展示有效性）。",
    "整理出至少 15 家企业的学历要求反馈记录，形成“可投-学历友好企业类型”清单，作为后续投递的稳定渠道池。"
  ],

  "handoff_to_next_nodes": {
    "candidate_profile": {
      "age": 29,
      "gender": "male",
      "education": "high_school",
      "expected_salary": 6000,
      "experience_tags": ["Python", "LLM", "RAG", "small_project_delivery"],
      "personality": "outgoing"
    },
    "target_job_labels": [
      "Python开发工程师",
      "AI应用开发工程师",
      "RAG开发工程师",
      "AI实施工程师",
      "小型外包Python开发"
    ],
    "key_skills_stack": [
      "Python",
      "LangChain / LlamaIndex 等 RAG 框架（需通过项目具体说明）",
      "基础 LLM 调用与 prompt 设计",
      "小型 Web 应用搭建能力（如 Flask/FastAPI，若项目用过则标注）",
      "Git 基础操作"
    ],
    "irreversible_constraint": "高中学历，大部分中大型企业简历系统会直接过滤。",
    "portfolio_input": "需下游节点承接项目描述，生成作品集叙述文本（不生成完整简历正文）。",
    "channel_suggestions": [
      "BOSS直聘（筛选学历不限岗位）",
      "GitHub Issues / Discussions 中寻找远程机会",
      "V2EX 求职板块",
      "Upwork / 码市 远程自由职业"
    ],
    "interview_strategy_points": [
      "开场强调独立交付项目的能力，用具体项目演示替代学历背书。",
      "对于学历问题诚实回答，并将话题引导至持续学习能力和项目成果。",
      "薪资 6k 可锚定为初级岗位期望，不主动拉低，也不虚高。"
    ]
  }
}
```

**方向性结论已给出，未生成正文。不编造学历、工作年限、成果等事实。6k定位于初级开发岗，未越位为高阶算法岗。**

## Judge

### Rubric Hits

- 明确高中学历对 entry-level 技术岗的现实影响，未做人格或能力价值判断
- 圈定了与 6k 薪资匹配的初级技术岗位类型（Python 开发、AI 应用开发等）
- 将 AI 编程经验转化为可验证的项目作品集（GitHub 展示、README、截图等）
- 明确区分了不可逆短板（学历、无企业经历）、可补短板（基础知识、团队协作经验）和叙事绕行策略（作品集替代学历、性格转化为沟通优势）
- 仅输出方向性策略规划，未生成简历正文，未替下游执行具体内容

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
