import type { ModelConfig, SwitchRecord } from "./orchestrator.ts";

export interface GuardianState {
	status: "watching" | "intervened" | "idle";
	lastCheck: number;
	interventionCount: number;
	monitoredTasks: Map<string, TaskMonitor>;
}

interface TaskMonitor {
	taskId: string;
	startTime: number;
	modelId: string;
	timeoutMs: number;
	hasResponded: boolean;
}

export class Guardian {
	private state: GuardianState = {
		status: "idle",
		lastCheck: 0,
		interventionCount: 0,
		monitoredTasks: new Map(),
	};

	private guardianModel: ModelConfig;

	constructor(guardianModel: ModelConfig) {
		this.guardianModel = guardianModel;
	}

	startMonitoring(taskId: string, modelId: string, timeoutMs = 30000) {
		this.state.monitoredTasks.set(taskId, {
			taskId,
			startTime: Date.now(),
			modelId,
			timeoutMs,
			hasResponded: false,
		});
		this.state.status = "watching";
	}

	markResponse(taskId: string) {
		const task = this.state.monitoredTasks.get(taskId);
		if (task) {
			task.hasResponded = true;
		}
	}

	checkTimeout(taskId: string): SwitchRecord | null {
		const task = this.state.monitoredTasks.get(taskId);
		if (!task || task.hasResponded) return null;

		const elapsed = Date.now() - task.startTime;
		if (elapsed > task.timeoutMs) {
			this.state.status = "intervened";
			this.state.interventionCount++;
			this.state.monitoredTasks.delete(taskId);

			return {
				from: task.modelId,
				to: "fallback",
				reason: "timeout",
				taskId,
				timestamp: Date.now(),
			};
		}

		return null;
	}

	handleFailure(taskId: string, modelId: string, error: Error): SwitchRecord {
		this.state.status = "intervened";
		this.state.interventionCount++;
		this.state.monitoredTasks.delete(taskId);

		return {
			from: modelId,
			to: "fallback",
			reason: "failure",
			taskId,
			timestamp: Date.now(),
		};
	}

	getState(): GuardianState {
		return this.state;
	}

	reset() {
		this.state.status = "idle";
		this.state.monitoredTasks.clear();
	}
}
