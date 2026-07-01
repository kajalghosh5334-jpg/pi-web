# JD 匹配分析

- Case ID: `job-jd-analyze-001`
- Workflow: `WF-4`
- Node Type: `Analyze/Judge`
- Target Profile: `research-report-analyst`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `78`
- Pass: `false`
- Elapsed: `95985ms`
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
  "_node_type": "jd-match-analyzer",
  "_workflow": "WF-4",
  "_target_profile": "research-report-analyst",
  "analysis_items": [
    {
      "jd_requirement": "Python 基础扎实",
      "candidate_evidence": "自动化脚本、RAG demo",
      "verdict": "命中",
      "claim_type": "inference",
      "confidence": 0.8,
      "counter_evidence": "不熟 Django，Python 生态广度待验证",
      "recommendation": "简历突出文件处理、网络请求、数据结构等 Python 基础题的准备；将 RAG demo 中的核心技术难点（Token 管理、相似度检索）写出深度以证明基础扎实。"
    },
    {
      "jd_requirement": "熟悉接口调用",
      "candidate_evidence": "RAG 调用 LLM API，企业问答外包必然涉及数据接口",
      "verdict": "命中",
      "claim_type": "inference",
      "confidence": 0.85,
      "counter_evidence": "未提供接口协议细节 (REST/WebSocket)",
      "recommendation": "项目描述中明确写出调用的 API 名称、协议、认证方式、处理过的异常场景。"
    },
    {
      "jd_requirement": "了解 OpenCV 加分",
      "candidate_evidence": "未提及 CV/图像处理经验",
      "verdict": "缺漏",
      "claim_type": "fact",
      "confidence": 0.95,
      "counter_evidence": "简历未写不等于完全不懂，但当前输入无此信息",
      "recommendation": "短期（3天）补一个极小项目（摄像头读取→处理→输出）写进简历；或面试时承认概念了解但无实战，强调 Python 学习迁移能力。"
    },
    {
      "jd_requirement": "学历（大专及以上优先）",
      "candidate_evidence": "高中学历",
      "verdict": "屏障（弱化项）",
      "claim_type": "fact + assumption",
      "confidence": 0.98,
      "counter_evidence": "JD 书写为 '优先'，并非 '必须'，有通过初筛的可能",
      "recommendation": "① 简历弱化学历位置（置末）。② 面试准备 '自学驱动、项目验证的另类教育路径' 叙事。③ 投递前确认本岗位无硬性学历门槛。若投递后多日无回应（已读不回），说明被优先级规则过滤，需加大此类公司投递密度以对冲通过率。",
      "red_line_check": "PASS - 未建议隐藏或伪造学历，仅建议弱化位置与叙事转化。"
    },
    {
      "jd_requirement": "有项目 Demo 加分",
      "candidate_evidence": "RAG 知识库 demo + 企业资料问答外包",
      "verdict": "强命中（核心差异化优势）",
      "claim_type": "fact",
      "confidence": 0.95,
      "counter_evidence": "Demo 质量和完整性未知（上游标记 '缺失数据'）",
      "recommendation": "这是翻盘点。必须标准化为作品集（GitHub README + 截图 + 演示视频/部署链接）。面试必带，主动展示。"
    },
    {
      "jd_requirement": "能和业务方沟通需求",
      "candidate_evidence": "性格开朗 + 外包经验（本质上就是跟客户做需求对接）",
      "verdict": "命中",
      "claim_type": "inference",
      "confidence": 0.7,
      "counter_evidence": "未提供需求沟通的具体案例或冲突解决经历",
      "recommendation": "准备 1 个沟通故事：'业务方说要 A 功能，我分析后建议 B 方案，最终上线验证 B 更优'。展示需求分析、预期管理和交付能力。"
    },
    {
      "jd_requirement": "Docker/AI 工具部署（公司官网隐含技术栈）",
      "candidate_evidence": "仅部署过一次",
      "verdict": "弱化项",
      "claim_type": "fact",
      "confidence": 0.95,
      "counter_evidence": "JD 未明确要求 Docker，但公司技术栈含 '轻量化模型部署'",
      "recommendation": "把 RAG demo 容器化（写 Dockerfile + docker-compose.yml 并放到 GitHub）。半天工作量，工程化能力证明收益极高。"
    }
  ],
  "gap_handling": {
    "technical_gaps": {
      "OpenCV": "短期突击项目 or 面试诚实补位说明",
      "Docker": "立即容器化现有项目，成本低收益高",
      "Django": "无需补，准备框架选择话术（Flask 敏捷 vs Django 全功能，表示愿意学）"
    },
    "structural_gaps": {
      "学历": "弱化位置 + 叙事转化 + 高频投递对冲过滤"
    }
  },
  "overall_confidence": "medium-low (JD 来源为片段/面经，公司研究为弱提取，候选人信息为摘要，核心假设依赖置信度低的数据层)",
  "escalation_flag": false
}
```
→ Skipped: 简历正文/面试QA生成、公司注册信息推断、未验证项目细节补全。 Add when: 下游简历节点/面试准备节点接走本分析结果作为输入时。

## Judge

### Rubric Hits

- 逐条对照JD输出命中、缺漏、弱化（主要条目已涵盖，但缺少Django/Flask独立分析）
- 明确学历是优先项而非硬卡
- 把RAG/脚本/外包项目映射到岗位需求
- 对不熟Django、Docker经验弱等问题给可补策略
- 区分事实、推断、建议和置信度

### Missing

- 未在analysis_items中单独分析Django/Flask，未将Flask作为Web基础弱化Django缺口
- 学历建议弱化位置可能被误解为隐藏，需更谨慎措辞
- 未充分利用Flask经验作为Django缺口的正面替代叙事

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 模型倾向于忽略JD中非主要技术栈的映射，需提示覆盖所有JD关键词
- 学历处理建议虽然合理但措辞可能被HR视为不诚实，需校准

### Prompt Patch Suggestions

- 在提示中明确要求逐条分析JD中每个技术需求，包括隐含或备选技术栈
- 明确要求对于缺漏技能，优先寻找候选人已有的相近经验进行弱化映射
