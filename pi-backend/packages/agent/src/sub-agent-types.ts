export type SubAgentStatus = "idle" | "running" | "completed" | "waiting-confirmation" | "error";

export interface SubAgentTask {
	id: string;
	name: string;
	skill: string;
	modelId: string;
	status: SubAgentStatus;
	progress: number;
	startTime: number;
	endTime?: number;
	input: {
		files: string[];
		prompt: string;
	};
	output?: {
		files: string[];
		content: string;
	};
	needsConfirmation: boolean;
	confirmationType?: "decision" | "stage-complete" | "conflict";
}

export interface OrchestratorState {
	tasks: SubAgentTask[];
	activeTaskId: string | null;
	pendingConfirmations: string[];
}
