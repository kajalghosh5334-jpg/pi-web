import { observerDaemon } from "@earendil-works/pi-agent-core/observer-daemon";
import { roleOrchestrator } from "@earendil-works/pi-agent-core/role-orchestrator";
import { AgentHandoff } from "@earendil-works/pi-agent-core/roles";
import { subAgentOrchestrator } from "@earendil-works/pi-agent-core/sub-agent-orchestrator";
import { Guardian } from "@earendil-works/pi-ai/guardian";
import { orchestrator } from "@earendil-works/pi-ai/orchestrator";
import type { Request, Response } from "express";

let guardian: Guardian | null = null;
let handoff: AgentHandoff | null = null;

export async function initMonitoring() {
	const guardianModel = orchestrator.getGuardianModel();
	if (guardianModel) {
		guardian = new Guardian(guardianModel);
	}
	handoff = new AgentHandoff();

	// 启动 Observer 独立进程
	await observerDaemon.start();
	console.log("[Monitor] Observer 独立进程已启动");
}

export async function getMonitorStatus(req: Request, res: Response) {
	const agentContext = handoff?.getContext();
	const guardianState = guardian?.getState();
	const observerHealth = observerDaemon.getHealth();
	const latestObservation = observerDaemon.getLatestObservation();
	const currentRoles = roleOrchestrator.getCurrentRoles();
	const switchLog = orchestrator.getSwitchLog(50);
	const roleSwitchLog = roleOrchestrator.getSwitchLog(20);

	res.json({
		// 执行层 Agent 状态
		agentStatus: {
			planner: {
				status: agentContext?.activeAgent === "planner" ? "working" : "idle",
				model: "opencore-go/glm-5.2",
			},
			executor: {
				status: agentContext?.activeAgent === "executor" ? "working" : "idle",
				model: "opencore-go/kimi-k2.7-code",
			},
			reviewer: {
				status: agentContext?.activeAgent === "reviewer" ? "working" : "idle",
				model: "opencore-go/deepseek-v4-pro",
			},
		},

		// Guardian 状态
		guardianStatus: {
			status: guardianState?.status || "idle",
			model: "opencore-go/deepseek-v4-flash",
			interventionCount: guardianState?.interventionCount || 0,
		},

		// Observer 健康状态
		observerHealth: {
			isAlive: observerHealth.isAlive,
			currentModel: observerHealth.currentModel,
			lastObservation: observerHealth.lastObservation,
			failureCount: observerHealth.failureCount,
			uptime: Date.now() - observerHealth.uptime,
		},

		// 最新观察结果
		latestObservation: latestObservation
			? {
					currentState: latestObservation.currentState,
					targetState: latestObservation.targetState,
					gap: latestObservation.gap,
					nextAction: latestObservation.nextAction,
					confidence: latestObservation.confidence,
				}
			: null,

		// 当前角色
		activeRoles: currentRoles.map((r) => ({
			name: r.name,
			perspective: r.perspective,
		})),

		// 模型切换日志
		modelSwitchLog: switchLog,

		// 角色切换日志
		roleSwitchLog: roleSwitchLog,

		// Sub-agent 状态
		subAgents: subAgentOrchestrator.getState().tasks,
		pendingConfirmations: subAgentOrchestrator.getPendingConfirmations(),

		// 阶段流程
		stageFlow: agentContext?.stageProgress || {
			current: "",
			progress: 0,
			completed: [],
			pending: [],
		},
	});
}

export async function handleUserTask(req: Request, res: Response) {
	const { input } = req.body;

	// 1. Observer 分析并拆分任务
	const tasks = await subAgentOrchestrator.analyze(input, {});

	// 2. 并行执行所有任务
	tasks.forEach((task) => {
		subAgentOrchestrator.executeTask(task.id);
	});

	res.json({ success: true, tasks });
}

export async function getHealthCheck(req: Request, res: Response) {
	const observerHealth = observerDaemon.getHealth();
	const guardianState = guardian?.getState();

	const systemHealth = {
		overall: observerHealth.isAlive ? "healthy" : "degraded",
		components: {
			observer: observerHealth.isAlive ? "up" : "down",
			guardian: guardianState ? "up" : "down",
			planner: "up",
			executor: "up",
			reviewer: "up",
		},
		timestamp: Date.now(),
	};

	res.json(systemHealth);
}

export function websocketMonitor(ws: WebSocket) {
	const interval = setInterval(() => {
		const agentContext = handoff?.getContext();
		const guardianState = guardian?.getState();
		const observerHealth = observerDaemon.getHealth();
		const currentRoles = roleOrchestrator.getCurrentRoles();
		const switchLog = orchestrator.getSwitchLog(10);

		ws.send(
			JSON.stringify({
				agentStatus: {
					planner: {
						status: agentContext?.activeAgent === "planner" ? "working" : "idle",
						model: "opencore-go/glm-5.2",
					},
					executor: {
						status: agentContext?.activeAgent === "executor" ? "working" : "idle",
						model: "opencore-go/kimi-k2.7-code",
					},
					reviewer: {
						status: agentContext?.activeAgent === "reviewer" ? "working" : "idle",
						model: "opencore-go/deepseek-v4-pro",
					},
				},
				guardianStatus: {
					status: guardianState?.status || "idle",
					model: "opencore-go/deepseek-v4-flash",
					interventionCount: guardianState?.interventionCount || 0,
				},
				observerHealth: {
					isAlive: observerHealth.isAlive,
					currentModel: observerHealth.currentModel,
				},
				activeRoles: currentRoles.map((r) => r.name),
				switchLog,
			}),
		);
	}, 1000);

	ws.on("close", () => clearInterval(interval));
}
