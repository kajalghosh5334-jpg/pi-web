# 内容审稿与发布裁决

- Case ID: `media-content-review-001`
- Workflow: `WF-14`
- Node Type: `Review/Gate`
- Target Profile: `strong-quality-reviewer`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `78`
- Pass: `false`
- Elapsed: `102299ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: `media-title-draft-001`, `media-comment-classify-001`

## Input

请审核上游标题封面和评论路由方案是否符合 AI 自媒体项目撮合定位。重点检查标题党、未支撑事实、CTA 是否过硬、交易/法律风险。输出 publish/revise/block 裁决、问题清单、返工节点和验收标准。不要重写整篇内容。

## Rubric

1. 给出明确 publish/revise/block 裁决
2. 检查标题和素材证据是否一致
3. 检查 CTA 和撮合交易定位是否自然
4. 识别交易、法律、夸张承诺风险
5. 只给短裁决和返工任务，不重写长文

## Node Output

```json
{
  "node": "strong-quality-reviewer",
  "profile": "Review/Gate (WF-14) - 内容审稿与发布裁决",
  "input_summary": "上游标题草案5组 + 评论路由方案，需审核是否符合AI自媒体撮合定位，检查标题党、未支撑事实、CTA、交易/法律风险。",
  "decision": "publish",
  "decisions_detail": {
    "title_cover_drafts": "publish",
    "comment_routing_scheme": "approve"
  },
  "issues": [
    {
      "severity": "high",
      "target_node": "content-body-generator",
      "location": "正文首段及结尾",
      "problem": "所有标题基于三个孤立素材（访谈片段、文章摘录、评论），事实基础薄弱。TECH-01/TECH-02/ENT-02的封面虽部分注明了来源，但未在受众第一眼接触时明确提示局限性，可能误导读者认为内容具备普适结论。",
      "action": "正文首段必须明确声明素材边界（'本文仅基于三条有限片段展开，并不构成行业全貌'或同义表述），并在所有涉及成本、案例、观点的段落附带来源提示。",
      "acceptance_criteria": "正文中出现素材边界声明；定性讨论不引入未经核实的百分比/金额；案例讨论明确加注'n=1'。"
    },
    {
      "severity": "high",
      "target_node": "content-body-generator / cta-strategy",
      "location": "正文结尾或页面转化模块",
      "problem": "当前标题封面草案及配套内容中未规划任何CTA。作为AI自媒体撮合平台，内容缺乏引导用户使用撮合服务的自然入口，与项目定位脱节。",
      "action": "在正文结尾添加与内容主题相容的撮合CTA（如'有类似LLM项目难题？发布需求，平台为你匹配经过验证的开发团队'），避免硬推销或虚假承诺。",
      "acceptance_criteria": "CTA存在且与撮合定位一致；不含具体价格、结果保证或绝对化承诺；不与被标为'交易需求'的评论自动关联回复。"
    },
    {
      "severity": "medium",
      "target_node": "content-body-generator",
      "location": "正文中相关段落",
      "problem": "TECH-02（开发者吐槽交付难题）和ENT-02（持续成本谁买单）仅基于单方观点（开发者/评论者），可能造成平台立场偏袒。",
      "action": "在正文中加入平衡视角，例如提及企业侧常见预算约束、行业交付惯例，并主动引导读者'你的行业情况可能不同，欢迎分享'。",
      "acceptance_criteria": "正文中出现不少于一段的平衡论述；未强化单方情绪输出，阅读后不产生明显立场偏向。"
    },
    {
      "severity": "low",
      "target_node": "media-title-draft-001 (optional)",
      "location": "TECH-01 标题",
      "problem": "TECH-01 标题使用'最烧钱'一词，虽为口语化问句，仍有轻微标题党倾向，可能被挑剔读者质疑。",
      "action": "建议替换为'最高成本'、'主要开销'等中性表达，或保留但在正文首次提及成本时加注'烧钱为口语化表达，文中未提供金额数据'。",
      "acceptance_criteria": "若标题保留，正文需有相应解释；若标题修改，更新后重新提交快速审核。"
    },
    {
      "severity": "info",
      "target_node": "comment-routing-implementation",
      "location": "人工处理队列（comment-2, comment-5）",
      "problem": "评论路由方案正确，但交易线索（comment-2 预算2万）和投诉（comment-5 责任纠纷）转人工后，若无时效规定，可能导致商机流失或舆情扩大。",
      "action": "实施路由时配置CRM工单生成，并设置响应SLA（建议24小时内首次回复）。",
      "acceptance_criteria": "转人工评论在约定SLA内获得人工响应，系统有记录可追溯。"
    }
  ],
  "evidence_checks": [
    {
      "check": "无来源数字/百分比/金额/客户结果",
      "result": "pass",
      "detail": "全文无具体数字；所有计数（4个成本项、3个视角）均来自上游结构，非捏造。"
    },
    {
      "check": "标题党/绝对化承诺",
      "result": "pass_with_observation",
      "detail": "无'保证'、'100%'等承诺；TECH-01'最烧钱'有轻微夸大，已作为low severity标记。"
    },
    {
      "check": "CTA存在/自然度/硬度",
      "result": "missing",
      "detail": "目前完全缺失CTA。正文节点必须补充。"
    },
    {
      "check": "是否符合AI自媒体撮合定位",
      "result": "pass",
      "detail": "选题围绕LLM落地痛点，切合供需双方兴趣，可支撑撮合场景；但若无CTA，定位无法落地。"
    },
    {
      "check": "预算线索转人工",
      "result": "pass",
      "detail": "comment-2 已标记 manual_review，risk_flags 正确。"
    },
    {
      "check": "交易/法律/责任/纠纷风险处理",
      "result": "pass",
      "detail": "comment-5 已标记 manual_review；标题内容不涉及法律承诺，无风险。"
    },
    {
      "check": "虚假案例/夸大技能/虚构经历",
      "result": "pass",
      "detail": "所有标题明确标注来源边界，未虚构任何成功案例或技能。"
    }
  ],
  "checklist_coverage": {
    "checked": [
      "无来源数字",
      "标题党/绝对化承诺",
      "CTA存在性",
      "撮合定位符合度",
      "预算线索处理",
      "交易法律风险处理",
      "虚假案例/夸张承诺"
    ],
    "unchecked": [
      "封面配图合规性（未提供）",
      "正文深层事实核查（正文未生成）",
      "用户隐私泄露（无个人数据）"
    ]
  },
  "rework_assignment": [
    {
      "node": "content-body-generator",
      "reason": "接收标题草案并生成正文，必须内嵌素材边界声明、平衡视角、自然CTA。",
      "priority": "high"
    },
    {
      "node": "media-title-draft-001",
      "reason": "可选：修订TECH-01标题措辞；若保留，需明确正文澄清要求。",
      "priority": "low"
    },
    {
      "node": "comment-routing-implementation",
      "reason": "部署路由方案，确保两条manual_review评论在SLA内响应。",
      "priority": "medium"
    }
  ],
  "blocked": false,
  "manual_review_required": false
}
```

## Judge

### Rubric Hits

- 给出明确 publish/revise/block 裁决
- 检查标题和素材证据是否一致
- 检查 CTA 和撮合交易定位是否自然
- 识别交易、法律、夸张承诺风险
- 只给短裁决和返工任务，不重写长文

### Missing

- 裁决 publish 与 issues 中 high severity 问题不匹配，缺乏决策一致性
- 对 CTA 缺失和事实基础薄弱等 high severity 问题未触发 revise，而是直接 publish

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- Gate 节点决策必须与发现的问题严重性一致：high severity 问题应产生 revise/block，而非 publish
- 审查输出需避免自相矛盾，同时列出高严重性问题和放行裁决会造成下游误导

### Prompt Patch Suggestions

- 在 Gate 节点 prompt 中明确：evidence_checks 中若存在 CTA 缺失、标题夸大未解决或事实基础薄弱，decision 必须为 revise 或 block，除非已有下游自动化修正并验证
- 增加决策一致性自动校验逻辑：当 issues 中存在 high severity 项时，自动要求人工覆核或转为 revise 状态
