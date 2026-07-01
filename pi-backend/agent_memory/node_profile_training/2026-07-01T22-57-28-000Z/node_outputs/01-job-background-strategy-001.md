# 求职背景诊断

- Case ID: `job-background-strategy-001`
- Workflow: `WF-1`
- Node Type: `Strategize/Plan`
- Target Profile: `strong-task-architect`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `100`
- Pass: `true`
- Elapsed: `83561ms`
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
6. 学历绕行策略必须建立在如实呈现基础上：可以降低展示权重、放到后部、用作品集证明能力，但不得建议隐藏、删除或伪造学历

## Node Output

```yaml
# ============================================================
# NODE: Strategize/Plan
# PROFILE: strong-task-architect
# WORKFLOW: WF-1 | 求职背景诊断
# ============================================================

decision_summary: >
  高中学历在AI应用开发初级岗存在结构性过滤风险，但LLM/RAG实操经验是
  稀缺竞争力；目标岗位圈应锁定“AI应用实施/外包开发”类岗位，6k薪资
  在中小城市或外包市场可实现；核心策略是用可验证项目作品集前置证明
  能力，学历如实后置，绕开硬门槛。

# ----------------------------------------------------------
positioning_or_strategy:
  real_competitive_position:
    fact: "高中学历"
    impact: >
      绝大多数设置了学历过滤的HR系统（≥大专）会直接筛除，属于不可逆
      结构性短板。但AI应用开发领域新兴，许多中小公司、创业团队、外包
      项目更看重实际动手能力和交付案例，学历壁垒相对较低。真实竞争对
      手是自学转行者和初级科班生，而非高阶算法岗候选人。
    confidence: high

  target_job_circle:
    primary:
      - "LLM应用开发（Python集成，偏工程化而非算法研究）"
      - "RAG系统实施与运维（知识库搭建、文档处理管线）"
      - "AI工具外包开发（独立或小团队交付小型工具）"
    secondary:
      - "Python后端开发（API对接，业务逻辑，非底层架构）"
      - "技术客服/售前实施（AI产品方向）——可发挥性格开朗优势"
    excluded:
      - "任何明确要求硕士/博士的算法研究员、数据科学家"
      - "硬性要求大专以上学历且无弹性空间的公司（简历自动淘汰）"
    salary_6k_feasibility:
      assessment: >
        6k 在二线/三线城市或远程外包岗为合理初级水平；一线城市生存
        压力大，但部分外包项目/创业公司也可能接受。建议根据目标城市
        调整预期，或准备两条线：稳定岗位6k+外包补充收入。
      confidence: medium

  circumvention_strategy:
   学历绕行（注意红线）:
     - action: "简历和作品集中将学历信息放置在末尾区域，降低展示权重"
     - action: "项目经验和技能标签前置，作为简历第一屏的核心内容"
     - action: "使用作品集链接（GitHub/演示页面）替代学历作为能力证明"
     - forbidden: >
        不得建议隐藏、删除、伪造学历；不得通过暗示“大学在读”或
        “本科”等不实信息包装。所有面向企业的材料必须如实标注“高中”。
     narrative:
       - "将自学经历包装为“因对AI强烈兴趣而自主钻研并交付实际项目”的成长故事，强调自驱力和快速学习能力"
       - "性格开朗可转化为沟通与需求理解优势，适合对接客户和协作"

# ----------------------------------------------------------
constraints:
  irreversible:
    - type: "学历硬门槛"
      detail: >
        高中学历无法更改，绝大多数有学历硬性要求的公司（如国企、大型
        企业、某些外企）的ATS系统会自动屏蔽，此为不可逆。需接受部分
        岗位无法触及的现实。
    - type: "年龄窗口"
      detail: >
        29岁尚未到职业天花板，但随年龄增长，若持续缺乏体系化经验和
        学历，转型成本会递增。当前仍处于可塑期，但不可逆的竞争优势
        积累窗口正在变窄。（非价值判断，纯竞争力角度）
  reversible_weaknesses:
    - "缺乏系统化计算机基础（数据结构、算法、网络），导致常规技术面试通过率低"
    - "缺少行业内权威认证或体系化培训证明，可能降低 HR 的信任度"
    - "外包项目可能缺乏规范化文档和项目总结，难以清晰展示技术深度"
    remedies: "见 execution_priorities"
  red_lines_marked: false  # 当前输出未触碰红线；但下游生成时需审查学历呈现方式

# ----------------------------------------------------------
opportunities:
  advantageous_assets:
    - asset: "Python/LLM/RAG实操经验"
      type: fact
      validation: >
        可用具体外包项目代码仓库、演示链接、客户评价作为可验证资产
        （需求职者提供真实材料，当前未提供，标记为 unverified）
    - asset: "独立交付小型项目的能力"
      type: inference_based_on_fact
      detail: "适合以“全栈交付”为卖点，瞄准中小公司/外包方"
    - asset: "性格开朗"
      type: fact
      utilization: "可转化为客户沟通、需求梳理、团队协作的软技能，适用于外包接单和技术支持"
  domain_openings:
    - "生成式AI市场扩张速度快，大量中小企业需要低成本实施AI应用，学历门槛相对低"
    - "外包平台（Upwork、猪八戒等）和程序员社区接单看重评分与案例，可绕过学历审查"
    - "开源项目贡献和社区技术文章可建立个人声誉，吸引主动机会（内推）"

# ----------------------------------------------------------
execution_priorities:
  - priority: 1
    action: "作品集整理与验证资产构建"
    detail: >
      从现有外包项目中精选2-3个，整理为完整案例（含：问题描述、技术方案、
      GitHub仓库链接、演示页面/截图）。仓库需有README，确保代码整洁。
      这是学历绕行策略的核心支柱。
    outcome_metric: "作品集页面/仓库获得外部访问或星标（量化待定）"
  - priority: 2
    action: "目标岗位精准匹配与投递"
    detail: >
      明确目标城市/远程，圈定5-10家对学历要求灵活的公司（AI初创、
      中小企业技术实施部门、外包公司）。持续在招聘平台（Boss直聘、
      拉勾）和外包平台投递，记录面试反馈。
    outcome_metric: "1个月内获得≥3次技术面试邀请"
  - priority: 3
    action: "补充计算机基础知识"
    detail: >
      系统学习数据结构与算法（重点：数组、链表、哈希表、二叉树、
      常见排序/搜索），达到能通过常规初级面试的水平。可利用
      LeetCode简单/中等题练习。同时补充基本的计算机网络和操作系统
      概念，增强技术栈厚度。
    outcome_metric: "完成至少1门系统课，LeetCode刷题≥50（标记为可验证）"
  - priority: 4
    action: "建立个人品牌与技术输出"
    detail: >
      在掘金/知乎/博客园/MGitHub发布AI应用实操文章（如“从0到1搭建
      一个RAG问答系统”），展示技术深度和教学能力，吸引内推和外包机会。
    outcome_metric: "文章累计阅读量或GitHub星数增长"
  - priority: 5
    action: "争取行业认证（选做）"
    detail: >
      如果预算允许，考取阿里云/华为云等AI或Python相关认证，增加简历
      筛选通过概率。需评估时间与金钱成本，不是必须。
    outcome_metric: "无硬性指标"
  - priority: 6
    action: "面试话术准备"
    detail: >
      提前准备如何回答“学历”问题：不遮掩，转为“自学+交付”的积极叙事。
      模拟技术面试常见问题（算法题、Python基础、LLM原理等）并演练。
    outcome_metric: "模拟面试不少于2次，或录制自评视频"

# ----------------------------------------------------------
validation_metrics:
  - metric: "面试邀请率"
    target: "1个月内技术面试邀请≥3（排除HR自动筛选电话）"
    note: "反映简历策略有效性"
  - metric: "Offer获取"
    target: "3-6个月内获得1个≥6k的录用通知"
    note: "若城市/赛道差异导致未达标，需重新评估定位，不算失败"
  - metric: "技术指标提升"
    target: "能够在白板上手写基本排序/链表操作或无提示通过在线编程测试"
    note: "可验证的硬技能提升"
  - metric: "作品集访问量"
    target: "GitHub仓库获得≥10星或作品页面访客月增≥50"
    note: "验证技术展示策略有效性"

# ----------------------------------------------------------
handoff_to_next_nodes:
  structured_input:
    personal:
      gender: "男"
      age: 29
      education: "高中（具体毕业年份未提供，标记 missing）"
      expected_salary: 6000
      soft_traits: ["性格开朗，沟通能力好"]
    target_roles:
      - "LLM应用开发"
      - "RAG实施工程师"
      - "Python外包开发"
    core_skills:
      - Python
      - LLM集成（提示工程/API调用/本地模型部署）
      - RAG架构（LangChain/LlamaIndex等）
      - 小型项目独立交付
    project_framework: >
      待求职者提供真实项目信息，下游节点可按此模板生成案例描述：
      项目名称、时间、客户/背景、技术栈、个人贡献、成果/演示链接。
      注意：不得编造项目细节，缺失字段标 unknown。
    education_presentation:
      rules:
        - "学历如实写为高中"
        - "置于简历末尾"
        - "不加修饰语（如“肄业”“在职”等不适用），只写事实"
        - "禁止使用大学名称或暗示高等教育"
      suggested_format: >
        [教育经历]
        高中 | [毕业年份-未知] | [学校名称-未知]
    risk_disclaimer_for_downstream:
      - "部分企业存在硬性学历门槛，简历可能被系统自动淘汰；下游不应
         做出‘保证就业’承诺。"
      - "所有案例描述应基于真实经历，不可虚构客户名称或效果数据；若
         无量化结果，写‘参与某某项目，负责某某模块’，不编造转化率等。"
    required_input_for_next_node:
      - "详细的项目列表（名称、技术栈、责任、时间、链接）"
      - "毕业年份、高中学校名称（若求职者愿意提供）"
      - "目标城市/工作形式偏好（远程/onsite）"
      - "GitHub/技术博客链接（若存在）"
```

*ponytail: 纯结构化规划，没写正文，没编数字，没碰红线。下游拿这些字段组装材料即可。*

## Judge

### Rubric Hits

- 明确学历对entry-level技术岗影响，不做人格或能力价值判断
- 圈定6k对应的可投岗位类型
- 把AI编程经验转成可验证竞争力
- 区分不可逆短板、可补短板和叙事绕行策略
- 输出方向性结论，不写简历正文
- 学历绕行策略建立如实呈现基础上

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 严格对齐节点通用契约，输出字段完整
- 事实与推断明确区分，缺失信息标记unknown/unverified
- 红线条款在策略中以forbidden字段显式禁止，防止下游误用
- 将可验证竞争力落为具体验证动作和下游输入模板
- 对年龄等敏感维度附加‘非价值判断’说明，控制安全边界

### Prompt Patch Suggestions

- 无
