import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import type { WorkflowDefinition, WorkflowTaskDefinition } from "@/lib/types";
import { defaultInputContractForTemplate } from "@/lib/workflowInputContracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgentProfileItem {
  id: string;
  name?: string;
  description?: string;
  defaultModel?: string;
  projectConfig?: {
    modelTier?: string;
    domain?: string;
    roleInWorkflow?: string;
    profileKind?: string;
    generatedStatus?: string;
    sourceNodeType?: string;
    nodeOutputArtifact?: string;
    nodeContract?: {
      output?: unknown;
      redLines?: unknown;
    };
  };
}

interface Recommendation {
  workflow: WorkflowDefinition;
  score: number;
  reasons: string[];
}

interface FlashWorkflowDecision {
  kind?: "workflow-generation";
  decision?: "use-existing" | "customize-template" | "create-from-profiles";
  workflowId?: string;
  matchReason?: string;
  generationReason?: string;
  modelCombinationId?: string;
  trainedChainId?: string;
  trainedProfileIds?: string[];
  scenarioId?: string;
  templateType?: string;
  domain?: string;
  outputKind?: string;
  needsHumanReview?: boolean;
  materialPolicy?: string;
  inputFields?: string[];
  patchSummary?: string[];
  nodeTunings?: NodeTuning[];
  tunedTemplate?: {
    templateType?: string;
    baseTemplateId?: string;
    patchSummary?: string[];
  };
  workflowDraft?: Partial<WorkflowDefinition>;
  workflow?: Partial<WorkflowDefinition>;
  tasks?: WorkflowTaskDefinition[];
  profilePlan?: Array<{
    id: string;
    name?: string;
    tier?: string;
    model?: string;
    role?: string;
  }>;
  guidance?: string[];
}

interface NodeTuning {
  id?: string;
  name?: string;
  purpose?: string;
  requiredInputs?: string[];
  outputSchema?: string[];
  riskRules?: string[];
  acceptance?: string[];
}

interface TrainedProfileCandidate {
  id: string;
  name: string;
  model: string;
  modelTier: string;
  domain: string;
  sourceNodeType: string;
  roleInWorkflow: string;
  output: string[];
  redLines: string[];
  artifact: string;
  artifactPath: string;
  score: number;
  matchTerms: string[];
}

interface TrainedCandidateChain {
  id: string;
  templateType: string;
  chainShape: string;
  score: number;
  matchTerms: string[];
  nodes: TrainedProfileCandidate[];
}

const FLASH_MODEL = "opencode-go/deepseek-v4-flash";
const STRONG_EXISTING_THRESHOLD = 62;
const TEMPLATE_MATCH_THRESHOLD = 58;
const SEARCH_BUDGET_MS = 3000;
const GENERATION_BUDGET_MS = 6000;
const FLASH_TIMEOUT_MS = GENERATION_BUDGET_MS;
const BACKEND_SAVE_TIMEOUT_MS = 800;
const WORKFLOW_BACKEND = "http://127.0.0.1:3000";
const WORKFLOW_CATALOG_PATH = join(process.cwd(), "../pi-backend/workflows.json");
const PROFILE_CATALOG_PATH = join(process.cwd(), "../pi-backend/agent-profiles.json");
const FORBIDDEN_TERMS = ["训练样本", "标准样本", "真实训练", "训练验证", "样本对齐"];
const TEMPLATE_TYPES = new Set(["fetch-summarize", "classify-route", "extract-writeback", "generate-variants", "monitor-alert"]);
const MODEL_COMBINATION_IDS = new Set([
  "combo-fetch-structure-judge",
  "combo-standardize-classify-draft-review",
  "combo-standardize-extract-action-review",
  "combo-plan-generate-review",
  "combo-plan-generate-render-review",
  "combo-gather-judge-render-review",
  "combo-standardize-judge-render-review",
  "combo-gather-alert-review",
]);

const TRAINED_CHAIN_SHAPES: Array<{
  id: string;
  templateType: string;
  chainShape: string;
  nodeTypes: string[];
}> = [
  {
    id: "trained-plan-draft-review",
    templateType: "generate-variants",
    chainShape: "Strategize/Plan -> Generate/Draft -> Review/Gate",
    nodeTypes: ["Strategize/Plan", "Generate/Draft", "Review/Gate"],
  },
  {
    id: "trained-standardize-draft-review",
    templateType: "generate-variants",
    chainShape: "Standardize -> Generate/Draft -> Review/Gate",
    nodeTypes: ["Standardize", "Generate/Draft", "Review/Gate"],
  },
  {
    id: "trained-gather-analyze-draft-review",
    templateType: "fetch-summarize",
    chainShape: "Fetch/Gather -> Analyze/Judge -> Generate/Draft -> Review/Gate",
    nodeTypes: ["Fetch/Gather", "Analyze/Judge", "Generate/Draft", "Review/Gate"],
  },
  {
    id: "trained-gather-analyze-render-review",
    templateType: "fetch-summarize",
    chainShape: "Fetch/Gather -> Analyze/Judge -> Artifact/Render -> Review/Gate",
    nodeTypes: ["Fetch/Gather", "Analyze/Judge", "Artifact/Render", "Review/Gate"],
  },
  {
    id: "trained-plan-draft-render-review",
    templateType: "generate-variants",
    chainShape: "Strategize/Plan -> Generate/Draft -> Artifact/Render -> Review/Gate",
    nodeTypes: ["Strategize/Plan", "Generate/Draft", "Artifact/Render", "Review/Gate"],
  },
  {
    id: "trained-standardize-extract-action-review",
    templateType: "extract-writeback",
    chainShape: "Standardize -> Extract/Validate -> Writeback/Action -> Review/Gate",
    nodeTypes: ["Standardize", "Extract/Validate", "Writeback/Action", "Review/Gate"],
  },
  {
    id: "trained-classify-draft-review",
    templateType: "classify-route",
    chainShape: "Classify/Route -> Generate/Draft -> Review/Gate",
    nodeTypes: ["Classify/Route", "Generate/Draft", "Review/Gate"],
  },
];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "self-media": ["自媒体", "选题", "脚本", "标题", "封面", "评论", "完播", "互动", "小红书", "抖音", "视频", "图文"],
  ecommerce: ["电商", "商品", "listing", "评价", "库存", "大促", "海报", "淘宝", "亚马逊", "seo"],
  "customer-support": ["客服", "工单", "咨询", "投诉", "知识库", "转人工", "质检", "售后", "用户对话"],
  research: ["行业", "调研", "竞品", "新闻", "财报", "政策", "访谈", "舆情", "风险", "监控", "搜索", "融资", "轮次", "金额", "量子", "初创", "定价", "功能对比", "差异矩阵", "选型", "cursor", "copilot", "windsurf", "tesla", "特斯拉", "fsd", "监管"],
  sales: ["销售", "电话", "线索", "客户", "crm", "异议", "跟进", "通话", "意向", "简报"],
  "job-search": ["求职", "简历", "面试", "offer", "jd", "公司调研", "岗位", "跳槽", "背调"],
};

const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  "fetch-summarize": ["抓取", "搜集", "搜索", "监控", "摘要", "简报", "报告", "复盘", "调研", "新闻", "评论", "融资", "轮次", "金额", "定价", "对比", "差异矩阵", "选型"],
  "classify-route": ["分类", "分级", "路由", "标签", "回复", "优先级", "派发", "审核", "转人工", "复核", "队列", "风险清单", "投诉"],
  "generate-variants": ["多版", "版本", "文案", "脚本", "标题", "封面", "海报", "改写", "草稿", "a/b", "ab测试"],
  "monitor-alert": ["监控", "告警", "预警", "异常", "风险", "阈值", "变化", "定时", "库存", "舆情", "48 小时", "48小时", "事故", "监管", "高级告警"],
  "extract-writeback": ["提取", "抽取", "结构化", "字段", "回写", "crm", "纪要", "表单", "校验"],
};

const TEMPLATE_RECIPES: Record<string, {
  appliesTo: string[];
  nodes: Array<{
    type: string;
    label: string;
    profileId: string;
  }>;
}> = {
  "fetch-summarize": {
    appliesTo: ["行业调研", "信息监控", "竞品追踪"],
    nodes: [
      { type: "Fetch", label: "资料搜集", profileId: "weak-research-extractor" },
      { type: "Structure", label: "结构化提取", profileId: "weak-structured-operator" },
      { type: "Judge", label: "影响判断与摘要", profileId: "research-report-analyst" },
    ],
  },
  "classify-route": {
    appliesTo: ["客服票据", "评论区分级", "工单路由"],
    nodes: [
      { type: "Standardize", label: "输入标准化", profileId: "weak-structured-operator" },
      { type: "Classify", label: "分类打标", profileId: "classification-router" },
      { type: "Generate", label: "自动处理草稿", profileId: "support-kb-responder" },
      { type: "Review", label: "风险审查", profileId: "strong-quality-reviewer" },
    ],
  },
  "extract-writeback": {
    appliesTo: ["CRM回写", "发票处理", "表单录入"],
    nodes: [
      { type: "Standardize", label: "输入整理", profileId: "weak-structured-operator" },
      { type: "Extract", label: "字段抽取", profileId: "structured-writeback-operator" },
      { type: "Action", label: "写回Payload", profileId: "structured-writeback-operator" },
      { type: "Review", label: "风险审查", profileId: "strong-quality-reviewer" },
    ],
  },
  "generate-variants": {
    appliesTo: ["A/B测试", "标题封面", "广告文案"],
    nodes: [
      { type: "Plan", label: "生成策略", profileId: "strong-task-architect" },
      { type: "Generate", label: "批量变体生成", profileId: "content-draft-producer" },
      { type: "Review", label: "质量审查", profileId: "content-editor-reviewer" },
    ],
  },
  "monitor-alert": {
    appliesTo: ["舆情监控", "库存预警", "价格波动"],
    nodes: [
      { type: "Gather", label: "事件窗口整理", profileId: "weak-research-extractor" },
      { type: "Classify", label: "触发判断与分级", profileId: "monitor-alert-operator" },
      { type: "Review", label: "重度告警审查", profileId: "strong-quality-reviewer" },
    ],
  },
};

