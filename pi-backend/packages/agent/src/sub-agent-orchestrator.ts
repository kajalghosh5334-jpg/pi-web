import type { OrchestratorState, SubAgentTask } from "./sub-agent-types.ts";

export class SubAgentOrchestrator {
	private state: OrchestratorState = {
		tasks: [],
		activeTaskId: null,
		pendingConfirmations: [],
	};

	async analyze(userInput: string, memoryState: any): Promise<SubAgentTask[]> {
		// 调用 deepseek-v4-flash 分析并拆分任务
		const tasks = await this.callScheduler(userInput, memoryState);
		this.state.tasks = tasks;
		return tasks;
	}

	private async callScheduler(input: string, memory: any): Promise<SubAgentTask[]> {
		const prompt = `
你是任务调度器。分析用户需求，拆分成可并行执行的子任务。

用户输入：${input}
当前状态：${JSON.stringify(memory)}

输出 JSON 数组，每个任务包含：
- name: 任务名称
- skill: 使用哪个 skill
- modelId: 使用哪个模型
- input: { files: [], prompt: "" }
`;

		// TODO: 调用 deepseek-v4-flash
		// Mock 返回
		return [
			{
				id: "task-1",
				name: "分析用户需求",
				skill: "output-engine",
				modelId: "opencore-go/glm-5.2",
				status: "idle",
				progress: 0,
				startTime: Date.now(),
				input: { files: ["context.md"], prompt: "分析用户意图" },
				needsConfirmation: false,
			},
			{
				id: "task-2",
				name: "搜索竞品",
				skill: "anysearch",
				modelId: "opencore-go/kimi-k2.7-code",
				status: "idle",
				progress: 0,
				startTime: Date.now(),
				input: { files: [], prompt: "搜索竞品" },
				needsConfirmation: false,
			},
		];
	}

	async executeTask(taskId: string): Promise<void> {
		const task = this.state.tasks.find((t) => t.id === taskId);
		if (!task) return;

		task.status = "running";
		this.state.activeTaskId = taskId;

		// TODO: 实际执行任务
		setTimeout(() => {
			task.status = "completed";
			task.progress = 100;
			task.endTime = Date.now();
			task.output = {
				files: ["result.md"],
				content: "任务完成结果",
			};
		}, 3000);
	}

	getState(): OrchestratorState {
		return this.state;
	}

	getPendingConfirmations(): SubAgentTask[] {
		return this.state.tasks.filter((t) => t.status === "waiting-confirmation");
	}
}

export const subAgentOrchestrator = new SubAgentOrchestrator();
