import type { ProviderId } from "./types.ts";

export type ModelRole = "critical" | "routine" | "guardian";

export interface ModelConfig {
	id: string;
	provider: ProviderId;
	role: ModelRole;
	priority: number;
	fallbacks: string[];
}

export interface TaskContext {
	type: "plan" | "reason" | "review" | "execute" | "write" | "rewrite";
	complexity: "high" | "medium" | "low";
	requiresGuardian: boolean;
}

export interface ModelAssignment {
	primary: ModelConfig;
	guardian?: ModelConfig;
	fallback: ModelConfig[];
}

export interface SwitchRecord {
	timestamp: number;
	from: string;
	to: string;
	reason: "failure" | "timeout" | "guardian-intervention" | "cost-optimization";
	taskId: string;
}

export class ModelOrchestrator {
	private modelRegistry: Map<string, ModelConfig> = new Map();
	private switchLog: SwitchRecord[] = [];
	private guardianModel: ModelConfig | null = null;

	constructor() {
		this.initDefaultModels();
	}

	private initDefaultModels() {
		// Critical tier — 关键10%的规划、审查
		this.register({
			id: "opencore-go/deepseek-v4-pro",
			provider: "opencode-go",
			role: "critical",
			priority: 1,
			fallbacks: ["opencore-go/glm-5.2", "openai/gpt-4"],
		});

		this.register({
			id: "opencore-go/glm-5.2",
			provider: "opencode-go",
			role: "critical",
			priority: 2,
			fallbacks: ["opencore-go/deepseek-v4-pro"],
		});

		// Routine tier — 常规90%的执行、写作
		this.register({
			id: "opencore-go/kimi-k2.7-code",
			provider: "opencode-go",
			role: "routine",
			priority: 1,
			fallbacks: ["opencore-go/glm-5.2", "opencore-go/minimax-m3"],
		});

		this.register({
			id: "opencore-go/minimax-m3",
			provider: "opencode-go",
			role: "routine",
			priority: 2,
			fallbacks: ["opencore-go/kimi-k2.7-code"],
		});

		// Guardian — 安全员，常驻监控
		this.guardianModel = {
			id: "opencore-go/deepseek-v4-flash",
			provider: "opencode-go",
			role: "guardian",
			priority: 1,
			fallbacks: [],
		};
	}

	register(config: ModelConfig) {
		this.modelRegistry.set(config.id, config);
	}

	route(task: TaskContext): ModelAssignment {
		const role = this.getRequiredRole(task);
		const primary = this.selectPrimaryModel(role);
		const fallback = this.selectFallbacks(primary);
		const guardian = task.requiresGuardian ? this.guardianModel : undefined;

		return { primary, guardian, fallback };
	}

	private getRequiredRole(task: TaskContext): ModelRole {
		if (["plan", "reason", "review"].includes(task.type)) {
			return "critical";
		}
		return "routine";
	}

	private selectPrimaryModel(role: ModelRole): ModelConfig {
		const models = Array.from(this.modelRegistry.values())
			.filter((m) => m.role === role)
			.sort((a, b) => a.priority - b.priority);

		if (models.length === 0) {
			throw new Error(`No models available for role: ${role}`);
		}

		return models[0];
	}

	private selectFallbacks(primary: ModelConfig): ModelConfig[] {
		return primary.fallbacks.map((id) => this.modelRegistry.get(id)).filter((m): m is ModelConfig => m !== undefined);
	}

	recordSwitch(record: Omit<SwitchRecord, "timestamp">) {
		this.switchLog.push({
			...record,
			timestamp: Date.now(),
		});
	}

	getSwitchLog(limit = 50): SwitchRecord[] {
		return this.switchLog.slice(-limit);
	}

	getGuardianModel(): ModelConfig | null {
		return this.guardianModel;
	}
}

export const orchestrator = new ModelOrchestrator();
