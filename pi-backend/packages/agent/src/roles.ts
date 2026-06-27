export type AgentRole = "planner" | "executor" | "reviewer" | "guardian";

export interface AgentConfig {
	name: AgentRole;
	modelTier: "critical" | "routine";
	canModifyBrief: boolean;
	canExecuteFiles: boolean;
	canReviewResult: boolean;
	responsibility: string;
	preferredModels: string[];
}

export interface ExecutionBrief {
	locked: boolean;
	sourceStage: string;
	goal: string;
	approvedPlan: string[];
	allowedFiles: string[];
	forbiddenActions: string[];
	acceptanceCriteria: string[];
	hardConstraints: string[];
}

export interface AgentContext {
	activeAgent: AgentRole;
	lastCompletedAgent: AgentRole | null;
	handoffQueue: AgentRole[];
	executionBrief: ExecutionBrief;
	stageProgress: {
		current: string;
		completed: string[];
		pending: string[];
	};
}

export const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
	planner: {
		name: "planner",
		modelTier: "critical",
		canModifyBrief: true,
		canExecuteFiles: false,
		canReviewResult: false,
		responsibility: "关键10%：规划、约束锁定、高风险判断",
		preferredModels: ["opencore-go/glm-5.2", "opencore-go/deepseek-v4-pro"],
	},
	executor: {
		name: "executor",
		modelTier: "routine",
		canModifyBrief: false,
		canExecuteFiles: true,
		canReviewResult: false,
		responsibility: "常规90%：实施执行，必须服从 execution_brief",
		preferredModels: ["opencore-go/kimi-k2.7-code", "opencore-go/glm-5.2"],
	},
	reviewer: {
		name: "reviewer",
		modelTier: "critical",
		canModifyBrief: false,
		canExecuteFiles: false,
		canReviewResult: true,
		responsibility: "关键10%：终审、风险把关、返工分流",
		preferredModels: ["opencore-go/deepseek-v4-pro", "opencore-go/glm-5.2"],
	},
	guardian: {
		name: "guardian",
		modelTier: "routine",
		canModifyBrief: false,
		canExecuteFiles: false,
		canReviewResult: false,
		responsibility: "常驻监控：检测模型失败、超时、异常，触发切换",
		preferredModels: ["opencore-go/deepseek-v4-flash"],
	},
};

export class AgentHandoff {
	private context: AgentContext;

	constructor(initialContext?: Partial<AgentContext>) {
		this.context = {
			activeAgent: "planner",
			lastCompletedAgent: null,
			handoffQueue: [],
			executionBrief: {
				locked: false,
				sourceStage: "",
				goal: "",
				approvedPlan: [],
				allowedFiles: [],
				forbiddenActions: [],
				acceptanceCriteria: [],
				hardConstraints: [],
			},
			stageProgress: {
				current: "",
				completed: [],
				pending: [],
			},
			...initialContext,
		};
	}

	handoff(to: AgentRole): void {
		const fromConfig = AGENT_CONFIGS[this.context.activeAgent];
		const toConfig = AGENT_CONFIGS[to];

		// 执行前检查：executor 必须在 brief locked 后才能执行
		if (to === "executor" && !this.context.executionBrief.locked) {
			throw new Error("Executor requires locked execution_brief");
		}

		this.context.lastCompletedAgent = this.context.activeAgent;
		this.context.activeAgent = to;
	}

	lockBrief(brief: Partial<ExecutionBrief>): void {
		if (this.context.activeAgent !== "planner") {
			throw new Error("Only planner can lock execution_brief");
		}
		this.context.executionBrief = {
			...this.context.executionBrief,
			...brief,
			locked: true,
		};
	}

	getContext(): AgentContext {
		return this.context;
	}

	getActiveConfig(): AgentConfig {
		return AGENT_CONFIGS[this.context.activeAgent];
	}

	suggestNext(): AgentRole | null {
		const { activeAgent, executionBrief } = this.context;

		if (activeAgent === "planner" && executionBrief.locked) {
			return "executor";
		}
		if (activeAgent === "executor") {
			return "reviewer";
		}
		if (activeAgent === "reviewer") {
			return null; // 流程结束
		}
		return null;
	}
}
