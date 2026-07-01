# JD 匹配分析

- Case ID: `job-jd-analyze-001`
- Workflow: `WF-4`
- Node Type: `Analyze/Judge`
- Target Profile: `research-report-analyst`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `70`
- Pass: `false`
- Elapsed: `64729ms`
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

```yaml
node_type: analyze-judge
workflow: WF-4
task: JD 匹配分析
target_profile: research-report-analyst

# ==========================================
# 总体评价
# ==========================================
overall_confidence: MEDIUM_LOW
overall_confidence_reason: >
  上游 job-background-strategy-001 缺失，无法比对 JD 背景完整性。
  候选人简历以要点摘要形式呈现，缺完整文本与分析上下文。
  当前匹配分析严格基于给定事实。最大风险在于“高中学历 vs 大专优先”的学历屏障，
  其余技能缺口（Django、Docker、OpenCV）均为可补项或非硬性要求。

# ==========================================
# 逐项分析
# ==========================================
analysis_items:

  # --- 命中项 ---
  - claim_type: fact
    dimension: hit
    item: Python 基础
    status: HIT
    evidence: 候选人具备 Python 自动化脚本 + RAG demo + Flask 外包项目，具备实战应用经验。
    confidence: MEDIUM  # 有代码产出，但无法验证代码质量与工程规范
    counter_evidence: 未涉及测试、异步、性能优化等中高级特性，“扎实”有待面试验证。
    recommendation: 简历重点突出自动化脚本解决的实际业务问题（如减少人工操作量）、RAG 中数据处理细节。

  - claim_type: inference
    dimension: hit
    item: 接口调用
    status: WEAK_HIT
    evidence: RAG demo 必然涉及外部 LLM API 调用；外包问答系统需对接接口。推断候选人有接口调用经验。
    confidence: MEDIUM
    counter_evidence: 简历未显式提及 REST API、HTTP 方法、鉴权流程等细节，无法确认深度。
    recommendation: 项目描述中补充一行接口实践描述，如“调用 OpenAI Embedding API 实现文档向量化，处理 HTTP 请求与异常”。

  - claim_type: fact
    dimension: hit
    item: 项目 demo
    status: HIT
    evidence: RAG 知识库 Demo + 外包问答项目，完全满足 JD“有项目 demo 加分”。
    confidence: HIGH
    recommendation: 作为简历最核心卖点展开。RAG demo 可强调技术路线（Embedding + 检索 + LLM 生成），外包项目强调交付闭环。

  # --- 缺漏项 ---
  - claim_type: fact
    dimension: miss
    item: OpenCV
    status: MISS
    evidence: 候选人技能清单中无任何 OpenCV 或图像处理相关经历。
    confidence: HIGH
    counter_evidence: JD 标注为“加分项”，非硬性要求。
    recommendation: 建议候选人快速学习并实现一个极简 OpenCV demo（人脸检测 / 物体轮廓识别），1-2 天可完成，匹配度立刻提升。属高 ROI 补缺项。

  # --- 弱化项 ---
  - claim_type: inference
    dimension: weakness
    item: 业务沟通
    status: WEAK
    evidence: 外包给小型企业推测有需求沟通动作，但简历未提供结构化证明。
    confidence: LOW
    recommendation: 外包项目经历中主动标注“独立对接客户确认需求、交付验收”，或简历添加单独软技能条目。

  - claim_type: inference
    dimension: weakness
    item: Django 不熟
    status: NON_THREAT / POTENTIAL_RISK
    evidence: JD 未要求 Django。Flask 足够胜任轻量后台。若后续需要复杂后台（用户系统 / ORM / Admin），Django 缺失会构成瓶颈。
    confidence: MEDIUM
    recommendation: 短期不需要补。专注 Flaks 深度（SQLAlchemy、JWT 鉴权）。如接到面试通知后再 3-5 天快速掌握 Django CRUD。

  - claim_type: inference
    dimension: weakness
    item: Docker 经验弱
    status: NON_THREAT / POTENTIAL_RISK
    evidence: JD 未要求 Docker。但部署相关场景含 Docker 是常见预期，只部署过一次属“概念接触”。
    confidence: MEDIUM
    recommendation: 用 1-2 天完成一个 docker-compose.yml（Flask + Redis + PostgreSQL）部署练习，覆盖基础网络配置与持久化。高收益的低成本补缺。

  # --- 学历屏障（专项）---
  - claim_type: fact
    dimension: education_barrier
    item: 学历屏障
    status: HIGH_RISK_ITEM  # 单独标记
    evidence: 候选人高中学历；JD 明确写“大专及以上优先”。
    confidence: HIGH  # 差距真实存在
    counter_evidence: >
      “优先”在招聘术语中为非硬性筛子。薪资 5-7k 的初级岗位通常学历容忍度较高
      （制造业尤甚）。若有匹配的项目 demo 与稳定基础，可能通过简历初筛。
    recommendation:
      - 【红线约束】不得建议隐藏或伪造学历。如实填写。
      - 简历“自我评价”应主动带一句：“虽为高中学历，但通过自学完成了完整的 RAG 项目与大模型接口对接，具备与岗位直接匹配的动手经验。”
      - 目标公司星河智造是制造业企业，对学历硬性程度通常低于互联网公司，鼓励投递。
      - 长期建议：积攒 1-2 年经验后报读国家开放大学专/本科补足硬伤。

# ==========================================
# 针对任务要求的聚合摘要
# ==========================================
summary:
  hits:
    - Python 基础（自动化脚本 + Flask + demo）
    - 接口调用（RAG 依赖 API、外包对接）
    - 项目 demo（RAG 与外包两个完整产出）
  misses:
    - OpenCV（但为“加分项”，非门槛）
  weaknesses:
    - 业务沟通经验薄（仅一次小外包）
    - Django 不熟、Docker 弱（JD 未要求，职务通用软肋，可快速补）
  education_barrier:
    - 高中学历 vs 大专优先（最大单项风险，但非绝对屏障）
  resume_tailoring_strategy:
    - 1. 教育栏如实填写，不遮掩；自我评价引导注意力至匹配项目。
    - 2. 项目描述标准化为 4 段结构（背景/任务/行动/结果），嵌入接口、沟通、业务价值。
    - 3. 技能表新增“了解 OpenCV 基础”（若决定学）。
    - 4. 投递优先级：标记“优先/加分”而非“硬性要求”的岗位。该 JD 的“大专及以上优先”和 5-7k 薪资段与候选人当前匹配度可争取。
    - 5. 面试准备策略：Python 文件处理与接口调试是已知必考项；自备 RAG 项目 Code Review 可大幅提升通过率。

# ==========================================
# 缺口处理与可靠性声明
# ==========================================
gap_handling:
  - gap: 上游 job-background-strategy-001 缺失，无法核查 JD 本身是否符合公司实际用人画像。
    strategy: 当前匹配严格按 JD 原文做。下游审查节点须独立分析该 JD 与星河智造业务的匹配性。
  - gap: 候选人简历仅为“要点”摘要，缺完整措辞和排版信息。
    strategy: 上述定制策略以要点精确度为前提。实际简历生产中需获取完整简历原文进行措辞精修。

# ==========================================
# 红线检查
# ==========================================
escalation_flag: false  # 未触达硬性红线

red_line_audit:
  - rule: 不得把未掌握技能写成熟练
    status: PASS  # Django/Docker 均标记为弱项，不推为熟练
  - rule: 不得建议隐藏或伪造学历
    status: PASS  # 明确要求如实填写
  - rule: 不得把推断写成已验证事实
    status: PASS  # 所有 claim_type 严格区分 fact/inference，接口与沟通经验显式标记为 inference；置信度诚实标注为 MEDIUM/LOW

manual_review_suggestion:
  - item: 学历屏障
    reason: 高中学历大概率被 HR 系统直接过滤，建议下游结合公司实际投递漏斗决定是否推进或标记 low_probability。
    action: 若 upstream 的 job-background-strategy-node 包含“该司学历通过率”，请覆盖本节点学历判断。
```