const MODEL_COMBINATIONS: Record<string, {
  templateType: string;
  modelChain: string;
  scenarios: string[];
  nodes: Array<{
    id: string;
    nodeType: string;
    tier: "weak" | "strong";
    profileId: string;
    capabilityBoundary: string;
    promptMode: string;
  }>;
}> = {
  "combo-fetch-structure-judge": {
    templateType: "fetch-summarize",
    modelChain: "weak -> weak -> strong",
    scenarios: ["research-brief", "competitor-compare", "source-monitor", "pricing-matrix", "policy-news-summary"],
    nodes: [
      { id: "gather-facts", nodeType: "Fetch/Gather", tier: "weak", profileId: "weak-research-extractor", capabilityBoundary: "只搬运可定位事实、来源、缺口；不判断不补事实", promptMode: "source_bound_fact_pack" },
      { id: "standardize-pack", nodeType: "Standardize", tier: "weak", profileId: "weak-structured-operator", capabilityBoundary: "只做 schema 化、去重、字段对齐；缺失字段 unknown", promptMode: "schema_normalization" },
      { id: "judge-summary", nodeType: "Analyze/Judge", tier: "strong", profileId: "research-report-analyst", capabilityBoundary: "基于事实做判断、矩阵、建议；区分事实/推断/假设", promptMode: "evidence_based_judgement" },
    ],
  },
  "combo-standardize-classify-draft-review": {
    templateType: "classify-route",
    modelChain: "weak -> weak -> weak -> strong",
    scenarios: ["support-ticket-routing", "comment-triage", "message-notice-draft", "complaint-priority", "manual-confirmation-queue"],
    nodes: [
      { id: "standardize-input", nodeType: "Standardize", tier: "weak", profileId: "weak-structured-operator", capabilityBoundary: "条目化输入、保留原文和上下文；不改写原意", promptMode: "item_queue_normalization" },
      { id: "classify-route", nodeType: "Classify/Route", tier: "weak", profileId: "classification-router", capabilityBoundary: "按固定标签输出置信度和路由；低置信/高风险转人工", promptMode: "bounded_label_routing" },
      { id: "draft-response", nodeType: "Generate/Draft", tier: "weak", profileId: "support-kb-responder", capabilityBoundary: "只生成可编辑草稿；不得新增上游未支持事实", promptMode: "evidence_bound_draft" },
      { id: "review-gate", nodeType: "Review/Gate", tier: "strong", profileId: "strong-quality-reviewer", capabilityBoundary: "必须裁决通过/返工/阻塞；识别隐藏风险", promptMode: "risk_gate_decision" },
    ],
  },
  "combo-standardize-extract-action-review": {
    templateType: "extract-writeback",
    modelChain: "weak -> weak -> weak -> strong",
    scenarios: ["crm-writeback", "invoice-extract", "form-entry", "ticket-field-update", "payload-generation"],
    nodes: [
      { id: "standardize-input", nodeType: "Standardize", tier: "weak", profileId: "weak-structured-operator", capabilityBoundary: "整理原文和来源锚点；不猜缺失字段", promptMode: "source_span_preparation" },
      { id: "extract-validate", nodeType: "Extract/Validate", tier: "weak", profileId: "structured-writeback-operator", capabilityBoundary: "字段抽取、格式校验、needs_review；不确定不填", promptMode: "anchored_field_extract" },
      { id: "writeback-payload", nodeType: "Writeback/Action", tier: "weak", profileId: "structured-writeback-operator", capabilityBoundary: "生成 payload、幂等键、重试建议；不执行高风险动作", promptMode: "validated_payload_build" },
      { id: "review-gate", nodeType: "Review/Gate", tier: "strong", profileId: "strong-quality-reviewer", capabilityBoundary: "审查 payload 完整性和来源充分性；裁决是否可写回", promptMode: "writeback_risk_gate" },
    ],
  },
  "combo-plan-generate-review": {
    templateType: "generate-variants",
    modelChain: "strong -> weak -> strong",
    scenarios: ["ab-copy-variants", "title-cover-options", "ad-creative-batch", "script-variants", "campaign-message-set"],
    nodes: [
      { id: "strategy-plan", nodeType: "Strategize/Plan", tier: "strong", profileId: "strong-task-architect", capabilityBoundary: "定方向、约束、指标；不写长文案不编造案例", promptMode: "strategy_constraints" },
      { id: "draft-variants", nodeType: "Generate/Draft", tier: "weak", profileId: "content-draft-producer", capabilityBoundary: "按策略批量生成初稿；素材不足用占位符", promptMode: "bounded_variant_generation" },
      { id: "review-gate", nodeType: "Review/Gate", tier: "strong", profileId: "content-editor-reviewer", capabilityBoundary: "审查事实边界、风格、发布风险；裁决可用版本", promptMode: "editorial_quality_gate" },
    ],
  },
  "combo-plan-generate-render-review": {
    templateType: "generate-variants",
    modelChain: "strong -> weak -> weak -> strong",
    scenarios: ["report-card-render", "publishable-asset", "document-preview", "campaign-deliverable", "resume-report"],
    nodes: [
      { id: "strategy-plan", nodeType: "Strategize/Plan", tier: "strong", profileId: "strong-task-architect", capabilityBoundary: "定方向、约束、指标；不写长文案不编造案例", promptMode: "strategy_constraints" },
      { id: "draft-content", nodeType: "Generate/Draft", tier: "weak", profileId: "content-draft-producer", capabilityBoundary: "按策略生成可编辑初稿；素材不足用占位符", promptMode: "bounded_draft_generation" },
      { id: "render-artifact", nodeType: "Artifact/Render", tier: "weak", profileId: "weak-structured-operator", capabilityBoundary: "把上游草稿渲染成可预览文件结构；不新增事实不裁决", promptMode: "artifact_render_payload" },
      { id: "review-gate", nodeType: "Review/Gate", tier: "strong", profileId: "content-editor-reviewer", capabilityBoundary: "审查文件内容、事实边界、缺失素材和发布风险；裁决可用版本", promptMode: "artifact_quality_gate" },
    ],
  },
  "combo-gather-judge-render-review": {
    templateType: "fetch-summarize",
    modelChain: "weak -> strong -> weak -> strong",
    scenarios: ["research-report-render", "brief-file-preview", "competitor-report", "interview-card-report", "evidence-backed-deliverable"],
    nodes: [
      { id: "gather-facts", nodeType: "Fetch/Gather", tier: "weak", profileId: "weak-research-extractor", capabilityBoundary: "只搬运可定位事实、来源、缺口；不判断不补事实", promptMode: "source_bound_fact_pack" },
      { id: "judge-summary", nodeType: "Analyze/Judge", tier: "strong", profileId: "research-report-analyst", capabilityBoundary: "基于事实做判断、矩阵、建议；区分事实/推断/假设", promptMode: "evidence_based_judgement" },
      { id: "render-artifact", nodeType: "Artifact/Render", tier: "weak", profileId: "weak-structured-operator", capabilityBoundary: "把分析结果渲染为报告/卡片/预览 payload；不新增事实", promptMode: "report_render_payload" },
      { id: "review-gate", nodeType: "Review/Gate", tier: "strong", profileId: "strong-quality-reviewer", capabilityBoundary: "审查报告证据、结构完整性和风险；必须裁决", promptMode: "report_quality_gate" },
    ],
  },
  "combo-standardize-judge-render-review": {
    templateType: "fetch-summarize",
    modelChain: "weak -> strong -> weak -> strong",
    scenarios: ["transcript-card-render", "interview-insight-card", "meeting-brief-file", "source-material-report", "quote-backed-summary"],
    nodes: [
      { id: "standardize-input", nodeType: "Standardize", tier: "weak", profileId: "weak-structured-operator", capabilityBoundary: "清理原始材料、保留原文锚点、分段和缺失项；不改写原意", promptMode: "source_span_normalization" },
      { id: "judge-insights", nodeType: "Analyze/Judge", tier: "strong", profileId: "research-report-analyst", capabilityBoundary: "从标准化材料中提炼观点、证据和可验证判断；区分事实/推断/假设", promptMode: "quote_backed_insight_judgement" },
      { id: "render-artifact", nodeType: "Artifact/Render", tier: "weak", profileId: "weak-structured-operator", capabilityBoundary: "把观点和证据渲染为卡片/报告预览 payload；不新增事实", promptMode: "card_or_report_render_payload" },
      { id: "review-gate", nodeType: "Review/Gate", tier: "strong", profileId: "strong-quality-reviewer", capabilityBoundary: "审查事实边界、引用一致性和发布风险；必须裁决", promptMode: "artifact_quality_gate" },
    ],
  },
  "combo-gather-alert-review": {
    templateType: "monitor-alert",
    modelChain: "weak -> weak -> strong",
    scenarios: ["public-opinion-alert", "inventory-price-alert", "incident-window-review", "risk-threshold-monitor", "regulatory-signal-alert"],
    nodes: [
      { id: "event-window-gather", nodeType: "Fetch/Gather", tier: "weak", profileId: "weak-research-extractor", capabilityBoundary: "整理时间窗口内事件、指标、来源；无来源 unverified", promptMode: "event_window_pack" },
      { id: "alert-classify", nodeType: "Monitor/Alert", tier: "weak", profileId: "monitor-alert-operator", capabilityBoundary: "阈值触发、轻中重分级、升级条件；不执行动作", promptMode: "threshold_severity_route" },
      { id: "severe-alert-review", nodeType: "Review/Gate", tier: "strong", profileId: "strong-quality-reviewer", capabilityBoundary: "审查中重度告警证据，裁决升级/观察/驳回", promptMode: "alert_escalation_gate" },
    ],
  },
};

const NODE_MICRO_TUNING_RULES: Record<string, {
  nodeType: string;
  modelTier: "weak" | "strong" | "mixed";
  plainRole: string;
  capabilityBoundary: string;
  requiredInputs: string[];
  outputSchema: string[];
  riskRules: string[];
  acceptance: string[];
  handoff: string[];
}> = {
  "Fetch/Gather": {
    nodeType: "Fetch/Gather",
    modelTier: "weak",
    plainRole: "资料搜集与事实抽取",
    capabilityBoundary: "只搬运用户材料、工具结果、可定位文件中的事实；不做判断，不补事实。",
    requiredInputs: ["task_goal", "source_materials", "links", "time_window"],
    outputSchema: ["sources", "facts", "source_status", "uncertainties", "evidence_gaps", "review_suggestions"],
    riskRules: ["不得凭记忆生成新闻、融资数字、链接、媒体名、价格或功能", "无来源输出 source_status=missing/unverified", "来源冲突必须并列保留"],
    acceptance: ["每条事实有来源或缺失标记", "列出不确定点和补源建议", "不输出判断结论"],
    handoff: ["facts", "sources", "source_status", "evidence_gaps"],
  },
  Standardize: {
    nodeType: "Standardize",
    modelTier: "weak",
    plainRole: "输入标准化与格式转换",
    capabilityBoundary: "把非结构化输入转成固定 schema；只做字段抽取、清洗、去重、对齐。",
    requiredInputs: ["task_goal", "raw_materials", "upstream_result", "target_schema"],
    outputSchema: ["normalized_items", "source_spans", "missing_fields", "conflict_notes", "schema_version"],
    riskRules: ["严格按 schema 执行，不猜测缺失字段", "不改变原文含义", "来源冲突不得擅自合并"],
    acceptance: ["输出字段满足下游 schema", "缺失字段为 unknown/missing", "保留原文锚点"],
    handoff: ["normalized_items", "source_spans", "missing_fields"],
  },
  "Classify/Route": {
    nodeType: "Classify/Route",
    modelTier: "weak",
    plainRole: "分类打标与条件路由",
    capabilityBoundary: "按固定标签输出分类、置信度、情绪/风险和路由目标。",
    requiredInputs: ["normalized_items", "label_schema", "routing_rules", "risk_rules"],
    outputSchema: ["label", "confidence", "emotion", "route_target", "manual_review_reason", "risk_flags"],
    riskRules: ["低置信度必须转人工", "高风险内容不得自动放行", "标签冲突必须输出 manual_review_reason"],
    acceptance: ["每个条目有标签、置信度和路由", "低置信/高风险条目进入人工队列", "路由理由可复核"],
    handoff: ["label", "confidence", "route_target", "risk_flags", "manual_review_reason"],
  },
  "Extract/Validate": {
    nodeType: "Extract/Validate",
    modelTier: "weak",
    plainRole: "结构化提取与校验",
    capabilityBoundary: "从非结构化内容抽取字段，校验格式和必填项，保留原文锚点。",
    requiredInputs: ["normalized_items", "target_schema", "source_spans"],
    outputSchema: ["field_mapping", "payload", "validation_errors", "needs_review", "source_spans"],
    riskRules: ["不确定字段标记 needs_review", "必填缺失不得默认为 0、空字符串或自造值", "所有字段必须可追溯到原文"],
    acceptance: ["字段映射完整", "校验错误可定位", "needs_review 原因明确"],
    handoff: ["payload", "validation_errors", "needs_review", "source_spans"],
  },
  "Generate/Draft": {
    nodeType: "Generate/Draft",
    modelTier: "weak",
    plainRole: "内容生成与可编辑草稿",
    capabilityBoundary: "依据上游策略和事实生成可编辑初稿，不做最终定稿。",
    requiredInputs: ["strategy", "constraints", "facts", "source_materials", "draft_policy"],
    outputSchema: ["draft_sections", "variants", "source_usage", "placeholders", "unsupported_claims_removed", "risk_flags", "editable_notes"],
    riskRules: ["不得新增上游未支持的事实、案例、数字、金额、客户名或项目成果", "素材不足必须用占位符或 editable_notes", "不得输出不可修改的最终定稿"],
    acceptance: ["草稿引用上游依据", "未支持事实已删除或占位", "风险项可交给 Review/Gate 审查"],
    handoff: ["draft_sections", "source_usage", "placeholders", "risk_flags", "editable_notes"],
  },
  "Analyze/Judge": {
    nodeType: "Analyze/Judge",
    modelTier: "mixed",
    plainRole: "深度分析与判断",
    capabilityBoundary: "从事实中形成可验证判断，明确区分事实、推断、假设和建议。",
    requiredInputs: ["fact_table", "normalized_items", "evidence_gaps", "comparison_dimensions"],
    outputSchema: ["judgements", "evidence", "confidence", "assumptions", "recommendations", "counter_conditions"],
    riskRules: ["未验证来源不得下高置信结论", "建议必须绑定证据字段", "必须写出反证条件或不成立条件"],
    acceptance: ["事实/推断/假设/建议分层清楚", "每个判断有证据锚点", "置信度和反证条件明确"],
    handoff: ["judgements", "recommendations", "confidence", "counter_conditions"],
  },
  "Strategize/Plan": {
    nodeType: "Strategize/Plan",
    modelTier: "strong",
    plainRole: "策略规划与架构",
    capabilityBoundary: "给出方向、约束、指标和执行优先级；不写长正文。",
    requiredInputs: ["task_goal", "source_materials", "constraints", "success_criteria"],
    outputSchema: ["strategy_direction", "constraints", "success_metrics", "execution_priorities", "validation_plan", "handoff_to_next_nodes"],
    riskRules: ["禁止编造真实案例、金额、转化率、履历或外部事实", "不得让策略节点代替生成节点写长文", "必须给下游可执行约束"],
    acceptance: ["方向结论清楚", "约束和优先级可执行", "验证指标可被 Review/Gate 检查"],
    handoff: ["strategy_direction", "constraints", "success_metrics", "handoff_to_next_nodes"],
  },
  "Writeback/Action": {
    nodeType: "Writeback/Action",
    modelTier: "weak",
    plainRole: "系统回写与动作执行准备",
    capabilityBoundary: "生成系统写回 payload、幂等键和失败重试建议；不直接执行高风险动作。",
    requiredInputs: ["payload", "validation_errors", "writeback_rules", "source_spans"],
    outputSchema: ["writeback_payload", "idempotency_key", "field_validation", "retry_advice", "blocking_errors"],
    riskRules: ["必填缺失必须阻塞", "不得把缺失字段默认填 0 或空", "高风险动作只输出建议，不执行"],
    acceptance: ["payload 可被系统读取", "幂等键和重试建议明确", "阻塞错误可返工"],
    handoff: ["writeback_payload", "idempotency_key", "blocking_errors", "field_validation"],
  },
  "Review/Gate": {
    nodeType: "Review/Gate",
    modelTier: "strong",
    plainRole: "质量审查与风险裁决",
    capabilityBoundary: "审查产物是否满足成功标准，识别冲突、遗漏和隐藏风险，并给明确裁决。",
    requiredInputs: ["draft_sections", "payload", "risk_flags", "source_usage", "success_criteria"],
    outputSchema: ["decision", "issues", "evidence_checks", "checklist_coverage", "rework_assignment", "final_acceptance"],
    riskRules: ["必须给 pass/revise/block/escalate 裁决", "不能只给建议", "无来源数字、虚构事实、高风险动作必须阻塞或升级"],
    acceptance: ["裁决明确", "问题定位到节点/字段", "返工分配和验收标准具体"],
    handoff: ["decision", "issues", "rework_assignment", "final_acceptance"],
  },
  "Artifact/Render": {
    nodeType: "Artifact/Render",
    modelTier: "weak",
    plainRole: "资料文件生成与渲染",
    capabilityBoundary: "把上游结构化结果渲染成可预览、可下载、可交付的文件或报告；只做呈现和格式化，不新增事实或裁决。",
    requiredInputs: ["approved_content", "draft_sections", "payload", "render_spec", "source_usage"],
    outputSchema: ["artifact_title", "artifact_type", "file_sections", "render_payload", "source_usage", "preview_notes", "missing_assets", "risk_flags"],
    riskRules: ["不得新增上游未支持事实、图片、数字或引用", "缺少素材必须写 missing_assets", "不得把未审查内容标记为最终通过"],
    acceptance: ["文件结构完整", "预览内容和上游字段一致", "缺失素材和风险项可被 Review/Gate 复查"],
    handoff: ["artifact_type", "render_payload", "preview_notes", "missing_assets", "risk_flags"],
  },
  "Monitor/Alert": {
    nodeType: "Monitor/Alert",
    modelTier: "weak",
    plainRole: "监控告警与分级响应",
    capabilityBoundary: "做异常摘要、阈值触发判断、轻中重分级和升级条件标注。",
    requiredInputs: ["events", "metric_changes", "alert_thresholds", "time_window"],
    outputSchema: ["severity", "trigger_reason", "evidence", "recommended_action", "escalation", "watch_items"],
    riskRules: ["不得自行执行高风险动作", "证据冲突必须升级审查", "不得把未验证信号写成确定事故"],
    acceptance: ["分级有证据", "触发原因可复核", "升级条件和观察项明确"],
    handoff: ["severity", "trigger_reason", "evidence", "escalation"],
  },
};

