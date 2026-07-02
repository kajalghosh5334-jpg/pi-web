import type { WorkflowDefinition, WorkflowInputContract } from "@/lib/types";

export const DEFAULT_INPUT_CONTRACTS: Record<string, WorkflowInputContract> = {
  "fetch-summarize": {
    version: 1,
    mode: "single-run",
    title: "资料搜集与摘要输入",
    description: "一次性提交调研对象、来源材料和输出要求。Fetch 节点只搬运资料，Structure 节点结构化，Judge 节点输出影响判断。",
    missingPolicy: "mark_missing",
    fields: [
      { id: "task_goal", label: "任务目标", type: "textarea", required: true, placeholder: "例如：整理某行业近 7 天融资、政策和竞品变化，输出结构化简报。" },
      { id: "source_materials", label: "资料/原文/搜索结果", type: "textarea", required: true, placeholder: "粘贴来源文本、工具结果、表格、网页摘录；没有资料时写明希望检索的对象和范围。" },
      { id: "links", label: "来源链接", type: "links", placeholder: "每行一个链接，可留空。" },
      { id: "time_window", label: "时间窗口", type: "text", placeholder: "例如：过去 7 天 / 2025H1 / 2026-06-30 至 2026-07-02" },
      { id: "output_format", label: "输出格式", type: "textarea", required: true, placeholder: "例如：表格 + 摘要；包含来源、置信度、待复核点。" },
    ],
  },
  "classify-route": {
    version: 1,
    mode: "single-run",
    title: "分类路由输入",
    description: "一次性提交待分类条目、标签体系和处理规则。低置信度或高风险条目必须进入审查。",
    missingPolicy: "mark_missing",
    fields: [
      { id: "task_goal", label: "任务目标", type: "textarea", required: true, placeholder: "例如：将评论区新增评论分级并生成可审查回复队列。" },
      { id: "items_to_classify", label: "待处理条目", type: "textarea", required: true, placeholder: "粘贴工单、评论、票据或对话列表。" },
      { id: "label_schema", label: "标签/路由规则", type: "textarea", required: true, placeholder: "例如：好评/质疑/广告/投诉；低置信度转人工。" },
      { id: "draft_policy", label: "自动处理草稿规则", type: "textarea", placeholder: "哪些条目可生成草稿，哪些必须人工审核。" },
      { id: "risk_rules", label: "风险审查规则", type: "textarea", placeholder: "例如：投诉、隐私、交易、法律风险必须 blocked/manual_review。" },
    ],
  },
  "extract-writeback": {
    version: 1,
    mode: "single-run",
    title: "字段抽取与写回输入",
    description: "一次性提交原始材料、目标字段和写回约束。缺失必填字段时阻塞，不默认为空或 0。",
    missingPolicy: "block",
    fields: [
      { id: "task_goal", label: "任务目标", type: "textarea", required: true, placeholder: "例如：从通话转写抽取 CRM 字段并生成写回 payload。" },
      { id: "raw_materials", label: "原始材料", type: "textarea", required: true, placeholder: "粘贴通话、发票、表单、邮件、工单等原文。" },
      { id: "target_schema", label: "目标字段/schema", type: "textarea", required: true, placeholder: "列出字段名、类型、必填项、枚举值、校验规则。" },
      { id: "writeback_rules", label: "写回/幂等规则", type: "textarea", placeholder: "例如：idempotency_key 规则、失败重试、禁止默认值。" },
      { id: "output_format", label: "输出格式", type: "textarea", required: true, placeholder: "例如：payload JSON + validation_errors + needs_review。" },
    ],
  },
  "generate-variants": {
    version: 1,
    mode: "single-run",
    title: "变体生成输入",
    description: "一次性提交目标、素材和约束。Plan 节点定策略，Generate 节点产出变体，Review 节点做质量门禁。",
    missingPolicy: "mark_missing",
    fields: [
      { id: "task_goal", label: "任务目标", type: "textarea", required: true, placeholder: "例如：为一个广告活动生成 5 组标题和 CTA。" },
      { id: "source_materials", label: "素材/事实边界", type: "textarea", required: true, placeholder: "粘贴产品事实、定位、受众、已有正文或素材。" },
      { id: "variant_requirements", label: "变体要求", type: "textarea", required: true, placeholder: "数量、平台、风格、长度、A/B 维度。" },
      { id: "brand_or_risk_rules", label: "品牌/风险规则", type: "textarea", placeholder: "禁用词、不能编造的数据、合规要求。" },
      { id: "output_format", label: "输出格式", type: "textarea", placeholder: "例如：表格列出版本、适用场景、风险标注。" },
    ],
  },
  "monitor-alert": {
    version: 1,
    mode: "single-run",
    title: "事件窗口与告警输入",
    description: "一次性提交监控对象、时间窗口、来源和阈值。该 Workflow 是单次窗口判断，不是后台常驻守护。",
    missingPolicy: "mark_missing",
    fields: [
      { id: "task_goal", label: "任务目标", type: "textarea", required: true, placeholder: "例如：判断过去 48 小时是否出现重大事故或监管预警。" },
      { id: "monitor_targets", label: "监控对象", type: "textarea", required: true, placeholder: "品牌、关键词、商品、竞品、平台、账号等。" },
      { id: "time_window", label: "时间窗口", type: "text", required: true, placeholder: "例如：过去 48 小时 / 2026-06-30 至 2026-07-02" },
      { id: "source_materials", label: "事件/讨论/指标资料", type: "textarea", required: true, placeholder: "粘贴抓取结果、帖子、指标、新闻或监管来源。" },
      { id: "alert_thresholds", label: "告警阈值与升级条件", type: "textarea", required: true, placeholder: "定义 P0/P1/P2/P3 或轻/中/重规则。" },
    ],
  },
};

export function defaultInputContractForTemplate(templateType: string | undefined): WorkflowInputContract {
  return DEFAULT_INPUT_CONTRACTS[templateType || ""] || DEFAULT_INPUT_CONTRACTS["fetch-summarize"];
}

export function inputContractForWorkflow(workflow: Partial<WorkflowDefinition>): WorkflowInputContract {
  return workflow.inputContract?.fields?.length
    ? workflow.inputContract
    : defaultInputContractForTemplate(workflow.templateType);
}

export function initialInputValues(contract: WorkflowInputContract, workflow: Partial<WorkflowDefinition>) {
  return Object.fromEntries((contract.fields || []).map((field) => [
    field.id,
    field.id === "task_goal" ? (workflow.description || workflow.name || "") : "",
  ]));
}

export function formatWorkflowInput(contract: WorkflowInputContract, values: Record<string, string>) {
  const lines = [
    contract.title || "Workflow 输入资料包",
    contract.description || "",
    `missingPolicy: ${contract.missingPolicy || "mark_missing"}`,
    "",
    ...contract.fields.map((field) => {
      const value = (values[field.id] || "").trim();
      return `## ${field.label}${field.required ? " (required)" : ""}\n${value || "[missing]"}`;
    }),
  ];
  const additionalNotes = (values.additional_notes || "").trim();
  if (additionalNotes) lines.push("", `## 补充说明\n${additionalNotes}`);
  return lines.filter((line, index) => index < 2 ? Boolean(line) : true).join("\n");
}