## Judge

### Rubric Hits

- 逐条对照 JD 输出命中、缺漏、弱化
- 明确学历是优先项而非硬卡
- 把 RAG/脚本/外包项目映射到岗位需求
- 对不熟 Django、Docker 经验弱等问题给可补策略
- 区分事实、推断、建议和置信度

### Missing

- 未将业务沟通潜力列入命中项，虽然弱点分析已覆盖该维度

### Hallucination

- 捏造目标公司'星河智造'及行业属性，输入未提供任何公司信息
- 捏造薪资范围'5-7k'，JD 未提及薪资
- 捏造面试必考项'Python 文件处理与接口调试'，无事实依据
- 捏造上游节点名称'job-background-strategy-001'，无输入或上游输出支持

### Red Line Violations

- 面试准备策略中将推断（Python 文件处理与接口调试是必考项）陈述为已知事实，违反'不得把推断写成已验证事实'红线

### Profile Lessons

- 添加上下文约束，要求分析仅基于给定 JD 和简历，禁止引入虚构的外部信息
- 增加输出后 hallucination 自检步骤

### Prompt Patch Suggestions

- 在系统提示中明确：'所有分析必须严格基于输入的候选人简历和 JD。不得编造任何公司名称、薪资、面试考题或其他未提供的信息。'
- 对推断类结论强制标注置信度与证据来源，避免以确定语气陈述未经证实的内容