function normalizeText(value: string | undefined) {
  return (value || "").toLowerCase();
}

function cleanInlineText(value: unknown, maxLength = 180) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function stripForbidden(value: string) {
  return FORBIDDEN_TERMS.reduce((text, term) => text.replaceAll(term, ""), value);
}

function keywordScore(input: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (input.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function relevantTerms(input: string) {
  const seedTerms = [
    ...Object.values(DOMAIN_KEYWORDS).flat(),
    ...Object.values(TEMPLATE_KEYWORDS).flat(),
    "2025", "2025h1", "h1", "上半年", "全球", "初创公司", "应用方向",
    "cursor", "github", "copilot", "windsurf", "devin", "pricing", "plans",
    "reddit", "twitter", "x", "tesla", "特斯拉", "fsd", "v13", "nhtsa",
  ];
  const inputTokens = input
    .split(/[\s,，。；;:：/、+()（）「」"'`]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
  return [...new Set([
    ...seedTerms.map((term) => term.toLowerCase()).filter((term) => input.includes(term)),
    ...inputTokens,
  ])];
}

function taskText(task: WorkflowTaskDefinition) {
  return [
    task.name,
    task.profileId,
    task.model,
    task.prompt,
    task.definitionOfDone,
    ...(task.acceptanceCriteria || []),
  ].filter(Boolean).join(" ");
}

function workflowText(workflow: WorkflowDefinition) {
  return [
    workflow.name,
    workflow.description,
    workflow.domain,
    workflow.category,
    workflow.templateType,
    ...(workflow.tasks || []).map(taskText),
  ].filter(Boolean).join(" ").toLowerCase();
}

function hasLocalPathLeak(value: unknown) {
  return /(?:\/Users\/|\/home\/|[A-Za-z]:\\)/.test(String(value || ""));
}

function workflowHasUserFacingPathLeak(workflow: WorkflowDefinition) {
  const inputContract = workflow.inputContract as {
    title?: unknown;
    description?: unknown;
    fields?: Array<{ label?: unknown; placeholder?: unknown; helperText?: unknown }>;
  } | undefined;
  const userFacingValues = [
    workflow.name,
    workflow.description,
    inputContract?.title,
    inputContract?.description,
    ...(inputContract?.fields || []).flatMap((field) => [field.label, field.placeholder, field.helperText]),
    ...(workflow.tasks || []).flatMap((task) => [
      task.name,
      task.prompt,
      task.definitionOfDone,
      ...(task.acceptanceCriteria || []),
    ]),
  ];
  return userFacingValues.some(hasLocalPathLeak);
}

function inferDomain(input: string) {
  let best = { domain: "generic", score: 0 };
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywordScore(input, keywords);
    if (score > best.score) best = { domain, score };
  }
  return best;
}

function inferTemplateType(input: string) {
  let best = { templateType: "", score: 0 };
  for (const [templateType, keywords] of Object.entries(TEMPLATE_KEYWORDS)) {
    const score = keywordScore(input, keywords);
    if (score > best.score) best = { templateType, score };
  }
  return best;
}

function scoreWorkflow(workflow: WorkflowDefinition, input: string, domain: string, templateType: string): Recommendation {
  const text = workflowText(workflow);
  const reasons: string[] = [];
  let score = 0;

  if (domain !== "generic" && workflow.domain === domain) {
    score += 36;
    reasons.push(`行业匹配：${workflow.category || workflow.domain}`);
  }
  if (templateType && workflow.templateType === templateType) {
    score += 30;
    reasons.push(`流程类型匹配：${templateType}`);
  }

  const domainHits = workflow.domain ? keywordScore(input, DOMAIN_KEYWORDS[workflow.domain] || []) : 0;
  if (domainHits > 0) {
    score += Math.min(18, domainHits * 4);
    reasons.push(`命中 ${domainHits} 个行业关键词`);
  }

  const templateHits = workflow.templateType ? keywordScore(input, TEMPLATE_KEYWORDS[workflow.templateType] || []) : 0;
  if (templateHits > 0) {
    score += Math.min(18, templateHits * 4);
    reasons.push(`命中 ${templateHits} 个任务模式关键词`);
  }

  const inputTokens = input.split(/[\s,，。；;:：/、]+/).filter((token) => token.length >= 2);
  const overlap = inputTokens.filter((token) => text.includes(token)).length;
  if (overlap > 0) {
    score += Math.min(16, overlap * 3);
    reasons.push(`与 workflow 描述/节点有 ${overlap} 处语义重合`);
  }

  const termHits = relevantTerms(input).filter((term) => text.includes(term));
  if (termHits.length > 0) {
    score += Math.min(32, termHits.length * 5);
    reasons.push(`命中 ${termHits.length} 个关键语义词`);
  }

  if (workflow.id?.startsWith("case-") && termHits.length >= 3) {
    score += 16;
    reasons.push("命中真实案例 workflow");
  }

  const hasStrongReview = (workflow.tasks || []).some((task) => {
    const haystack = `${task.profileId || ""} ${task.model || ""} ${task.name || ""}`.toLowerCase();
    return haystack.includes("strong") || haystack.includes("review") || haystack.includes("pro") || haystack.includes("analyst") || haystack.includes("director");
  });
  if (hasStrongReview) {
    score += 6;
    reasons.push("包含强模型复核或高阶判断节点");
  }

  return { workflow, score, reasons: reasons.slice(0, 4) };
}

function semanticTermHits(workflow: WorkflowDefinition, input: string) {
  const text = workflowText(workflow);
  return relevantTerms(input).filter((term) => text.includes(term));
}

function specificSemanticHits(workflow: WorkflowDefinition, input: string) {
  const genericTerms = new Set([
    ...Object.values(DOMAIN_KEYWORDS).flat(),
    ...Object.values(TEMPLATE_KEYWORDS).flat(),
    "workflow",
    "产品",
    "用户",
    "输出",
    "生成",
  ].map((term) => term.toLowerCase()));
  const text = workflowText(workflow);
  return input
    .split(/[\s,，。；;:：/、+()（）「」"'`]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 3 && !genericTerms.has(token))
    .filter((token) => text.includes(token));
}

function canUseExistingWorkflow(workflow: WorkflowDefinition, score: number, input: string, domain: string) {
  if (workflowHasUserFacingPathLeak(workflow)) return false;
  if (workflow.id?.startsWith("custom-") && workflow.debugStatus === "unverified") return false;
  if (score < STRONG_EXISTING_THRESHOLD) return false;
  const hits = semanticTermHits(workflow, input);
  if (workflow.id?.startsWith("case-")) return workflow.domain === domain && specificSemanticHits(workflow, input).length >= 2;
  if (domain !== "generic") return workflow.domain === domain && hits.length >= 3;
  return score >= 90 && hits.length >= 6;
}

function canUseTemplateWorkflow(workflow: WorkflowDefinition, score: number, templateType: string) {
  if (workflow.status !== "template") return false;
  if (!templateType || workflow.templateType !== templateType) return false;
  return score >= TEMPLATE_MATCH_THRESHOLD;
}

function profilePlan(workflow: WorkflowDefinition, profiles: AgentProfileItem[]) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const seen = new Set<string>();
  return (workflow.tasks || [])
    .map((task) => task.profileId)
    .filter((profileId): profileId is string => Boolean(profileId))
    .filter((profileId) => {
      if (seen.has(profileId)) return false;
      seen.add(profileId);
      return true;
    })
    .slice(0, 5)
    .map((profileId) => {
      const profile = profileMap.get(profileId);
      return {
        id: profileId,
        name: profile?.name || profileId,
        tier: profile?.projectConfig?.modelTier || (profile?.defaultModel?.includes("flash") ? "weak" : profile?.defaultModel?.includes("pro") ? "strong" : "unknown"),
        model: profile?.defaultModel || "按 workflow 节点配置",
        role: profile?.projectConfig?.roleInWorkflow || "workflow-node",
      };
    });
}

function asStringList(value: unknown, max = 6, maxLength = 160) {
  if (Array.isArray(value)) return value.map((item) => cleanInlineText(item, maxLength)).filter(Boolean).slice(0, max);
  const text = cleanInlineText(value, maxLength);
  return text ? [text] : [];
}

function cleanArtifactLabel(value: unknown, fallback: string) {
  const raw = cleanInlineText(value, 180);
  const fallbackLabel = cleanInlineText(fallback.replace(/\s*专用\s*Profile\s*$/i, ""), 80);
  if (!raw) return fallbackLabel;
  if (hasLocalPathLeak(raw) || raw.includes("/")) return fallbackLabel;
  return raw;
}

function nodeTypeMatches(candidateType: string, requiredType: string) {
  const candidate = normalizeText(candidateType);
  const required = normalizeText(requiredType);
  if (!candidate || !required) return false;
  if (candidate === required) return true;
  const aliases: Record<string, string[]> = {
    "fetch/gather": ["fetch", "gather", "资料搜集"],
    standardize: ["standardize", "structure", "输入标准化", "格式转换"],
    "classify/route": ["classify", "route", "分类", "路由"],
    "extract/validate": ["extract", "validate", "抽取", "校验"],
    "generate/draft": ["generate", "draft", "生成", "草稿", "改写"],
    "analyze/judge": ["analyze", "judge", "分析", "判断"],
    "strategize/plan": ["strategize", "plan", "策略", "规划"],
    "writeback/action": ["writeback", "action", "写回", "动作"],
    "review/gate": ["review", "gate", "审查", "裁决", "终审"],
    "artifact/render": ["artifact", "render", "渲染", "报告", "文件", "预览", "交付物"],
    "monitor/alert": ["monitor", "alert", "监控", "告警"],
  };
  const requiredAliases = aliases[required] || [required];
  return requiredAliases.some((alias) => candidate.includes(alias));
}

function canonicalNodeType(value: string) {
  if (nodeTypeMatches(value, "Fetch/Gather")) return "Fetch/Gather";
  if (nodeTypeMatches(value, "Standardize") || normalizeText(value).includes("structure")) return "Standardize";
  if (nodeTypeMatches(value, "Classify/Route") || normalizeText(value).includes("router")) return "Classify/Route";
  if (nodeTypeMatches(value, "Extract/Validate") || normalizeText(value) === "extract") return "Extract/Validate";
  if (nodeTypeMatches(value, "Generate/Draft")) return "Generate/Draft";
  if (nodeTypeMatches(value, "Analyze/Judge") || normalizeText(value) === "judge") return "Analyze/Judge";
  if (nodeTypeMatches(value, "Strategize/Plan")) return "Strategize/Plan";
  if (nodeTypeMatches(value, "Writeback/Action") || normalizeText(value) === "action") return "Writeback/Action";
  if (nodeTypeMatches(value, "Review/Gate")) return "Review/Gate";
  if (nodeTypeMatches(value, "Artifact/Render")) return "Artifact/Render";
  if (nodeTypeMatches(value, "Monitor/Alert")) return "Monitor/Alert";
  return "Generate/Draft";
}

function microRulesForNodeType(value: string) {
  return NODE_MICRO_TUNING_RULES[canonicalNodeType(value)] || NODE_MICRO_TUNING_RULES["Generate/Draft"];
}

function trainedCandidateText(candidate: TrainedProfileCandidate) {
  return [
    candidate.id,
    candidate.name,
    candidate.modelTier,
    candidate.domain,
    candidate.sourceNodeType,
    candidate.roleInWorkflow,
    candidate.artifact,
    candidate.artifactPath,
    ...candidate.output,
    ...candidate.redLines,
  ].join(" ").toLowerCase();
}

function scoreTrainedCandidate(input: string, candidate: Omit<TrainedProfileCandidate, "score" | "matchTerms">) {
  const text = [
    candidate.id,
    candidate.name,
    candidate.modelTier,
    candidate.domain,
    candidate.sourceNodeType,
    candidate.roleInWorkflow,
    candidate.artifact,
    candidate.artifactPath,
    ...candidate.output,
    ...candidate.redLines,
  ].join(" ").toLowerCase();
  const terms = relevantTerms(input).filter((term) => text.includes(term));
  const rawTokens = input
    .split(/[\s,，。；;:：/、+()（）「」"'`]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
  const tokenHits = rawTokens.filter((token) => text.includes(token));
  return {
    score: terms.length * 8 + tokenHits.length * 4,
    matchTerms: [...new Set([...terms, ...tokenHits])].slice(0, 8),
  };
}

function trainedProfileCandidates(profiles: AgentProfileItem[], input: string): TrainedProfileCandidate[] {
  return profiles
    .filter((profile) => profile.projectConfig?.generatedStatus === "trained" && profile.projectConfig?.profileKind === "task-specific")
    .map((profile) => {
      const base = {
        id: profile.id,
        name: profile.name || profile.id,
        model: profile.defaultModel || (profile.projectConfig?.modelTier === "strong" ? "opencode-go/deepseek-v4-pro" : FLASH_MODEL),
        modelTier: profile.projectConfig?.modelTier || (profile.defaultModel?.includes("pro") ? "strong" : "weak"),
        domain: profile.projectConfig?.domain || "generic",
        sourceNodeType: profile.projectConfig?.sourceNodeType || "",
        roleInWorkflow: profile.projectConfig?.roleInWorkflow || "",
        output: asStringList(profile.projectConfig?.nodeContract?.output, 8, 180),
        redLines: asStringList(profile.projectConfig?.nodeContract?.redLines, 8, 180),
        artifact: cleanArtifactLabel(profile.projectConfig?.nodeOutputArtifact, profile.name || profile.id),
        artifactPath: cleanInlineText(profile.projectConfig?.nodeOutputArtifact, 180),
      };
      const scored = scoreTrainedCandidate(input, base);
      return { ...base, ...scored };
    })
    .filter((candidate) => candidate.sourceNodeType)
    .sort((a, b) => b.score - a.score);
}

function chainsForCandidateGroup(input: string, candidates: TrainedProfileCandidate[]) {
  return TRAINED_CHAIN_SHAPES.map((shape) => {
    const used = new Set<string>();
    const nodes = shape.nodeTypes.map((nodeType) => {
      const match = candidates
        .filter((candidate) => !used.has(candidate.id) && nodeTypeMatches(candidate.sourceNodeType, nodeType))
        .sort((a, b) => {
          const scoreDelta = b.score - a.score;
          if (scoreDelta) return scoreDelta;
          return trainedCandidateText(b).length - trainedCandidateText(a).length;
        })[0];
      if (match) used.add(match.id);
      return match;
    });
    if (nodes.some((node) => !node)) return null;
    const typedNodes = nodes as TrainedProfileCandidate[];
    const matchTerms = [...new Set(typedNodes.flatMap((node) => node.matchTerms))].slice(0, 10);
    const relevantNodeCount = typedNodes.filter((node) => node.score > 0).length;
    const averageNodeScore = typedNodes.reduce((sum, node) => sum + node.score, 0) / typedNodes.length;
    const score = averageNodeScore + matchTerms.length * 3 + trainedChainIntentBoost(input, shape.id);
    if (relevantNodeCount < Math.min(2, typedNodes.length)) return null;
    return {
      id: shape.id,
      templateType: shape.templateType,
      chainShape: shape.chainShape,
      score,
      matchTerms,
      nodes: typedNodes,
    };
  }).filter(Boolean) as TrainedCandidateChain[];
}

function trainedChainIntentBoost(input: string, chainId: string) {
  if (chainId === "trained-plan-draft-review" && /简历|jd|岗位|诊断|策略|定位|规划|改写|优化/.test(input)) return 42;
  if (chainId === "trained-standardize-draft-review" && /转写|清理|整理|原始|逐段|改写|材料/.test(input)) return 24;
  if (chainId === "trained-gather-analyze-draft-review" && /搜集|调研|官网|链接|价格|新闻|资料|竞品|来源/.test(input)) return 28;
  if (chainId === "trained-gather-analyze-render-review" && /报告|文件|预览|下载|交付|渲染|卡片|简报/.test(input)) return 38;
  if (chainId === "trained-plan-draft-render-review" && /报告|文件|预览|下载|交付|渲染|卡片|发布稿/.test(input)) return 34;
  if (chainId === "trained-standardize-extract-action-review" && /字段|抽取|写回|payload|crm|表单|发票/.test(input)) return 30;
  if (chainId === "trained-classify-draft-review" && /分类|路由|分级|标签|回复|投诉|客服/.test(input)) return 30;
  return 0;
}

function buildTrainedCandidateChains(input: string, candidates: TrainedProfileCandidate[]) {
  const byDomain = new Map<string, TrainedProfileCandidate[]>();
  for (const candidate of candidates) {
    const domain = candidate.domain || "generic";
    byDomain.set(domain, [...(byDomain.get(domain) || []), candidate]);
  }
  const chains = Array.from(byDomain.values()).flatMap((group) => chainsForCandidateGroup(input, group));

  return chains
    .filter((chain) => chain.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function compactTrainedCandidateChains(chains: TrainedCandidateChain[]) {
  return chains.map((chain) => ({
    id: chain.id,
    templateType: chain.templateType,
    chainShape: chain.chainShape,
    score: chain.score,
    matchTerms: chain.matchTerms,
    nodes: chain.nodes.map((node) => ({
      profileId: node.id,
      name: node.name,
      modelTier: node.modelTier,
      domain: node.domain,
      model: node.model,
      sourceNodeType: node.sourceNodeType,
      output: node.output,
      redLines: node.redLines,
      artifact: node.artifact,
      artifactPath: node.artifactPath,
    })),
  }));
}

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return fallback;
    return await res.json().catch(() => fallback);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeWorkflows(value: unknown): WorkflowDefinition[] {
  if (Array.isArray(value)) return value.filter(Boolean) as WorkflowDefinition[];
  if (value && typeof value === "object") {
    const record = value as { workflows?: unknown };
    if (Array.isArray(record.workflows)) return record.workflows.filter(Boolean) as WorkflowDefinition[];
    return Object.values(value as Record<string, unknown>).filter(Boolean) as WorkflowDefinition[];
  }
  return [];
}

async function readLocalWorkflows() {
  const raw = await readFile(WORKFLOW_CATALOG_PATH, "utf8");
  return normalizeWorkflows(JSON.parse(raw));
}

async function readLocalProfiles() {
  const raw = await readFile(PROFILE_CATALOG_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const profiles = Array.isArray(parsed)
    ? parsed
    : Object.values(parsed as Record<string, unknown>);
  return profiles.filter(Boolean) as AgentProfileItem[];
}

async function loadWorkflowRecommendationData() {
  if (process.env.PI_WORKFLOW_LOCAL_FIRST !== "0") {
    const [workflows, profiles] = await Promise.all([
      readLocalWorkflows().catch(() => []),
      readLocalProfiles().catch(() => []),
    ]);
    if (workflows.length || profiles.length) return { workflows, profiles };
  }

  const [workflowData, profileData] = await Promise.all([
    fetchJson<{ workflows?: WorkflowDefinition[] }>(`${WORKFLOW_BACKEND}/api/workflows`, { workflows: [] }),
    fetchJson<{ profiles?: AgentProfileItem[] }>(`${WORKFLOW_BACKEND}/api/agent-profiles`, { profiles: [] }),
  ]);
  let workflows = workflowData.workflows || [];
  let profiles = profileData.profiles || [];

  if (!workflows.length) workflows = await readLocalWorkflows().catch(() => []);
  if (!profiles.length) profiles = await readLocalProfiles().catch(() => []);
  return { workflows, profiles };
}

function blueprintOutputKind(input: string, templateType: string) {
  if (/播客|访谈|嘉宾|观点卡片|发布卡片/.test(input)) return "嘉宾观点卡片";
  if (/竞品|价格|功能|差异矩阵|选型/.test(input) && /报告|文件|预览|下载|交付/.test(input)) return "竞品选型报告";
  if (/报告|文件|预览|下载|交付|渲染|卡片/.test(input)) return "资料文件与预览";
  if (templateType === "classify-route") return "分类路由与草稿审查";
  if (templateType === "extract-writeback") return "字段抽取与写回校验";
  if (templateType === "generate-variants") return "批量变体与质量审查";
  if (templateType === "monitor-alert") return "事件分级与告警审查";
  if (/对比|矩阵|选型|竞品|价格|功能/.test(input)) return "对比矩阵与选型建议";
  if (/摘要|简报|报告|调研/.test(input)) return "调研简报与影响判断";
  return "资料摘要与判断建议";
}

function blueprintInputFields(templateType: string, input: string) {
  if (templateType === "classify-route") return ["task_goal", "items_to_classify", "label_schema", "draft_policy", "risk_rules"];
  if (templateType === "extract-writeback") return ["task_goal", "raw_materials", "target_schema", "writeback_rules"];
  if (templateType === "generate-variants") return ["task_goal", "source_materials", "variant_requirements", "brand_or_risk_rules"];
  if (templateType === "monitor-alert") return ["task_goal", "monitor_targets", "time_window", "source_materials", "alert_thresholds"];
  if (/链接|来源|资料|文件|搜索|调研|新闻|财报|政策|价格|功能|竞品|对比/.test(input)) return ["task_goal", "source_materials", "links", "output_format"];
  return ["task_goal", "output_format"];
}

function uniqStrings(values: Array<unknown>, fallback: string[], max = 5) {
  return uniqStringsWithLimit(values, fallback, max, 80);
}

function uniqStringsWithLimit(values: Array<unknown>, fallback: string[], max = 5, maxLength = 120) {
  const seen = new Set<string>();
  const cleaned = values
    .map((value) => stripForbidden(cleanInlineText(value, maxLength)))
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, max);
  return cleaned.length ? cleaned : fallback;
}

function mergeTuningWithRules(tuning: NodeTuning, nodeType: string): NodeTuning {
  const rules = microRulesForNodeType(nodeType);
  return {
    ...tuning,
    requiredInputs: uniqStringsWithLimit([...(tuning.requiredInputs || []), ...rules.requiredInputs], rules.requiredInputs, 7, 80),
    outputSchema: uniqStringsWithLimit([...(tuning.outputSchema || []), ...rules.outputSchema, ...rules.handoff], rules.outputSchema, 10, 150),
    riskRules: uniqStringsWithLimit([...(tuning.riskRules || []), ...rules.riskRules], rules.riskRules, 7, 140),
    acceptance: uniqStringsWithLimit([...(tuning.acceptance || []), ...rules.acceptance], rules.acceptance, 7, 120),
  };
}

function buildNodeTunings(input: string, templateType: string, outputKind: string): NodeTuning[] {
  const goal = cleanInlineText(input, 80);
  const scenario = outputKind || "定制产物";
  const nodeTunings: Record<string, NodeTuning[]> = {
    "fetch-summarize": [
      {
        id: "gather-facts",
        name: `${scenario}资料搜集`,
        purpose: `围绕「${goal}」搜集和搬运可定位事实，不做判断`,
        requiredInputs: ["task_goal", "source_materials", "links"],
        outputSchema: ["sources", "facts", "source_status", "uncertainties", "review_suggestions"],
        riskRules: ["无来源标记 missing/unverified", "不得补新闻、链接、价格或数字"],
        acceptance: ["每条事实有来源或缺失标记", "列出待复核点"],
      },
      {
        id: "standardize-pack",
        name: `${scenario}结构化`,
        purpose: `把上游事实整理成服务「${scenario}」的统一资料包`,
        requiredInputs: ["facts", "sources", "uncertainties"],
        outputSchema: ["comparison_dimensions", "fact_table", "missing_fields", "unsupported_claims"],
        riskRules: ["缺失字段保持 unknown", "不合并来源冲突的事实"],
        acceptance: ["输出可被判断节点消费的表格/schema", "保留来源状态"],
      },
      {
        id: "judge-summary",
        name: `${scenario}判断`,
        purpose: `基于结构化事实产出「${scenario}」，区分事实、推断和建议`,
        requiredInputs: ["fact_table", "comparison_dimensions", "missing_fields"],
        outputSchema: ["summary", "matrix", "recommendations", "evidence", "confidence", "counter_conditions"],
        riskRules: ["未验证来源不得高置信结论", "建议必须引用证据字段"],
        acceptance: ["包含证据锚点", "包含反证条件和置信度"],
      },
    ],
    "classify-route": [
      {
        id: "standardize-input",
        name: `${scenario}输入整理`,
        purpose: `把「${goal}」中的待处理留言/条目整理为可分类队列`,
        requiredInputs: ["task_goal", "items_to_classify", "label_schema"],
        outputSchema: ["items", "original_text", "context", "missing_fields"],
        riskRules: ["缺少上下文保持 unknown", "不改写原始含义"],
        acceptance: ["每个条目有原文和上下文", "缺失项可被下游识别"],
      },
      {
        id: "classify-route",
        name: `${scenario}分类路由`,
        purpose: `按用户规则为「${scenario}」输出标签、置信度和处理去向`,
        requiredInputs: ["items", "label_schema", "risk_rules"],
        outputSchema: ["label", "confidence", "route_target", "manual_review_reason", "risk_flags"],
        riskRules: ["低置信度转人工", "规则冲突转人工", "高风险不自动放行"],
        acceptance: ["每个条目有标签和置信度", "人工确认原因明确"],
      },
      {
        id: "draft-response",
        name: `${scenario}草稿生成`,
        purpose: `基于分类结果生成可编辑通知/回复草稿`,
        requiredInputs: ["label", "route_target", "draft_policy", "original_text"],
        outputSchema: ["drafts", "placeholders", "used_evidence", "risk_flags"],
        riskRules: ["不得新增未支持事实", "素材不足用占位符"],
        acceptance: ["草稿引用上游依据", "高风险条目标记待审"],
      },
      {
        id: "review-gate",
        name: `${scenario}审查裁决`,
        purpose: `审查分类、路由和草稿能否用于「${scenario}」`,
        requiredInputs: ["drafts", "risk_flags", "manual_review_reason"],
        outputSchema: ["decision", "issues", "rework_assignment", "final_acceptance"],
        riskRules: ["必须给出 pass/rework/blocked", "不只给建议"],
        acceptance: ["明确裁决", "指出返工节点或放行条件"],
      },
    ],
    "extract-writeback": [
      {
        id: "standardize-input",
        name: `${scenario}材料整理`,
        purpose: `整理「${goal}」的原始材料，保留原文锚点`,
        requiredInputs: ["task_goal", "raw_materials", "target_schema"],
        outputSchema: ["records", "source_spans", "missing_fields"],
        riskRules: ["不猜测缺失原文", "来源冲突标记"],
        acceptance: ["每个记录可追溯到原文", "缺失字段清晰"],
      },
      {
        id: "extract-validate",
        name: `${scenario}字段抽取`,
        purpose: `抽取并校验写回所需字段`,
        requiredInputs: ["records", "target_schema"],
        outputSchema: ["field_mapping", "payload", "validation_errors", "needs_review"],
        riskRules: ["不确定字段 needs_review", "必填缺失不默认填空"],
        acceptance: ["字段映射完整", "校验错误可定位"],
      },
      {
        id: "writeback-payload",
        name: `${scenario}Payload`,
        purpose: `生成可写回 payload、幂等键和失败重试建议`,
        requiredInputs: ["payload", "validation_errors", "writeback_rules"],
        outputSchema: ["writeback_payload", "idempotency_key", "retry_advice", "blocking_errors"],
        riskRules: ["必填缺失阻塞", "高风险动作不执行"],
        acceptance: ["payload 可被系统读取", "阻塞原因明确"],
      },
      {
        id: "review-gate",
        name: `${scenario}写回审查`,
        purpose: `裁决 payload 是否可用于写回`,
        requiredInputs: ["writeback_payload", "blocking_errors", "source_spans"],
        outputSchema: ["decision", "issues", "rework_assignment"],
        riskRules: ["必须裁决通过/返工/阻塞", "来源不足阻塞"],
        acceptance: ["有最终裁决", "有返工字段"],
      },
    ],
    "generate-variants": [
      {
        id: "strategy-plan",
        name: `${scenario}策略规划`,
        purpose: `为「${goal}」确定变体方向、约束和成功指标`,
        requiredInputs: ["task_goal", "source_materials", "variant_requirements"],
        outputSchema: ["strategy", "constraints", "metrics", "priority"],
        riskRules: ["不编造案例、金额、转化率", "策略不写成长文案"],
        acceptance: ["策略可指导生成节点", "指标可审查"],
      },
      {
        id: "draft-variants",
        name: `${scenario}变体生成`,
        purpose: `按策略批量生成可编辑变体`,
        requiredInputs: ["strategy", "constraints", "source_materials"],
        outputSchema: ["variants", "rationale", "placeholders", "risk_flags"],
        riskRules: ["不得越过素材事实边界", "素材不足用占位符"],
        acceptance: ["版本数量满足要求", "每版有适用场景"],
      },
      {
        id: "review-gate",
        name: `${scenario}质量审查`,
        purpose: `审查变体是否满足事实、风格和发布风险要求`,
        requiredInputs: ["variants", "risk_flags", "brand_or_risk_rules"],
        outputSchema: ["decision", "issues", "approved_variants", "rework_assignment"],
        riskRules: ["必须发布/返工/阻塞裁决", "事实风险不可放行"],
        acceptance: ["列出可用版本", "返工原因明确"],
      },
    ],
    "monitor-alert": [
      {
        id: "event-window-gather",
        name: `${scenario}事件整理`,
        purpose: `整理「${goal}」的事件窗口、来源和指标`,
        requiredInputs: ["task_goal", "monitor_targets", "time_window", "source_materials"],
        outputSchema: ["events", "timestamps", "sources", "source_status", "metric_changes"],
        riskRules: ["无来源变化标记 unverified", "不扩展到窗口外事实"],
        acceptance: ["事件有时间和来源", "证据缺口明确"],
      },
      {
        id: "alert-classify",
        name: `${scenario}触发分级`,
        purpose: `按阈值判断是否触发告警并分级`,
        requiredInputs: ["events", "metric_changes", "alert_thresholds"],
        outputSchema: ["severity", "trigger_reason", "recommended_action", "escalation"],
        riskRules: ["不得自行执行高风险动作", "证据冲突升级审查"],
        acceptance: ["分级有证据", "升级条件明确"],
      },
      {
        id: "severe-alert-review",
        name: `${scenario}重度审查`,
        purpose: `审查中重度告警是否升级、观察或驳回`,
        requiredInputs: ["severity", "trigger_reason", "evidence"],
        outputSchema: ["decision", "evidence_gap", "next_owner", "final_acceptance"],
        riskRules: ["必须裁决", "证据不足不得升级为确定结论"],
        acceptance: ["裁决明确", "下一步处理人明确"],
      },
    ],
  };
  const tunings = nodeTunings[templateType] || nodeTunings["fetch-summarize"];
  const recipe = TEMPLATE_RECIPES[templateType] || TEMPLATE_RECIPES["fetch-summarize"];
  return tunings.map((tuning, index) => mergeTuningWithRules(tuning, recipe.nodes[index]?.type || tuning.id || ""));
}

function buildNodeTuningsFromCombination(input: string, modelCombinationId: string, outputKind: string): NodeTuning[] {
  const combo = MODEL_COMBINATIONS[modelCombinationId];
  if (!combo) return buildNodeTunings(input, "fetch-summarize", outputKind);
  const goal = cleanInlineText(input, 80);
  return combo.nodes.map((node) => {
    const rules = microRulesForNodeType(node.nodeType);
    return mergeTuningWithRules({
      id: node.id,
      name: cleanInlineText(`${outputKind}${nodeTypeDisplayLabel(node.nodeType)}`, 64),
      purpose: `围绕「${goal}」执行${rules.plainRole}，产出「${outputKind}」所需的 ${rules.handoff.join("、")}；严格遵守 ${node.promptMode} 模式`,
      requiredInputs: rules.requiredInputs,
      outputSchema: rules.outputSchema,
      riskRules: rules.riskRules,
      acceptance: rules.acceptance,
    }, node.nodeType);
  });
}

function taskPromptFromTuning(tuning: NodeTuning, outputKind: string, nodeType: string) {
  const rules = microRulesForNodeType(nodeType);
  const requiredInputs = uniqStringsWithLimit(tuning.requiredInputs || [], ["task_goal"], 7, 90).join(", ");
  const outputSchema = uniqStringsWithLimit(tuning.outputSchema || [], ["result", "missing_fields", "risk_flags"], 10, 150).join(", ");
  const riskRules = uniqStringsWithLimit(tuning.riskRules || [], ["缺失信息标记 unknown", "不得编造未支持事实"], 7, 140).join("；");
  const acceptance = uniqStringsWithLimit(tuning.acceptance || [], ["输出满足 schema", "风险和缺失项已标记"], 7, 120).join("；");
  return [
    `节点角色：${rules.plainRole}。服务目标：「${outputKind}」。`,
    `本节点职责：${cleanInlineText(tuning.purpose, 240)}。`,
    `能力边界：${rules.capabilityBoundary}`,
    `读取字段：${requiredInputs}。`,
    `必须输出字段：${outputSchema}。`,
    `红线：${riskRules}。`,
    `完成标准：${acceptance}。`,
    "交接要求：只输出结构化结果，保留下游需要的证据、缺失项、风险标记和返工入口。",
  ].join("");
}

function tasksFromNodeTunings(templateType: string, nodeTunings: NodeTuning[] | undefined, outputKind: string): WorkflowTaskDefinition[] {
  const recipe = TEMPLATE_RECIPES[templateType] || TEMPLATE_RECIPES["fetch-summarize"];
  const tunings = nodeTunings?.length ? nodeTunings : buildNodeTunings("", templateType, outputKind);
  return recipe.nodes.map((node, index) => {
    const tuning = mergeTuningWithRules(tunings[index] || {}, node.type);
    const id = slug(String(tuning.id || node.type || `node-${index + 1}`), `node-${index + 1}`);
    const acceptance = uniqStrings(tuning.acceptance || [], ["输出满足 schema", "风险和缺失项已标记"], 5);
    return {
      id,
      name: cleanInlineText(tuning.name || `${outputKind}${node.label}`, 64),
      profileId: node.profileId,
      model: node.profileId.includes("strong") || node.profileId.includes("analyst") || node.profileId.includes("director") || node.profileId.includes("reviewer") ? "opencode-go/deepseek-v4-pro" : FLASH_MODEL,
      deps: index === 0 ? [] : [slug(String(tunings[index - 1]?.id || recipe.nodes[index - 1]?.type || `node-${index}`), `node-${index}`)],
      prompt: taskPromptFromTuning(tuning, outputKind, node.type),
      acceptanceCriteria: acceptance,
      definitionOfDone: `${outputKind} 的本节点输出已按 schema 产出，且缺失、低置信度和风险项可被下游节点消费。`,
    };
  });
}

function tasksFromCombinationNodeTunings(
  modelCombinationId: string,
  nodeTunings: NodeTuning[] | undefined,
  outputKind: string,
): WorkflowTaskDefinition[] {
  const combo = MODEL_COMBINATIONS[modelCombinationId];
  if (!combo) return tasksFromNodeTunings("fetch-summarize", nodeTunings, outputKind);
  const tunings = nodeTunings?.length === combo.nodes.length
    ? nodeTunings
    : buildNodeTuningsFromCombination("", modelCombinationId, outputKind);
  return combo.nodes.map((node, index) => {
    const tuning = mergeTuningWithRules(tunings[index] || {}, node.nodeType);
    const id = slug(String(tuning.id || node.id || `node-${index + 1}`), `node-${index + 1}`);
    const previousId = index === 0
      ? ""
      : slug(String(tunings[index - 1]?.id || combo.nodes[index - 1]?.id || `node-${index}`), `node-${index}`);
    const acceptance = uniqStringsWithLimit(tuning.acceptance || [], ["输出满足 schema", "风险和缺失项已标记"], 7, 120);
    return {
      id,
      name: cleanInlineText(tuning.name || `${outputKind}${nodeTypeDisplayLabel(node.nodeType)}`, 64),
      profileId: node.profileId,
      model: node.tier === "strong" ? "opencode-go/deepseek-v4-pro" : FLASH_MODEL,
      deps: previousId ? [previousId] : [],
      prompt: taskPromptFromTuning(tuning, outputKind, node.nodeType),
      acceptanceCriteria: acceptance,
      definitionOfDone: `${outputKind} 的 ${node.nodeType} 输出已按 schema 产出，且下游交接字段完整。`,
    };
  });
}

function inputContractFromBlueprint(templateType: string, outputKind: string, inputFields: string[] | undefined) {
  const base = defaultInputContractForTemplate(templateType);
  const requested = new Set((inputFields?.length ? inputFields : ["task_goal"]).concat("task_goal"));
  const fields = base.fields.filter((field) => requested.has(field.id));
  if (!fields.some((field) => field.id === "task_goal")) {
    fields.unshift({ id: "task_goal", label: "任务目标", type: "textarea", required: true, placeholder: `描述这次要产出的${outputKind}` });
  }
  return {
    ...base,
    title: `${outputKind}输入`,
    description: `一次性提交用于生成「${outputKind}」的目标、材料和约束。`,
    fields: fields.length ? fields : base.fields,
  };
}

function trainedChainOutputKind(input: string, chain: TrainedCandidateChain) {
  if (/简历|resume|求职|岗位|jd/.test(input)) return "简历修改与终审";
  if (/文案|标题|脚本|变体|广告/.test(input)) return "内容变体与审查";
  if (/报告|文件|预览|下载|交付|渲染|卡片|简报/.test(input)) return "资料文件与预览";
  if (/字段|写回|crm|表单/.test(input)) return "字段处理与写回";
  const artifacts = chain.nodes.map((node) => node.artifact).filter(Boolean);
  if (artifacts[0]) return cleanInlineText(artifacts[artifacts.length - 1] || artifacts[0], 18);
  return "专项产物与审查";
}

function nodeTypeDisplayLabel(sourceNodeType: string) {
  if (nodeTypeMatches(sourceNodeType, "Fetch/Gather")) return "资料搜集";
  if (nodeTypeMatches(sourceNodeType, "Standardize")) return "输入整理";
  if (nodeTypeMatches(sourceNodeType, "Classify/Route")) return "分类路由";
  if (nodeTypeMatches(sourceNodeType, "Extract/Validate")) return "字段抽取";
  if (nodeTypeMatches(sourceNodeType, "Generate/Draft")) return "草稿生成";
  if (nodeTypeMatches(sourceNodeType, "Analyze/Judge")) return "分析判断";
  if (nodeTypeMatches(sourceNodeType, "Strategize/Plan")) return "策略诊断";
  if (nodeTypeMatches(sourceNodeType, "Writeback/Action")) return "写回动作";
  if (nodeTypeMatches(sourceNodeType, "Review/Gate")) return "终审裁决";
  if (nodeTypeMatches(sourceNodeType, "Artifact/Render")) return "文件渲染";
  if (nodeTypeMatches(sourceNodeType, "Monitor/Alert")) return "监控告警";
  return cleanInlineText(sourceNodeType.replace("/", ""), 24);
}

function buildTrainedNodeTunings(input: string, chain: TrainedCandidateChain, outputKind: string): NodeTuning[] {
  const goal = cleanInlineText(input, 80);
  return chain.nodes.map((node) => {
    const rules = microRulesForNodeType(node.sourceNodeType);
    return mergeTuningWithRules({
      id: slug(node.sourceNodeType || node.id, node.id),
      name: cleanInlineText(`${outputKind}${nodeTypeDisplayLabel(node.sourceNodeType)}`, 64),
      purpose: `围绕「${goal}」执行 ${rules.plainRole}，产出「${outputKind}」所需的 ${node.artifact || "结构化中间结果"}；不得越过该 profile 的红线`,
      requiredInputs: ["task_goal", "source_materials", "upstream_result", ...rules.requiredInputs],
      outputSchema: node.output.length ? node.output : rules.outputSchema,
      riskRules: node.redLines.length ? node.redLines : rules.riskRules,
      acceptance: ["输出可被下游节点消费", "风险、缺失和低置信度已标记", ...rules.acceptance],
    }, node.sourceNodeType);
  });
}

function tasksFromTrainedChain(
  chain: TrainedCandidateChain,
  nodeTunings: NodeTuning[] | undefined,
  outputKind: string,
): WorkflowTaskDefinition[] {
  const tunings = nodeTunings?.length === chain.nodes.length ? nodeTunings : buildTrainedNodeTunings("", chain, outputKind);
  const usedIds = new Set<string>();
  return chain.nodes.map((node, index) => {
    const tuning = mergeTuningWithRules(tunings[index] || {}, node.sourceNodeType);
    let id = slug(String(tuning.id || node.sourceNodeType || node.id), `node-${index + 1}`);
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    const previousId = Array.from(usedIds)[index - 1];
    usedIds.add(id);
    const rules = microRulesForNodeType(node.sourceNodeType);
    const outputSchema = uniqStringsWithLimit(tuning.outputSchema || node.output, ["result", "evidence", "risk_flags", "missing_fields"], 10, 150);
    const riskRules = uniqStringsWithLimit(tuning.riskRules || node.redLines, ["缺失信息标记 unknown", "不得编造未支持事实"], 7, 140);
    const requiredInputs = uniqStringsWithLimit(tuning.requiredInputs || rules.requiredInputs, ["task_goal", "upstream_result"], 7, 90);
    const acceptance = uniqStringsWithLimit(tuning.acceptance || [], ["输出满足 schema", "风险和缺失项已标记"], 7, 120);
    return {
      id,
      name: stripForbidden(cleanInlineText(tuning.name || `${outputKind}${nodeTypeDisplayLabel(node.sourceNodeType)}`, 64)),
      profileId: node.id,
      model: node.model || (node.modelTier === "strong" ? "opencode-go/deepseek-v4-pro" : FLASH_MODEL),
      deps: previousId ? [previousId] : [],
      prompt: stripForbidden(cleanInlineText(
        [
          `节点角色：${rules.plainRole}。服务目标：「${outputKind}」。`,
          `本节点职责：${tuning.purpose || `执行 ${node.sourceNodeType}，产出 ${node.artifact || "结构化结果"}`}。`,
          `能力边界：${rules.capabilityBoundary}`,
          `读取字段：${requiredInputs.join(", ")}。`,
          `必须输出字段：${outputSchema.join(", ")}。`,
          `红线：${riskRules.join("；")}。`,
          `完成标准：${acceptance.join("；")}。`,
          "交接要求：只使用输入和上游结果，保留证据、缺失项、风险标记和下游可消费字段。",
        ].join(""),
        1400,
      )),
      definitionOfDone: stripForbidden(cleanInlineText(`${node.artifact || outputKind} 已按字段输出，且可被下游 ${chain.nodes[index + 1]?.sourceNodeType || "终审/用户"} 消费。`, 220)),
      acceptanceCriteria: acceptance,
    };
  });
}

function buildTrainedChainBlueprint(input: string, domain: string, chain: TrainedCandidateChain): FlashWorkflowDecision {
  const outputKind = trainedChainOutputKind(input, chain);
  return {
    kind: "workflow-generation",
    decision: "create-from-profiles",
    trainedChainId: chain.id,
    trainedProfileIds: chain.nodes.map((node) => node.id),
    scenarioId: chain.id,
    templateType: chain.templateType,
    domain: domain || "generic",
    outputKind,
    needsHumanReview: chain.nodes.some((node) => node.sourceNodeType.includes("Review") || node.modelTier === "strong"),
    materialPolicy: "goal-first",
    inputFields: blueprintInputFields(chain.templateType, input),
    nodeTunings: buildTrainedNodeTunings(input, chain, outputKind),
    patchSummary: [`按 trained profile 有效路径生成「${outputKind}」`],
    guidance: ["已生成可运行 workflow，可打开后输入目标和资料运行。"],
  };
}

function buildLocalFlashBlueprint(
  input: string,
  domain: string,
  templateType: string,
  trainedCandidateChains: TrainedCandidateChain[] = [],
): FlashWorkflowDecision {
  if (trainedCandidateChains[0]) return buildTrainedChainBlueprint(input, domain, trainedCandidateChains[0]);
  const modelCombinationId = inferModelCombinationId(input, templateType);
  const effectiveTemplateType = MODEL_COMBINATIONS[modelCombinationId]?.templateType || normalizeTemplateType(templateType, "fetch-summarize");
  const scenarioId = inferScenarioId(input, modelCombinationId);
  const outputKind = blueprintOutputKind(input, effectiveTemplateType);
  return {
    kind: "workflow-generation",
    decision: "create-from-profiles",
    modelCombinationId,
    scenarioId,
    templateType: effectiveTemplateType,
    domain: domain || "generic",
    outputKind,
    needsHumanReview: !["fetch-summarize"].includes(effectiveTemplateType) || /风险|审查|确认|人工|裁决|写回|告警/.test(input),
    materialPolicy: blueprintInputFields(effectiveTemplateType, input).length > 2 ? "materials-required" : "goal-first",
    inputFields: blueprintInputFields(effectiveTemplateType, input),
    nodeTunings: buildNodeTuningsFromCombination(input, modelCombinationId, outputKind),
    patchSummary: [`按「${outputKind}」微调模板`],
    guidance: ["已生成，可打开后输入目标运行。"],
  };
}

function buildFlashPrompt(
  input: string,
  domain: string,
  templateType: string,
  seedBlueprint: FlashWorkflowDecision,
  trainedCandidateChains: TrainedCandidateChain[],
) {
  const fixedOutput = JSON.stringify(seedBlueprint);
  const compactTrainedChains = compactTrainedCandidateChains(trainedCandidateChains);
  const compactCombinationCatalog = Object.entries(MODEL_COMBINATIONS).map(([id, combo]) => ({
    id,
    templateType: combo.templateType,
    modelChain: combo.modelChain,
    scenarios: combo.scenarios,
    nodes: combo.nodes.map((node) => ({
      id: node.id,
      tier: node.tier,
      profileId: node.profileId,
      boundary: node.capabilityBoundary,
      promptMode: node.promptMode,
    })),
  }));
  const compactNodeRules = Object.fromEntries(Object.entries(NODE_MICRO_TUNING_RULES).map(([id, rules]) => [id, {
    tier: rules.modelTier,
    role: rules.plainRole,
    boundary: rules.capabilityBoundary,
    output: rules.outputSchema,
    redLines: rules.riskRules,
    handoff: rules.handoff,
  }]));
  return [
    "你是 Workflow 主界面的 Flash Workflow Blueprint Filler。本次调用是全新干净上下文。",
    "",
    "后端已经完成检索、trained profile 扫描和模型组合穷举。你不要扫描文件，不要创造新结构。",
    "决策顺序固定：先判断用户需要哪条通用节点链，再判断是否有同形状、同领域、同任务的 trained_candidate_chain 可作为专项微调。",
    "如果 trained_candidate_chain 只是相似但不是同任务，不要选它；改从 model_combination_catalog 选择通用节点链。",
    "trained profile 不是新的节点体系，它只是通用节点类型的专项微调版本。",
    "选定组合后，只轻量改写 seed_json 的短文本，使它更贴近用户目标；如果 seed_json 已经贴合，就原样返回。",
    "只输出 JSON 对象。不要 Markdown，不要解释。总长度小于 1800 字。",
    "",
    "可选择：trainedChainId 必须来自 trained_candidate_chains.id；modelCombinationId 必须来自 catalog.id；scenarioId 必须来自所选组合的 scenarios 或 trainedChainId。",
    "不可创造：节点数量、节点顺序、profileId、强弱模型链路。",
    "可微调：outputKind、inputFields、nodeTunings.name、purpose、requiredInputs、outputSchema、riskRules、acceptance、patchSummary、guidance。",
    "微调方法：先看节点 nodeType/sourceNodeType，从 11 个 node_micro_tuning_rules 复制对应 output/redLines/handoff；只把字段名和短描述贴近用户任务。",
    "",
    "硬规则：",
    "1. decision 固定 create-from-profiles。",
    "2. 如果选择 trainedChainId，templateType 必须等于该链 templateType，trainedProfileIds 必须等于该链 nodes.profileId 顺序；该链必须能解释为通用节点链的专项版本。",
    "3. 如果选择 modelCombinationId，templateType 必须等于所选 catalog.templateType。",
    `4. domain 固定 ${domain || seedBlueprint.domain || "generic"}。`,
    "5. outputKind 8-18 个中文字符。",
    "6. 每个 purpose 必须含用户场景词和最终产物词。",
    "7. 每个 nodeTuning 必须遵守对应节点 boundary/profile redLines，不得让弱模型做策略裁决、风险裁决或编造事实。",
    "8. 每个 nodeTuning.outputSchema 至少 5 个字段，必须包含下游交接字段。",
    "9. 每个 nodeTuning.riskRules 至少 3 条，弱模型节点必须含不得编造/缺失标记/低置信转人工或待审规则。",
    "10. 不写完整 task prompt。",
    "11. 不出现训练、样本、标准答案、调试记录。",
    "",
    `用户需求：${input}`,
    `本地候选 templateType：${templateType || seedBlueprint.templateType || "fetch-summarize"}`,
    "trained_candidate_chains:",
    JSON.stringify(compactTrainedChains),
    "model_combination_catalog:",
    JSON.stringify(compactCombinationCatalog),
    "node_micro_tuning_rules:",
    JSON.stringify(compactNodeRules),
    "seed_json，可直接微调后输出：",
    fixedOutput,
  ].join("\n");
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  for (let start = trimmed.indexOf("{"); start >= 0; start = trimmed.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") inString = true;
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, index + 1));
        } catch {
          break;
        }
      }
    }
  }

  return null;
}

function normalizeTemplateType(value: unknown, fallback: string) {
  const candidate = cleanInlineText(value, 80);
  if (TEMPLATE_TYPES.has(candidate)) return candidate;
  return TEMPLATE_TYPES.has(fallback) ? fallback : "fetch-summarize";
}

function normalizeModelCombinationId(value: unknown, fallbackTemplateType: string) {
  const candidate = cleanInlineText(value, 120);
  if (MODEL_COMBINATION_IDS.has(candidate)) return candidate;
  const normalizedTemplateType = normalizeTemplateType(fallbackTemplateType, "fetch-summarize");
  return Object.entries(MODEL_COMBINATIONS).find(([, combo]) => combo.templateType === normalizedTemplateType)?.[0] || "combo-fetch-structure-judge";
}

function inferModelCombinationId(input: string, templateType: string) {
  if (/报告|文件|预览|下载|交付|渲染|卡片|简报/.test(input)) {
    if (/转写|访谈|播客|会议|纪要|原文|录音|观点|金句|摘录/.test(input)) return "combo-standardize-judge-render-review";
    if (/调研|竞品|来源|官网|价格|访谈|事实|证据|矩阵/.test(input)) return "combo-gather-judge-render-review";
    return "combo-plan-generate-render-review";
  }
  return normalizeModelCombinationId("", templateType);
}

function inferScenarioId(input: string, modelCombinationId: string) {
  if (/报告|文件|预览|下载|交付|渲染|卡片|简报/.test(input)) {
    return MODEL_COMBINATIONS[modelCombinationId]?.scenarios[0] || "report-card-render";
  }
  if (/价格|功能|竞品|对比|矩阵|选型|pricing|compare/.test(input)) return "competitor-compare";
  if (/新闻|政策|融资|调研|报告|简报/.test(input)) return "research-brief";
  if (/分类|标签|路由|分级/.test(input)) return "comment-triage";
  if (/通知|留言|回复|人工确认|客服/.test(input)) return "message-notice-draft";
  if (/crm|写回|payload|字段|抽取|表单|发票/.test(input)) return "payload-generation";
  if (/标题|封面|广告|文案|脚本|变体|a\/b|ab/.test(input)) return "ab-copy-variants";
  if (/监控|告警|预警|阈值|异常|舆情|风险窗口/.test(input)) return "risk-threshold-monitor";
  return MODEL_COMBINATIONS[modelCombinationId]?.scenarios[0] || "research-brief";
}

function templateWorkflowId(templateType: string) {
  return `template-${templateType}`;
}

function workflowDraftFromFlashBlueprint(
  decision: FlashWorkflowDecision,
  input: string,
  inferredDomain: string,
  inferredTemplateType: string,
  trainedCandidateChains: TrainedCandidateChain[] = [],
): FlashWorkflowDecision {
  const selectedTrainedChain = decision.trainedChainId
    ? trainedCandidateChains.find((chain) => chain.id === decision.trainedChainId)
    : null;
  if (selectedTrainedChain) {
    const domain = stripForbidden(cleanInlineText(decision.domain || inferredDomain || "generic", 80));
    const outputKind = stripForbidden(cleanInlineText(decision.outputKind || trainedChainOutputKind(input, selectedTrainedChain), 36));
    const normalizedTunings = decision.nodeTunings?.length === selectedTrainedChain.nodes.length
      ? decision.nodeTunings
      : buildTrainedNodeTunings(input, selectedTrainedChain, outputKind);
    return {
      ...decision,
      kind: "workflow-generation",
      decision: "create-from-profiles",
      trainedChainId: selectedTrainedChain.id,
      trainedProfileIds: selectedTrainedChain.nodes.map((node) => node.id),
      scenarioId: decision.scenarioId || selectedTrainedChain.id,
      templateType: selectedTrainedChain.templateType,
      domain,
      outputKind,
      generationReason: stripForbidden(cleanInlineText(decision.generationReason || `使用 trained profile 有效路径「${selectedTrainedChain.chainShape}」生成「${outputKind}」。`, 180)),
      tunedTemplate: {
        templateType: selectedTrainedChain.templateType,
        baseTemplateId: selectedTrainedChain.id,
        patchSummary: decision.patchSummary?.length ? decision.patchSummary.slice(0, 2) : [`按 trained profile 链路生成「${outputKind}」`],
      },
      workflowDraft: {
        ...(decision.workflowDraft || decision.workflow || {}),
        name: stripForbidden(cleanInlineText(decision.workflowDraft?.name || decision.workflow?.name || `${outputKind} Workflow`, 80)),
        description: stripForbidden(cleanInlineText(decision.workflowDraft?.description || decision.workflow?.description || `使用已训练 profile 链路 ${selectedTrainedChain.chainShape}，完成${outputKind}。`, 360)),
        domain,
        category: domain,
        templateType: selectedTrainedChain.templateType,
        inputContract: inputContractFromBlueprint(selectedTrainedChain.templateType, outputKind, decision.inputFields),
        leadProfileId: selectedTrainedChain.nodes.find((node) => node.modelTier === "strong")?.id || selectedTrainedChain.nodes[0]?.id || "strong-task-architect",
        reviewPolicy: selectedTrainedChain.nodes.some((node) => node.sourceNodeType.includes("Review") || node.modelTier === "strong") ? "lead_plus_reviewer" : "lead_only",
        tasks: tasksFromTrainedChain(selectedTrainedChain, normalizedTunings, outputKind),
      },
      guidance: decision.guidance?.length
        ? decision.guidance.map((item) => cleanInlineText(item, 60)).filter(Boolean).slice(0, 2)
        : ["已按匹配的 trained profile 链路生成 workflow，可打开后输入目标和资料运行。"],
    };
  }

  const modelCombinationId = normalizeModelCombinationId(decision.modelCombinationId, decision.templateType || inferredTemplateType);
  const combinationTemplateType = MODEL_COMBINATIONS[modelCombinationId]?.templateType;
  const templateType = normalizeTemplateType(
    combinationTemplateType || decision.templateType || decision.tunedTemplate?.templateType || decision.workflowDraft?.templateType || decision.workflow?.templateType,
    inferredTemplateType,
  );
  const domain = stripForbidden(cleanInlineText(decision.domain || decision.workflowDraft?.domain || decision.workflow?.domain || inferredDomain || "generic", 80));
  const outputKind = stripForbidden(cleanInlineText(decision.outputKind || decision.workflowDraft?.name || decision.workflow?.name || input, 36));
  const patchSummary = (decision.patchSummary || decision.tunedTemplate?.patchSummary || [])
    .map((item) => stripForbidden(cleanInlineText(item, 40)))
    .filter(Boolean)
    .slice(0, 2);
  const draft = decision.workflowDraft || decision.workflow || {};
  const comboNodeCount = MODEL_COMBINATIONS[modelCombinationId]?.nodes.length || 0;
  const normalizedTunings = comboNodeCount && decision.nodeTunings?.length === comboNodeCount
    ? decision.nodeTunings
    : buildNodeTuningsFromCombination(input, modelCombinationId, outputKind);
  const inputContract = draft.inputContract?.fields?.length
    ? draft.inputContract
    : inputContractFromBlueprint(templateType, outputKind, decision.inputFields);
  const tasks = draft.tasks?.length
    ? draft.tasks
    : tasksFromCombinationNodeTunings(modelCombinationId, normalizedTunings, outputKind);

  return {
    ...decision,
    kind: "workflow-generation",
    decision: "create-from-profiles",
    modelCombinationId,
    scenarioId: decision.scenarioId || inferScenarioId(input, modelCombinationId),
    templateType,
    generationReason: stripForbidden(cleanInlineText(decision.generationReason || `为「${outputKind}」生成一个按场景微调的 ${templateType} workflow。`, 180)),
    tunedTemplate: {
      templateType,
      baseTemplateId: decision.tunedTemplate?.baseTemplateId || templateWorkflowId(templateType),
      patchSummary: patchSummary.length ? patchSummary : [`按「${outputKind || "任务"}」微调模板`],
    },
    workflowDraft: {
      ...draft,
      name: stripForbidden(cleanInlineText(draft.name || `${outputKind || "自定义任务"} Workflow`, 80)),
      description: stripForbidden(cleanInlineText(draft.description || `用于${outputKind || "完成用户目标"}；按 ${templateType} 模板展开节点，并保留缺失信息、风险项和审查结论。`, 360)),
      domain,
      category: domain,
      templateType,
      inputContract,
      leadProfileId: draft.leadProfileId || "strong-task-architect",
      reviewPolicy: decision.needsHumanReview === false ? "lead_only" : "lead_plus_reviewer",
      tasks,
    },
    guidance: decision.guidance?.length
      ? decision.guidance.map((item) => cleanInlineText(item, 60)).filter(Boolean).slice(0, 2)
      : ["已生成微调 workflow，可打开后输入目标运行。"],
  };
}

async function askFlashForWorkflow(input: string, domain: string, templateType: string, trainedCandidateChains: TrainedCandidateChain[]) {
  const sessionDir = await mkdtemp(join(tmpdir(), "pi-workflow-recommend-"));
  const seedBlueprint = buildLocalFlashBlueprint(input, domain, templateType, trainedCandidateChains);
  const prompt = buildFlashPrompt(input, domain, templateType, seedBlueprint, trainedCandidateChains);
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn("pi", [
        "--print",
        "--mode",
        "text",
        "--model",
        FLASH_MODEL,
        "--no-session",
        "--session-dir",
        sessionDir,
        "--no-context-files",
        "--no-tools",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        prompt,
      ], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PI_CODING_AGENT_SESSION_DIR: sessionDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("Flash recommendation timed out"));
      }, FLASH_TIMEOUT_MS);
      proc.stdout.on("data", (chunk) => { stdout += String(chunk); });
      proc.stderr.on("data", (chunk) => { stderr += String(chunk); });
      proc.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || `Flash exited with code ${code}`));
          return;
        }
        resolve(stdout || stderr);
      });
    });
    const parsed = extractJsonObject(output) as FlashWorkflowDecision | null;
    return workflowDraftFromFlashBlueprint(parsed || seedBlueprint, input, domain, templateType, trainedCandidateChains);
  } finally {
    await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }
}

