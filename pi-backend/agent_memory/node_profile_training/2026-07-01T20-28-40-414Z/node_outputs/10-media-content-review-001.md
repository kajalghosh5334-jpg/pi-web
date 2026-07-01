# 内容审稿与发布裁决

- Case ID: `media-content-review-001`
- Workflow: `WF-14`
- Node Type: `Review/Gate`
- Target Profile: `strong-quality-reviewer`
- Model: `opencode-go/deepseek-v4-pro`
- Score: `93`
- Pass: `true`
- Elapsed: `84169ms`
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
  "decision": "revise",
  "comment_routing_decision": "approve_with_note",
  "issues": [
    {
      "severity": "medium",
      "target_node": "media-title-draft-001",
      "location": "V4",
      "problem": "封面'风险地图'及标题中'不敢写在合同里的风险'的表述，基于仅3个来源的有限视角，可能被读者误解为系统性正式风险评估报告，存在夸张承诺风险。",
      "action": "添加脚标或补充文案说明（如'基于有限样本的案例整合，非正式风险评估'），或弱化'风险地图'措辞，改为'风险拼图'/'风险碎片'等更软性的比喻。",
      "acceptance_criteria": "修改后内容不产生系统性/正式风险评估报告的暗示，且非专业读者不会误判信息权威性。"
    },
    {
      "severity": "medium",
      "target_node": "media-title-draft-001",
      "location": "V2",
      "problem": "标题'客户只想要一个 demo，后续维护谁买单？'及封面文案仅基于开发者单方观点（评论摘录），缺乏企业主侧验证，可能损害平台撮合场景的中立性，引发企业主读者抵触。",
      "action": "补充立场说明，如'本文主要反映开发者视角，企业主立场需进一步调研'，或等待补充甲方调研数据后再定稿；也可暂时降级该variant。",
      "acceptance_criteria": "文案不隐含对企业主的负面定论，并明确标注信息源立场局限。"
    },
    {
      "severity": "low",
      "target_node": "media-title-draft-001",
      "location": "all variants",
      "problem": "全部标题/封面基于仅3个上游事实，覆盖面和代表性有限，可能给读者行业全貌假象。",
      "action": "在发布内容时（正文或导语）添加免责声明：'本文案例整合自有限样本，不构成行业统计结论'。",
      "acceptance_criteria": "样本局限性在读者接触主体内容前即被明确告知。"
    },
    {
      "severity": "info",
      "target_node": "media-comment-classify-001",
      "location": "item 5 (投诉/质疑边界)",
      "problem": "label_conflict指出'投诉'与'质疑'边界模糊；当前按高风险原则分类触发人工审核，但下游需核实是否确有投诉经历。",
      "action": "人工审核时确认用户评论的具体意图；若无实际投诉案例则降级为'质疑'并采用不含法律责任承诺的auto_reply模板。",
      "acceptance_criteria": "最终标签精确反映用户意图，平台不会因误标而采取过激或不当回应。"
    }
  ],
  "evidence_checks": {
    "source_fact_checks": "verified: all titles/covers map to provided upstream facts; no unsupported factual claims detected beyond those already flagged by upstream self-check.",
    "number_checks": "verified: no specific numbers, percentages, monetary amounts, or client results present. Quantity words ('四','三个') are non-quantitative enumerations, not metric promises.",
    "experience_certification_checks": "not applicable: no claims of personal certifications, academic degrees, positions, or skill proficiency.",
    "cta_check": "cover copies serve descriptive/explanatory purpose without explicit call-to-action. No hard-sell or forced CTA detected. If platform positioning requires a soft CTA ('留下需求'等), this should be addressed by content drafting node, not title/cover draft."
  },
  "checklist_coverage": {
    "checked": {
      "无来源数字/百分比/金额/客户结果": "passed",
      "标题党/绝对化承诺": "V1 self-declared '非标题党'; V4 '风险地图' flagged as potential exaggeration, other variants descriptive/interrogative, no absolute promises",
      "CTA是否存在/自然/过硬": "no explicit CTA present; soft CTA in V5 ('供售前和技术参考') is natural; if business requires CTA, refer to content writing node",
      "是否符AI自媒体项目撮合定位": "符合：内容围绕LLM落地成本与风险，有助于撮合场景信任建设",
      "预算线索是否转人工": "passed: comment 2 routed to manual_review",
      "交易/法律/责任/纠纷风险是否转人工或阻塞": "passed: comment 2 (transaction), comment 5 (legal liability) correctly routed to manual_review; titles do not contain direct legal/transaction risk"
    },
    "unchecked_or_deferred": {
      "正文全文CTA与交易引导": "deferred to content drafting node, not present in current title/cover draft",
      "文章全文事实核查": "deferred, current scope limited to title/cover evidence"
    }
  },
  "rework_assignment": {
    "node_to_revise": "media-title-draft-001",
    "tasks": [
      "V4: weaken '风险地图' implication and add disclaimer of limited perspective",
      "V2: add source stance disclaimer or deprioritize until employer-side validation obtained",
      "All variants: add sample limitation note in final published content"
    ],
    "resubmit_to": "media-content-review-001"
  }
}
```

## Judge

### Rubric Hits

- 给出明确 publish/revise/block 裁决（decision: revise）
- 检查标题和素材证据是否一致（source_fact_checks）
- 检查 CTA 和撮合交易定位是否自然（cta_check）
- 识别交易、法律、夸张承诺风险（issues 标记风险地图、单方视角、样本局限；checklist 覆盖风险项）
- 只给短裁决和返工任务，不重写长文（issues 精炼，rework_assignment 为任务列表）

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 审查输出结构清晰，检查清单覆盖全面，可作为高质量门禁输出范例。
- comment_routing_decision 字段超出通用契约 output 定义，未来可考虑移除或统一到 decision 字段以避免输出膨胀。

### Prompt Patch Suggestions

- 在节点提示中明确要求输出仅包含契约定义的字段，避免附加决策（如 comment_routing_decision），或将其纳入标准字段。
