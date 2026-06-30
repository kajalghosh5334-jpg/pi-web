import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowStore = join(__dirname, "..", "workflows.json");
const workflows = JSON.parse(readFileSync(workflowStore, "utf-8"));

const cwd = "/Users/yipengfei/Desktop/pi-fork";
const now = 1782860300000;

function task(id, name, profileId, model, prompt, deps, acceptanceCriteria) {
  return { id, name, profileId, model, prompt, deps, acceptanceCriteria };
}

function workflow(id, name, domain, templateType, description, tasks, options = {}) {
  return {
    id,
    name,
    description,
    leadProfileId: options.leadProfileId || "strong-task-architect",
    reviewPolicy: options.reviewPolicy || "lead_plus_reviewer",
    sourceSessionId: "",
    cwd,
    projectId: "",
    createdAt: workflows[id]?.createdAt || now,
    updatedAt: now,
    status: "active",
    domain,
    templateType,
    tasks,
  };
}

const flash = "opencode-go/deepseek-v4-flash";
const pro = "opencode-go/deepseek-v4-pro";

const seeds = [
  workflow("self-media-topic-mining", "自媒体选题挖掘", "self-media", "fetch-summarize", "输入垂直领域关键词，输出近 7 天热点、评论区高频问题、10 个选题和预测互动理由。", [
    task("topic-sources", "热点与评论来源整理", "content-researcher", flash, "抓取/整理近 7 天热点、竞品内容、评论区高频问题和来源链接；只做事实整理。", [], ["包含热点来源", "包含评论区问题", "包含时间窗口", "包含不确定点"]),
    task("topic-cluster", "痛点聚类与选题池", "weak-structured-operator", flash, "把素材聚类为用户痛点、争议点、需求场景和候选选题池。", ["topic-sources"], ["包含痛点聚类", "包含争议点", "包含候选选题", "包含证据"]),
    task("topic-rank", "选题排序与预测理由", "content-strategy-director", pro, "筛选 10 个选题，给出预测完播率/互动率理由、平台适配和验证指标。", ["topic-cluster"], ["输出 10 个选题", "包含完播率/互动率理由", "包含平台适配", "包含验证指标"]),
  ]),
  workflow("self-media-title-cover-ab", "自媒体标题封面 A/B 生成", "self-media", "generate-variants", "输入正文内容，生成标题+封面文案组合，并标注点击逻辑。", [
    task("tc-brief", "内容卖点与风险边界", "content-strategy-director", pro, "提炼正文核心卖点、受众、平台语境、禁止夸张点和标题封面测试目标。", [], ["包含核心卖点", "包含受众", "包含平台语境", "包含禁止夸张点"]),
    task("tc-generate", "标题封面组合生成", "content-draft-producer", flash, "生成 5 组标题+封面文案组合，标注悬念/数字/反差/利益点等套路标签。", ["tc-brief"], ["包含 5 组组合", "包含套路标签", "包含封面文案", "包含预期点击逻辑"]),
    task("tc-review", "点击诱导与品牌审查", "content-editor-reviewer", pro, "审查标题党、误导、敏感表达和品牌一致性，输出推荐排序和可发布版本。", ["tc-generate"], ["包含风险审查", "包含推荐排序", "包含可发布版本", "包含返工建议"]),
  ]),
  workflow("self-media-data-review-weekly", "自媒体数据复盘周报", "self-media", "fetch-summarize", "输入播放/完播/转粉等近期数据，输出异常归因和下期选题建议。", [
    task("dr-normalize", "发布数据标准化", "weak-structured-operator", flash, "整理播放、完播、互动、转粉、发布时间、选题标签和渠道字段。", [], ["包含播放数据", "包含完播数据", "包含互动数据", "包含选题标签"]),
    task("dr-alert", "异常波动识别", "monitor-alert-operator", flash, "识别异常上涨/下跌，输出 severity、trigger_reason、evidence 和可能影响因素。", ["dr-normalize"], ["包含异常项", "包含严重程度", "包含证据", "包含触发原因"]),
    task("dr-insight", "复盘结论与选题建议", "content-strategy-director", pro, "归因异常波动，输出周报摘要、内容模式结论和下期选题建议。", ["dr-alert"], ["包含周报摘要", "包含异常归因", "包含内容模式", "包含下期选题"]),
  ]),
  workflow("industry-source-monitoring-daily", "行业信息源每日监控简报", "research", "fetch-summarize", "输入行业关键词，每日输出新闻/财报/政策/竞品动态的事件-影响-来源简报。", [
    task("is-fetch", "信息源抓取整理", "weak-research-extractor", flash, "整理新闻、财报、政策、竞品动态、发布时间和来源。", [], ["包含新闻", "包含财报/政策", "包含竞品动态", "包含来源"]),
    task("is-structure", "事件-影响-来源表", "weak-structured-operator", flash, "输出三栏结构：事件、影响、信息源，并标记置信度。", ["is-fetch"], ["包含事件", "包含影响", "包含信息源", "包含置信度"]),
    task("is-brief", "简报判断与优先级", "research-report-analyst", pro, "判断哪些事件需要关注，输出优先级、潜在影响和下一步跟踪点。", ["is-structure"], ["包含优先级", "包含潜在影响", "包含跟踪点", "区分事实和判断"]),
  ]),
  workflow("industry-competitor-diff-tracking", "竞品定点变化追踪", "research", "monitor-alert", "输入竞品名单，追踪官网/社媒/招聘/定价变化，输出 diff 提醒。", [
    task("cd-snapshot", "竞品页面快照整理", "weak-research-extractor", flash, "整理官网、小红书、招聘页、定价页的新旧快照和来源位置。", [], ["包含页面来源", "包含新旧快照", "包含时间", "包含位置"]),
    task("cd-diff", "变化 diff 提取", "weak-structured-operator", flash, "提取新产品、新岗位、定价调整、文案变化和证据片段。", ["cd-snapshot"], ["包含新产品变化", "包含岗位变化", "包含定价变化", "包含证据"]),
    task("cd-alert", "变化重要性分级", "monitor-alert-operator", flash, "按影响分级输出轻度/中度/重度提醒和升级建议。", ["cd-diff"], ["包含 severity", "包含原因", "包含建议动作", "包含升级条件"]),
  ]),
  workflow("industry-interview-summary", "专家/用户访谈速记整理", "research", "extract-writeback", "输入访谈转写，输出结构化摘要、关键引述和待验证假设。", [
    task("iv-clean", "访谈转写清理", "weak-structured-operator", flash, "整理说话人、时间戳、主题段落和疑似转写错误。", [], ["包含说话人", "包含时间戳", "包含主题段落", "包含疑似错误"]),
    task("iv-extract", "访谈洞察抽取", "structured-writeback-operator", flash, "抽取关键观点、原文引述、需求/痛点、反例和待验证假设。", ["iv-clean"], ["包含关键观点", "包含原文引述", "包含痛点", "包含待验证假设"]),
    task("iv-synthesis", "研究假设与验证路径", "research-report-analyst", pro, "合成访谈摘要，区分事实、观点、假设和下一步验证。", ["iv-extract"], ["区分事实和观点", "包含假设", "包含验证路径", "包含证据缺口"]),
  ]),
  workflow("industry-sentiment-risk-alert", "行业/品牌舆情风险预警", "research", "monitor-alert", "输入品牌或行业名称，监控负面舆情突增并触发分级告警。", [
    task("sr-collect", "舆情事件采集", "weak-research-extractor", flash, "整理负面内容、平台、传播量、时间窗口、原始链接和代表性评论。", [], ["包含负面内容", "包含平台", "包含传播量", "包含代表性评论"]),
    task("sr-grade", "舆情分级告警", "monitor-alert-operator", flash, "判断轻度记录/中度日报/重度即时推送，输出触发原因和证据。", ["sr-collect"], ["包含分级", "包含触发原因", "包含证据", "包含建议动作"]),
    task("sr-review", "重度风险复核", "strong-quality-reviewer", pro, "复核重度舆情的误报风险、品牌影响和对外响应建议。", ["sr-grade"], ["包含误报风险", "包含品牌影响", "包含响应建议", "包含升级条件"]),
  ]),
  workflow("ecommerce-review-mining", "客户评价与问大家分析", "ecommerce", "fetch-summarize", "输入评论数据，输出痛点/好评聚类、产品优化建议和营销话术弹药库。", [
    task("rm-clean", "评价数据清洗", "weak-structured-operator", flash, "整理评价、问大家、评分、SKU、时间和购买场景字段。", [], ["包含评价", "包含问大家", "包含 SKU", "包含购买场景"]),
    task("rm-cluster", "痛点与好评点聚类", "weak-structured-operator", flash, "聚类高频痛点、好评点、异议和典型原文。", ["rm-clean"], ["包含痛点聚类", "包含好评点", "包含异议", "包含典型原文"]),
    task("rm-action", "产品与营销建议", "ecommerce-listing-optimizer", flash, "输出产品优化建议、详情页可用话术、FAQ 和营销弹药库。", ["rm-cluster"], ["包含产品建议", "包含营销话术", "包含 FAQ", "区分事实和推测"]),
  ]),
  workflow("ecommerce-inventory-pricing-alert", "库存与定价异常预警", "ecommerce", "monitor-alert", "输入库存与竞品价格数据，输出补货提醒和动态调价建议。", [
    task("ip-normalize", "库存价格数据整理", "weak-structured-operator", flash, "整理实时库存、销量、补货周期、竞品价格、毛利约束和历史价格。", [], ["包含库存", "包含销量", "包含竞品价格", "包含毛利约束"]),
    task("ip-alert", "异常与补货触发", "monitor-alert-operator", flash, "判断库存风险、价格异常和调价触发，输出 severity 和建议动作。", ["ip-normalize"], ["包含库存风险", "包含价格异常", "包含 severity", "包含建议动作"]),
    task("ip-review", "调价风险审查", "strong-quality-reviewer", pro, "审查调价建议对毛利、平台规则和品牌定位的风险，输出人工审批建议。", ["ip-alert"], ["包含审批建议", "包含毛利风险", "包含平台风险", "包含人工确认项"]),
  ]),
  workflow("ecommerce-promo-creative-batch", "大促文案与海报批量生产", "ecommerce", "generate-variants", "输入活动主题和商品池，批量产出营销文案与海报排版稿。", [
    task("pc-brief", "活动策略与商品分组", "strong-task-architect", pro, "定义活动目标、人群、商品分组、优惠表达边界和测试指标。", [], ["包含活动目标", "包含人群", "包含商品分组", "包含表达边界"]),
    task("pc-copy", "多版本营销文案", "ecommerce-listing-optimizer", flash, "按商品分组生成多版本主标题、副标题、卖点、CTA 和海报文案。", ["pc-brief"], ["包含主标题", "包含副标题", "包含卖点", "包含 CTA"]),
    task("pc-review", "促销风险审查", "strong-quality-reviewer", pro, "审查价格承诺、平台违禁词、夸张表达和活动一致性。", ["pc-copy"], ["包含风险审查", "包含可用版本", "包含删除建议", "包含测试建议"]),
  ]),
  workflow("support-auto-answer", "常见问题自动应答", "customer-support", "classify-route", "输入用户咨询，匹配知识库回答；低置信度转人工并记录未命中问题。", [
    task("aa-classify", "咨询分类与知识匹配", "support-kb-responder", flash, "分类用户咨询，匹配知识库条目，输出置信度和未命中原因。", [], ["包含分类", "包含知识条目", "包含置信度", "包含未命中原因"]),
    task("aa-draft", "自动回复草稿", "support-kb-responder", flash, "生成标准回复草稿；低置信度或高风险问题必须 manual_review_required=true。", ["aa-classify"], ["包含回复草稿", "包含 manual_review_required", "包含不能承诺内容", "包含升级条件"]),
    task("aa-review", "高风险回复审查", "strong-quality-reviewer", pro, "审查退款/赔偿/法务/投诉相关回复，输出可发版本或转人工原因。", ["aa-draft"], ["包含可发版本", "包含转人工原因", "包含风险说明", "包含返工建议"]),
  ]),
  workflow("support-ticket-priority-routing", "工单分类与优先级路由", "customer-support", "classify-route", "输入工单内容，输出分类标签、优先级和处理队列。", [
    task("tp-normalize", "工单字段标准化", "weak-structured-operator", flash, "整理工单内容、客户等级、订单信息、时间、渠道和历史记录。", [], ["包含工单内容", "包含客户等级", "包含时间", "包含渠道"]),
    task("tp-route", "分类优先级判断", "classification-router", flash, "输出咨询/投诉/紧急故障等标签、优先级、处理队列和原因。", ["tp-normalize"], ["包含标签", "包含优先级", "包含队列", "包含原因"]),
    task("tp-sla", "SLA 与升级审查", "strong-quality-reviewer", pro, "审查紧急/高价值/投诉工单路由是否符合 SLA，输出调整建议。", ["tp-route"], ["包含 SLA 判断", "包含升级建议", "包含风险工单", "包含调整建议"]),
  ]),
  workflow("support-prehandoff-info-collection", "转人工前信息收集", "customer-support", "extract-writeback", "多轮对话前置收集订单号、问题描述、期望解决方案。", [
    task("ph-extract", "已有信息抽取", "structured-writeback-operator", flash, "从对话中抽取订单号、问题描述、期望方案、联系方式和缺失字段。", [], ["包含订单号字段", "包含问题描述", "包含期望方案", "包含缺失字段"]),
    task("ph-question", "补充问题生成", "support-kb-responder", flash, "针对缺失字段生成简洁补充问题，不重复询问已提供信息。", ["ph-extract"], ["包含补充问题", "不重复已知信息", "包含转人工摘要", "包含用户可执行步骤"]),
    task("ph-payload", "人工队列 payload", "structured-writeback-operator", flash, "生成转人工队列 payload、字段校验结果和原文锚点。", ["ph-question"], ["包含 payload", "包含字段校验", "包含原文锚点", "包含人工备注"]),
  ]),
  workflow("support-service-quality-review", "客服服务质检与话术复盘", "customer-support", "fetch-summarize", "输入客服历史对话，输出违规话术、服务标准打分和优化建议。", [
    task("qa-extract", "对话结构化", "weak-structured-operator", flash, "整理客服对话、用户诉求、客服动作、承诺语句和结果。", [], ["包含用户诉求", "包含客服动作", "包含承诺语句", "包含结果"]),
    task("qa-score", "质检打分", "classification-router", flash, "按服务标准输出违规话术、得分、问题标签和证据片段。", ["qa-extract"], ["包含违规检测", "包含得分", "包含问题标签", "包含证据"]),
    task("qa-coach", "话术优化建议", "strong-quality-reviewer", pro, "审查质检结果，输出可替换话术、培训建议和高风险案例。", ["qa-score"], ["包含替换话术", "包含培训建议", "包含高风险案例", "包含复盘结论"]),
  ]),
  workflow("sales-lead-scoring", "电话销售线索初筛与分级", "sales", "classify-route", "输入 CRM 新线索，结合成交特征输出 A/B/C 级和跟进优先级。", [
    task("ls-normalize", "线索字段整理", "structured-writeback-operator", flash, "整理来源、行业、规模、预算、职位、历史互动和缺失字段。", [], ["包含来源", "包含行业规模", "包含预算", "包含历史互动"]),
    task("ls-score", "线索评分与分级", "sales-call-analyst", pro, "基于历史成交特征输出 A/B/C 分级、评分理由和跟进优先级。", ["ls-normalize"], ["包含 A/B/C 分级", "包含评分理由", "包含优先级", "包含不确定项"]),
    task("ls-route", "跟进队列建议", "classification-router", flash, "按分级和优先级输出处理队列、SLA 和人工确认条件。", ["ls-score"], ["包含处理队列", "包含 SLA", "包含人工确认条件", "包含日志字段"]),
  ]),
  workflow("sales-precall-brief", "电话销售通话前简报", "sales", "fetch-summarize", "输入客户历史交互记录，输出一页通话简报和切入话术。", [
    task("pb-history", "客户历史整理", "weak-research-extractor", flash, "整理客户背景、历史交互、上次沟通要点、已知异议和未解决问题。", [], ["包含客户背景", "包含历史交互", "包含上次要点", "包含已知异议"]),
    task("pb-angle", "本次切入策略", "sales-call-analyst", pro, "输出本次目标、切入点、关键问题、异议预案和禁忌点。", ["pb-history"], ["包含本次目标", "包含切入点", "包含关键问题", "包含异议预案"]),
    task("pb-brief", "一页通话简报", "weak-structured-operator", flash, "生成一页通话简报结构化版本，方便销售会前阅读。", ["pb-angle"], ["包含背景", "包含话术切入", "包含问题清单", "包含下一步建议"]),
  ]),
  workflow("sales-objection-coach", "销售异议处理建议", "sales", "classify-route", "输入客户异议原文，匹配话术库并标记新异议类型。", [
    task("oc-classify", "异议类型识别", "classification-router", flash, "把客户异议分类为价格、竞品、时机、决策权、预算、信任等类型，输出置信度。", [], ["包含异议类型", "包含置信度", "包含原文依据", "包含新类型判断"]),
    task("oc-response", "应对建议生成", "sales-call-analyst", pro, "基于异议类型输出应对话术、追问问题和下一步动作。", ["oc-classify"], ["包含应对话术", "包含追问问题", "包含下一步动作", "包含风险提示"]),
    task("oc-kb", "话术库迭代项", "structured-writeback-operator", flash, "生成话术库新增/更新 payload，保留原文锚点和审核状态。", ["oc-response"], ["包含更新 payload", "包含原文锚点", "包含审核状态", "包含幂等键"]),
  ]),
  workflow("sales-followup-cadence", "销售跟进节奏与草稿生成", "sales", "generate-variants", "根据客户阶段和通话结果，生成下次跟进时间与话术/短信草稿。", [
    task("fc-stage", "客户阶段与动作整理", "structured-writeback-operator", flash, "整理客户阶段、通话结果、承诺时间、异议点和下一步动作。", [], ["包含客户阶段", "包含通话结果", "包含承诺时间", "包含异议点"]),
    task("fc-plan", "跟进节奏建议", "sales-call-analyst", pro, "输出下次跟进时间、触发条件、沟通目标和风险点。", ["fc-stage"], ["包含跟进时间", "包含触发条件", "包含沟通目标", "包含风险点"]),
    task("fc-draft", "跟进话术草稿", "content-draft-producer", flash, "生成短信、微信、电话开场白三种跟进草稿，保持销售语气专业克制。", ["fc-plan"], ["包含短信草稿", "包含微信草稿", "包含电话话术", "包含可替换字段"]),
  ]),
];

for (const item of seeds) {
  workflows[item.id] = { ...(workflows[item.id] || {}), ...item };
}

writeFileSync(workflowStore, `${JSON.stringify(workflows, null, 2)}\n`);
console.log(`seeded ${seeds.length} industry workflows`);