function slug(value: string, fallback: string) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
  return ascii || fallback;
}

function profileModel(profileId: string, profileMap: Map<string, AgentProfileItem>) {
  return profileMap.get(profileId)?.defaultModel || (profileId.includes("strong") || profileId.includes("director") || profileId.includes("reviewer") || profileId.includes("analyst")
    ? "opencode-go/deepseek-v4-pro"
    : FLASH_MODEL);
}

function sanitizeTasks(tasks: WorkflowTaskDefinition[] | undefined, profileMap: Map<string, AgentProfileItem>, templateType: string) {
  const usedIds = new Set<string>();
  return (tasks || [])
    .slice(0, 8)
    .map((task, index) => {
      const profileId = task.profileId && profileMap.has(task.profileId) ? task.profileId : fallbackProfileForTemplate(templateType, index);
      const fallbackId = `node-${index + 1}`;
      let id = slug(String(task.id || task.name || fallbackId), fallbackId);
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      const deps = Array.isArray(task.deps) ? task.deps.map((dep) => slug(String(dep), "")).filter((dep) => usedIds.has(dep)) : [];
      return {
        id,
        name: stripForbidden(cleanInlineText(task.name || `Workflow Node ${index + 1}`, 64)),
        profileId,
        model: task.model || profileModel(profileId, profileMap),
        deps: index === 0 ? [] : (deps.length ? deps : [Array.from(usedIds)[index - 1]].filter(Boolean)),
        prompt: stripForbidden(cleanInlineText(task.prompt || "执行本节点任务，输出结构化结果；缺失信息必须标记 unknown，不得编造。", 1400)),
        definitionOfDone: stripForbidden(cleanInlineText(task.definitionOfDone || "输出满足本节点验收标准，且保留缺失项和风险项。", 220)),
        acceptanceCriteria: (Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [])
          .map((item) => stripForbidden(cleanInlineText(item, 120)))
          .filter(Boolean)
          .slice(0, 6),
        noTools: task.noTools,
      };
    })
    .filter((task) => task.name && task.profileId);
}

