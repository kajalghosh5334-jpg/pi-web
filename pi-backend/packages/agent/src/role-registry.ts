export interface Role {
	id: string;
	name: string;
	perspective: string;
	concerns: string[];
	checkpoints: string[];
	triggerConditions: string;
}

export const ROLE_REGISTRY: Record<string, Role> = {
	"business-advisor": {
		id: "business-advisor",
		name: "商业顾问",
		perspective: "关注商业模式、盈利能力、市场可行性",
		concerns: ["商业闭环", "成本结构", "现金流", "市场规模"],
		checkpoints: ["商业模式是否可持续？", "成本是否可控？", "有没有清晰的盈利路径？"],
		triggerConditions: "需要验证商业可行性、设计商业模式时",
	},

	"content-planner": {
		id: "content-planner",
		name: "内容策划",
		perspective: "关注选题策略、内容节奏、用户吸引力",
		concerns: ["选题方向", "内容差异化", "持续产出能力", "用户留存"],
		checkpoints: ["选题是否有持续性？", "内容能否形成差异化？", "生产流程是否可复制？"],
		triggerConditions: "需要设计选题系统、规划内容策略时",
	},

	"growth-hacker": {
		id: "growth-hacker",
		name: "增长黑客",
		perspective: "关注流量获取、转化漏斗、增长杠杆",
		concerns: ["获客渠道", "转化率", "留存率", "裂变机制"],
		checkpoints: ["流量来源是否可控？", "转化路径是否顺畅？", "有没有自然增长的杠杆点？"],
		triggerConditions: "需要设计增长策略、优化转化时",
	},

	"data-analyst": {
		id: "data-analyst",
		name: "数据分析师",
		perspective: "关注指标定义、数据追踪、效果验证",
		concerns: ["核心指标", "数据埋点", "A/B测试", "归因分析"],
		checkpoints: ["关键指标是否清晰？", "数据是否可追踪？", "能否验证假设？"],
		triggerConditions: "需要验证效果、优化策略时",
	},

	"tech-architect": {
		id: "tech-architect",
		name: "技术架构师",
		perspective: "关注技术选型、系统稳定性、可扩展性",
		concerns: ["技术栈", "性能", "可维护性", "成本"],
		checkpoints: ["技术方案是否可行？", "系统能否承载预期流量？", "技术债务是否可控？"],
		triggerConditions: "需要技术选型、架构设计时",
	},

	"user-researcher": {
		id: "user-researcher",
		name: "用户研究员",
		perspective: "关注用户画像、需求痛点、行为路径",
		concerns: ["用户画像", "真实需求", "使用场景", "决策链"],
		checkpoints: ["用户画像是否清晰？", "痛点是否真实？", "是否找到了关键使用场景？"],
		triggerConditions: "需要验证用户需求、优化体验时",
	},

	"product-manager": {
		id: "product-manager",
		name: "产品经理",
		perspective: "关注产品定位、功能优先级、用户体验",
		concerns: ["产品定位", "核心功能", "用户体验", "竞品差异"],
		checkpoints: ["产品定位是否清晰？", "功能优先级是否合理？", "用户体验是否流畅？"],
		triggerConditions: "需要产品规划、功能设计时",
	},

	"operations-specialist": {
		id: "operations-specialist",
		name: "运营专员",
		perspective: "关注用户运营、社群管理、活动策划",
		concerns: ["用户活跃", "社群氛围", "活动效果", "用户反馈"],
		checkpoints: ["用户是否活跃？", "社群氛围是否健康？", "运营动作是否有效？"],
		triggerConditions: "需要用户运营、社群建设时",
	},
};

export function getRoleById(id: string): Role | undefined {
	return ROLE_REGISTRY[id];
}

export function getRolesByNames(names: string[]): Role[] {
	return Object.values(ROLE_REGISTRY).filter((role) => names.includes(role.name));
}

export function getAllRoles(): Role[] {
	return Object.values(ROLE_REGISTRY);
}
