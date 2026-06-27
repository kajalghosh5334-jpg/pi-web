import { observerDaemon } from "./observer-daemon.ts";
import { roleOrchestrator } from "./role-orchestrator.ts";
import { AgentHandoff } from "./roles.ts";

export interface MainLoopConfig {
	enableObserver: boolean;
	observerCheckInterval: number;
	fallbackMode: "basic" | "halt";
}

export class MainLoop {
	private config: MainLoopConfig;
	private handoff: AgentHandoff;
	private isRunning = false;

	constructor(config: Partial<MainLoopConfig> = {}) {
		this.config = {
			enableObserver: true,
			observerCheckInterval: 5000,
			fallbackMode: "basic",
			...config,
		};
		this.handoff = new AgentHandoff();
	}

	async start() {
		if (this.config.enableObserver) {
			await observerDaemon.start();
			console.log("[MainLoop] Observer 已启动");
		}
		this.isRunning = true;
	}

	async stop() {
		await observerDaemon.stop();
		this.isRunning = false;
		console.log("[MainLoop] 已停止");
	}

	async processUserInput(input: string): Promise<string> {
		// 1. 检查 Observer 健康状态
		const observerHealth = observerDaemon.getHealth();

		if (!observerHealth.isAlive) {
			console.warn("[MainLoop] Observer 不可用，进入降级模式");
			return this.fallbackMode(input);
		}

		// 2. 获取最新观察结果
		const observation = observerDaemon.getLatestObservation();

		if (!observation) {
			console.warn("[MainLoop] 无观察结果，使用基础模式");
			return this.fallbackMode(input);
		}

		// 3. 编排角色
		const roleState = roleOrchestrator.orchestrate(observation);
		const rolePrompt = roleOrchestrator.getRolePrompt();

		console.log(`[MainLoop] 当前角色: ${roleState.activeRoles.map((r) => r.name).join(", ")}`);

		// 4. 执行主流程（带角色视角）
		const result = await this.executeWithRoles(input, rolePrompt, observation);

		return result;
	}

	private async executeWithRoles(input: string, rolePrompt: string, observation: any): Promise<string> {
		// Planner 阶段
		const plannerPrompt = `${rolePrompt}\n\n用户输入：${input}\n\n观察建议：${observation.nextAction}`;
		const plan = await this.callPlanner(plannerPrompt);

		// Executor 阶段
		const executorPrompt = `${rolePrompt}\n\n执行计划：${plan}`;
		const execution = await this.callExecutor(executorPrompt);

		// Reviewer 阶段
		const reviewerPrompt = `${rolePrompt}\n\n审查执行结果：${execution}`;
		const review = await this.callReviewer(reviewerPrompt);

		return review;
	}

	private async callPlanner(prompt: string): Promise<string> {
		console.log("[Planner] 规划中...");
		const { orchestrator } = await import("@earendil-works/pi-ai/orchestrator");
		const assignment = orchestrator.route({
			type: "plan",
			complexity: "high",
			requiresGuardian: true,
		});
		// TODO: 使用 pi-ai 的接口调用 assignment.primary.id 模型
		return `[Planner with ${assignment.primary.id}] 规划结果`;
	}

	private async callExecutor(prompt: string): Promise<string> {
		console.log("[Executor] 执行中...");
		const { orchestrator } = await import("@earendil-works/pi-ai/orchestrator");
		const assignment = orchestrator.route({
			type: "execute",
			complexity: "medium",
			requiresGuardian: true,
		});
		return `[Executor with ${assignment.primary.id}] 执行结果`;
	}

	private async callReviewer(prompt: string): Promise<string> {
		console.log("[Reviewer] 审查中...");
		const { orchestrator } = await import("@earendil-works/pi-ai/orchestrator");
		const assignment = orchestrator.route({
			type: "review",
			complexity: "high",
			requiresGuardian: true,
		});
		return `[Reviewer with ${assignment.primary.id}] 审查结果`;
	}

	private async fallbackMode(input: string): Promise<string> {
		if (this.config.fallbackMode === "halt") {
			return "系统维护中，请稍后再试";
		}

		// 基础模式：不加载动态角色，使用固定角色
		console.log("[MainLoop] 使用固定角色模式");
		const plan = await this.callPlanner(input);
		const execution = await this.callExecutor(plan);
		const review = await this.callReviewer(execution);
		return review;
	}

	getStatus() {
		return {
			isRunning: this.isRunning,
			observer: observerDaemon.getHealth(),
			roles: roleOrchestrator.getCurrentRoles().map((r) => r.name),
		};
	}
}

export const mainLoop = new MainLoop();