function fallbackProfileForTemplate(templateType: string, index: number) {
  const chain = (TEMPLATE_RECIPES[templateType] || TEMPLATE_RECIPES["fetch-summarize"]).nodes.map((node) => node.profileId);
  return chain[Math.min(index, chain.length - 1)];
}

function templateRecipeProfileIds(templateType: string) {
  return (TEMPLATE_RECIPES[templateType] || TEMPLATE_RECIPES["fetch-summarize"]).nodes.map((node) => node.profileId);
}

function followsTemplateRecipe(tasks: WorkflowTaskDefinition[] | undefined, templateType: string) {
  const expectedProfiles = templateRecipeProfileIds(templateType);
  if (!Array.isArray(tasks) || tasks.length !== expectedProfiles.length) return false;
  return tasks.every((task, index) => task.profileId === expectedProfiles[index]);
}

function deterministicWorkflow(input: string, domain: string, templateType: string, profileMap: Map<string, AgentProfileItem>): Partial<WorkflowDefinition> {
  const type = templateType || "fetch-summarize";
  const domainLabel = domain === "generic" ? "通用" : domain;
  const taskTemplates: Record<string, WorkflowTaskDefinition[]> = {
    "fetch-summarize": [
      { id: "gather-facts", name: "资料搜集与事实搬运", profileId: "weak-research-extractor", prompt: "从用户提供的资料、链接、文件或工具结果中抽取可定位事实；每条事实必须包含来源、原文锚点、不确定点和复核建议。不得凭记忆补新闻、数字、链接或媒体名。", acceptanceCriteria: ["包含来源", "包含事实列表", "标记不确定点", "无来源输出 source_status=missing/unverified"] },
      { id: "standardize-pack", name: "资料包标准化", profileId: "weak-structured-operator", prompt: "把上游事实整理为统一资料包 schema，按主题去重归类；缺失字段保持 unknown，不猜测。", acceptanceCriteria: ["输出统一 schema", "保留来源字段", "缺失字段不猜测"] },
      { id: "judge-summary", name: "影响判断与摘要", profileId: "research-report-analyst", prompt: "基于事实包输出摘要、影响判断、证据锚点、置信度和反证条件。对未验证来源不得下高置信结论。", acceptanceCriteria: ["区分事实/推断/建议", "包含证据锚点", "包含置信度", "包含反证条件"] },
    ],
    "classify-route": [
      { id: "standardize-input", name: "输入标准化", profileId: "weak-structured-operator", prompt: "将用户输入整理为可分类条目，保留原文、来源、上下文字段；缺失项保持 unknown。", acceptanceCriteria: ["条目化输入", "保留原文", "缺失项不猜测"] },
      { id: "classify-route", name: "分类打标与路由", profileId: "classification-router", prompt: "按固定标签输出分类、confidence、emotion/risk、route_target 和人工审核原因。低置信度、高风险或标签冲突必须转人工。", acceptanceCriteria: ["包含标签", "包含 confidence", "包含 route_target", "低置信度转人工"] },
      { id: "draft-response", name: "自动处理草稿", profileId: "support-kb-responder", prompt: "基于分类结果生成可编辑处理草稿；不得新增上游未支持事实、案例或数字；素材不足时输出占位符和待补信息。", acceptanceCriteria: ["草稿引用上游依据", "风险项不自动放行", "素材不足有占位符"] },
      { id: "review-gate", name: "风险审查与放行", profileId: "strong-quality-reviewer", prompt: "检查分类、路由和草稿是否满足成功标准，输出 publish/pass、rework 或 blocked 的明确裁决，并列出返工节点。", acceptanceCriteria: ["给出明确裁决", "列出问题清单", "指定返工节点"] },
    ],
    "extract-writeback": [
      { id: "standardize-input", name: "输入整理", profileId: "weak-structured-operator", prompt: "把非结构化材料整理为字段抽取输入包，保留原文段落和来源。", acceptanceCriteria: ["输入包结构统一", "保留原文锚点", "缺失项不猜测"] },
      { id: "extract-validate", name: "字段抽取与校验", profileId: "structured-writeback-operator", prompt: "抽取目标字段、校验格式和必填项，输出字段映射、payload、幂等键和原文锚点；不确定字段标记 needs_review。", acceptanceCriteria: ["包含字段映射", "包含 payload", "包含幂等键", "不确定字段转人工"] },
      { id: "writeback-payload", name: "写回 Payload 生成", profileId: "structured-writeback-operator", prompt: "生成最终写回 payload、字段校验结果和失败重试建议。必填项缺失必须阻塞，不允许默认为 0 或空。", acceptanceCriteria: ["包含写回 payload", "包含校验结果", "必填缺失阻塞"] },
      { id: "review-gate", name: "写回风险审查", profileId: "strong-quality-reviewer", prompt: "审查写回 payload 的字段完整性、来源锚点和高风险写入动作，输出通过/返工/阻塞裁决。", acceptanceCriteria: ["给出明确裁决", "标记高风险动作", "列出返工字段"] },
    ],
    "generate-variants": [
      { id: "strategy-plan", name: "生成策略规划", profileId: "strong-task-architect", prompt: "根据用户目标定义生成方向、约束、成功指标和执行优先级；只做策略，不写长文案，不编造案例、金额或转化率。", acceptanceCriteria: ["包含策略方向", "包含约束", "包含验证指标"] },
      { id: "draft-variants", name: "批量变体生成", profileId: "content-draft-producer", prompt: "依据上游策略和素材生成可编辑初稿/变体；不得新增未支持事实、案例或数字；素材不足用占位符标记。", acceptanceCriteria: ["输出多版本", "遵守素材边界", "包含待审风险"] },
      { id: "review-gate", name: "质量审查与定稿", profileId: "content-editor-reviewer", prompt: "审查变体是否符合定位、事实边界和发布风险，输出发布/返工/阻塞裁决及返工分配。", acceptanceCriteria: ["给出明确裁决", "指出事实风险", "指定返工节点"] },
    ],
    "monitor-alert": [
      { id: "event-window-gather", name: "事件窗口整理", profileId: "weak-research-extractor", prompt: "整理监控窗口内的事件、指标、来源和时间戳；没有来源的变化标记 unverified。", acceptanceCriteria: ["包含时间窗口", "包含事件列表", "包含来源状态"] },
      { id: "alert-classify", name: "触发判断与分级", profileId: "monitor-alert-operator", prompt: "基于阈值和证据判断是否触发告警，输出轻/中/重分级、触发原因、建议动作和升级条件；不得自行执行高风险动作。", acceptanceCriteria: ["包含触发原因", "包含分级", "包含升级条件", "高风险动作不执行"] },
      { id: "severe-alert-review", name: "重度告警审查", profileId: "strong-quality-reviewer", prompt: "仅审查中重度或证据冲突告警，输出升级/观察/驳回裁决、证据缺口和下一步处理人。", acceptanceCriteria: ["给出明确裁决", "包含证据缺口", "包含下一步处理"] },
    ],
  };
  return {
    name: `Custom ${domain}-${type}：${cleanInlineText(input, 28) || "自定义 Workflow"}`,
    description: `根据用户需求自动生成的 ${domainLabel} ${type} workflow；先由弱模型完成结构化处理，再由强模型处理策略/审查节点。`,
    domain,
    category: domain,
    templateType: type,
    inputContract: defaultInputContractForTemplate(type),
    leadProfileId: "strong-task-architect",
    reviewPolicy: "lead_plus_reviewer",
    tasks: sanitizeTasks(taskTemplates[type] || taskTemplates["fetch-summarize"], profileMap, type),
  };
}

function sanitizeWorkflowDraft(
  draft: Partial<WorkflowDefinition> | undefined,
  input: string,
  domain: string,
  templateType: string,
  profileMap: Map<string, AgentProfileItem>,
  allowCustomTaskChain = false,
) {
  const fallback = deterministicWorkflow(input, domain, templateType, profileMap);
  const effectiveTemplateType = cleanInlineText(draft?.templateType || fallback.templateType || templateType || "fetch-summarize", 60);
  const candidateTasks = sanitizeTasks(draft?.tasks || fallback.tasks, profileMap, effectiveTemplateType);
  const tasks = allowCustomTaskChain && candidateTasks.length >= 2
    ? candidateTasks
    : followsTemplateRecipe(candidateTasks, effectiveTemplateType)
    ? candidateTasks
    : (fallback.tasks || []);
  const rawName = stripForbidden(cleanInlineText(draft?.name || fallback.name || "Custom Workflow", 80));
  const name = /^[a-z0-9][a-z0-9\s:-]*：/i.test(rawName)
    ? rawName
    : `Custom ${domain}-${effectiveTemplateType}：${rawName}`;
  return {
    name,
    description: stripForbidden(cleanInlineText(draft?.description || fallback.description || "", 400)),
    status: "active" as const,
    debugStatus: "unverified" as const,
    domain: stripForbidden(cleanInlineText(draft?.domain || domain || fallback.domain || "generic", 80)),
    category: stripForbidden(cleanInlineText(draft?.category || draft?.domain || domain || fallback.category || "generic", 80)),
    templateType: effectiveTemplateType,
    inputContract: draft?.inputContract?.fields?.length ? draft.inputContract : defaultInputContractForTemplate(effectiveTemplateType),
    leadProfileId: profileMap.has(String(draft?.leadProfileId || "")) ? draft?.leadProfileId : "strong-task-architect",
    reviewPolicy: draft?.reviewPolicy === "lead_only" ? "lead_only" as const : "lead_plus_reviewer" as const,
    tasks: tasks.length ? tasks : fallback.tasks,
  };
}

async function saveGeneratedWorkflow(workflow: Partial<WorkflowDefinition>) {
  if (process.env.PI_WORKFLOW_LOCAL_FIRST !== "0") {
    return saveGeneratedWorkflowLocal(workflow);
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BACKEND_SAVE_TIMEOUT_MS);
    const res = await fetch(`${WORKFLOW_BACKEND}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`保存生成 Workflow 失败：HTTP ${res.status}`);
    const data = await res.json().catch(() => ({})) as { workflow?: WorkflowDefinition };
    if (!data.workflow) throw new Error("保存生成 Workflow 失败：响应缺少 workflow");
    if (!data.workflow.inputContract?.fields?.length && workflow.inputContract?.fields?.length) {
      const patchController = new AbortController();
      const patchTimeout = setTimeout(() => patchController.abort(), BACKEND_SAVE_TIMEOUT_MS);
      const patchRes = await fetch(`${WORKFLOW_BACKEND}/api/workflows/${encodeURIComponent(data.workflow.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputContract: workflow.inputContract }),
        signal: patchController.signal,
      });
      clearTimeout(patchTimeout);
      const patchData = await patchRes.json().catch(() => ({})) as { workflow?: WorkflowDefinition };
      if (patchRes.ok && patchData.workflow) return patchData.workflow;
    }
    return data.workflow;
  } catch {
    return saveGeneratedWorkflowLocal(workflow);
  }
}

async function saveGeneratedWorkflowLocal(workflow: Partial<WorkflowDefinition>) {
  const raw = await readFile(WORKFLOW_CATALOG_PATH, "utf8");
  const workflows = JSON.parse(raw) as Record<string, WorkflowDefinition>;
  const now = Date.now();
  const base = slug(String(workflow.name || "generated-workflow"), "workflow");
  let id = base;
  let counter = 2;
  while (workflows[id]) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  const saved: WorkflowDefinition = {
    id,
    name: String(workflow.name || "未命名 Workflow"),
    description: workflow.description,
    status: workflow.status || "active",
    debugStatus: workflow.debugStatus || "unverified",
    domain: workflow.domain || "generic",
    category: workflow.category || workflow.domain || "generic",
    templateType: workflow.templateType || "fetch-summarize",
    leadProfileId: workflow.leadProfileId || "strong-task-architect",
    reviewPolicy: workflow.reviewPolicy === "lead_only" ? "lead_only" : "lead_plus_reviewer",
    createdAt: now,
    updatedAt: now,
    inputContract: workflow.inputContract,
    tasks: workflow.tasks || [],
  };
  workflows[id] = saved;
  await writeFile(WORKFLOW_CATALOG_PATH, JSON.stringify(workflows, null, 2) + "\n");
  return saved;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  const input = normalizeText(typeof body?.task === "string" ? body.task.trim() : "");
  if (!input) return Response.json({ error: "Task is required" }, { status: 400 });

  const recommendationData = await loadWorkflowRecommendationData();
  const workflows = recommendationData.workflows.filter((workflow) => workflow.status !== "legacy");
  const searchableWorkflows = workflows.filter((workflow) => !workflowHasUserFacingPathLeak(workflow));
  const profiles = recommendationData.profiles;
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const domain = inferDomain(input);
  const template = inferTemplateType(input);
  const trainedCandidates = trainedProfileCandidates(profiles, input);
  const trainedCandidateChains = buildTrainedCandidateChains(input, trainedCandidates);

  const activeRecommendations = searchableWorkflows
    .filter((workflow) => workflow.status !== "template")
    .map((workflow) => scoreWorkflow(workflow, input, domain.domain, template.templateType))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const templateRecommendations = searchableWorkflows
    .filter((workflow) => workflow.status === "template")
    .map((workflow) => scoreWorkflow(workflow, input, "generic", template.templateType))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const searchElapsedMs = Date.now() - startedAt;

  if (activeRecommendations[0] && canUseExistingWorkflow(activeRecommendations[0].workflow, activeRecommendations[0].score, input, domain.domain)) {
    return Response.json({
      model: FLASH_MODEL,
      mode: "catalog-search",
      cleanContext: true,
      decision: "use-existing",
      searchSummary: "已先检索当前 Workflow 数据库，最高匹配达到直接复用阈值。",
      inferred: {
        domain: domain.domain,
        templateType: template.templateType || activeRecommendations[0].workflow.templateType || "",
        confidence: Math.min(0.96, Math.max(0.56, activeRecommendations[0].score / 100)),
      },
      recommendations: activeRecommendations.map((item) => ({
        workflow: item.workflow,
        score: item.score,
        reasons: item.reasons,
      })),
      templateRecommendations: templateRecommendations.map((item) => ({
        workflow: item.workflow,
        score: item.score,
        reasons: item.reasons,
      })),
      profilePlan: profilePlan(activeRecommendations[0].workflow, profiles),
      guidance: [
        "已命中现有 workflow，点击打开后在 workflow 界面输入本次任务材料运行。",
        "弱模型节点处理采集、结构化、分类、草稿；强模型节点保留在策略、判断和终审。",
      ],
      timings: {
        searchBudgetMs: SEARCH_BUDGET_MS,
        generationBudgetMs: GENERATION_BUDGET_MS,
        searchElapsedMs,
        totalElapsedMs: Date.now() - startedAt,
      },
    });
  }

  const topTemplateRecommendation = templateRecommendations.find((item) => canUseTemplateWorkflow(item.workflow, item.score, template.templateType));
  const baseTemplateType = template.templateType || topTemplateRecommendation?.workflow.templateType || templateRecommendations[0]?.workflow.templateType || "";

  let flashDecision: FlashWorkflowDecision | null = null;
  let decisionSource: "flash" | "blueprint" = "blueprint";
  try {
    flashDecision = await askFlashForWorkflow(input, domain.domain, baseTemplateType, trainedCandidateChains);
    decisionSource = "flash";
  } catch {
    decisionSource = "blueprint";
  }
  if (!flashDecision) {
    const localBlueprint = buildLocalFlashBlueprint(input, domain.domain, baseTemplateType, trainedCandidateChains);
    flashDecision = workflowDraftFromFlashBlueprint(localBlueprint, input, domain.domain, baseTemplateType, trainedCandidateChains);
  }

  const flashWorkflowId = cleanInlineText(flashDecision?.workflowId, 120);
  const flashExisting = flashWorkflowId
    ? workflows.find((workflow) => workflow.id === flashWorkflowId && workflow.status !== "template")
    : null;
  const flashTemplate = flashWorkflowId
    ? workflows.find((workflow) => workflow.id === flashWorkflowId && workflow.status === "template")
    : null;

  if (flashDecision?.decision === "use-existing" && flashExisting) {
    const selected = scoreWorkflow(flashExisting, input, domain.domain, template.templateType);
    if (!canUseExistingWorkflow(flashExisting, selected.score, input, domain.domain)) {
      flashDecision = {
        ...flashDecision,
        decision: "create-from-profiles",
        generationReason: "Flash 命中的已有 workflow 只满足模板相似，行业/输入输出语义不足，改用通用 Profile 生成。",
      };
    } else {
      const recommendations = [
        selected,
        ...activeRecommendations.filter((item) => item.workflow.id !== flashExisting.id),
      ].slice(0, 3);
      return Response.json({
        model: FLASH_MODEL,
        mode: "flash-catalog-search",
        cleanContext: true,
        decision: "use-existing",
        searchSummary: flashDecision.matchReason || "Flash 在干净上下文中检索 catalog 后选择复用已有 workflow。",
        inferred: {
          domain: domain.domain,
          templateType: flashExisting.templateType || template.templateType || "",
          confidence: Math.min(0.95, Math.max(0.6, selected.score / 100)),
        },
        recommendations: recommendations.map((item) => ({
          workflow: item.workflow,
          score: item.score,
          reasons: item.reasons,
        })),
        templateRecommendations: templateRecommendations.map((item) => ({
          workflow: item.workflow,
          score: item.score,
          reasons: item.reasons,
        })),
        profilePlan: profilePlan(flashExisting, profiles),
        guidance: flashDecision.guidance?.length ? flashDecision.guidance : [
          "已由 Flash 复核 catalog 后命中已有 workflow，点击打开即可进入 workflow 界面。",
        ],
      });
    }
  }

  if (flashDecision?.decision === "customize-template" && flashTemplate) {
    flashDecision = workflowDraftFromFlashBlueprint({
      ...flashDecision,
      decision: "create-from-profiles",
      templateType: flashTemplate.templateType || baseTemplateType,
      tunedTemplate: {
        templateType: flashTemplate.templateType || baseTemplateType,
        baseTemplateId: flashTemplate.id,
        patchSummary: flashDecision.tunedTemplate?.patchSummary || ["以模板为骨架生成定制 workflow"],
      },
    }, input, domain.domain, flashTemplate.templateType || baseTemplateType, trainedCandidateChains);
  }

  const selectedTemplateType = flashDecision?.workflowDraft?.templateType || flashDecision?.templateType || flashDecision?.workflow?.templateType || baseTemplateType || "fetch-summarize";
  const generatedDraft = sanitizeWorkflowDraft(
    {
      ...(flashDecision?.workflowDraft || flashDecision?.workflow || {}),
      tasks: flashDecision?.workflowDraft?.tasks || flashDecision?.workflow?.tasks || flashDecision?.tasks,
    },
    input,
    domain.domain,
    selectedTemplateType,
    profileMap,
    Boolean(flashDecision?.trainedChainId || flashDecision?.modelCombinationId),
  );
  const generatedWorkflow = await saveGeneratedWorkflow(generatedDraft);
  const selectedTemplate = templateRecommendations[0]?.workflow || null;

  return Response.json({
    model: FLASH_MODEL,
    mode: decisionSource === "flash" ? "flash-create-from-profiles" : "blueprint-create-from-profiles",
    cleanContext: true,
    generationPlan: {
      modelCombinationId: flashDecision?.modelCombinationId || "",
      trainedChainId: flashDecision?.trainedChainId || "",
      trainedProfileIds: flashDecision?.trainedProfileIds || [],
      scenarioId: flashDecision?.scenarioId || "",
      modelChain: flashDecision?.trainedChainId
        ? trainedCandidateChains.find((chain) => chain.id === flashDecision?.trainedChainId)?.chainShape || ""
        : flashDecision?.modelCombinationId ? MODEL_COMBINATIONS[flashDecision.modelCombinationId]?.modelChain || "" : "",
    },
    tunedTemplate: flashDecision?.tunedTemplate || {
      templateType: selectedTemplateType,
      baseTemplateId: selectedTemplate?.id || "",
      patchSummary: ["基于通用模板节点体系生成可运行 workflow。"],
    },
    decision: "create-from-profiles",
    searchSummary: topTemplateRecommendation
      ? "检索阶段未找到精确业务 workflow；已把最接近的通用模板作为定制骨架。"
      : "检索阶段未找到精确业务 workflow；已进入定制生成。",
    generationReason: flashDecision?.generationReason || "当前需求需要由通用 Profile 重新组合。",
    inferred: {
      domain: generatedWorkflow.domain || domain.domain,
      templateType: generatedWorkflow.templateType || selectedTemplateType,
      confidence: 0.58,
    },
    recommendations: activeRecommendations.map((item) => ({
      workflow: item.workflow,
      score: item.score,
      reasons: item.reasons,
    })),
    templateRecommendations: templateRecommendations.map((item) => ({
      workflow: item.workflow,
      score: item.score,
      reasons: item.reasons,
    })),
    generatedWorkflow,
    profilePlan: profilePlan(generatedWorkflow, profiles),
    guidance: flashDecision?.guidance?.length ? flashDecision.guidance : [
      "已根据通用 Profile 生成并保存新的 workflow，点击打开后可以继续微调节点。",
      selectedTemplate ? `可参考模板「${selectedTemplate.name}」的节点形态继续收敛验收标准。` : "弱模型节点负责可验证的小任务，强模型节点负责最终审查和复杂判断。",
    ],
    timings: {
      searchBudgetMs: SEARCH_BUDGET_MS,
      generationBudgetMs: GENERATION_BUDGET_MS,
      searchElapsedMs,
      generationElapsedMs: Date.now() - startedAt - searchElapsedMs,
      totalElapsedMs: Date.now() - startedAt,
    },
  });
}
