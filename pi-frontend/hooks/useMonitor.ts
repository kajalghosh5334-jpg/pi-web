"use client";

import { useEffect, useState } from "react";

interface AgentStatus {
	status: "idle" | "working" | "done";
	model: string;
}

interface GuardianStatus {
	status: "watching" | "intervened" | "idle";
	model: string;
	interventionCount: number;
}

interface ObserverHealth {
	isAlive: boolean;
	currentModel: string;
	lastObservation: number;
	failureCount: number;
	uptime: number;
}

interface Observation {
	currentState: string;
	targetState: string;
	gap: string;
	nextAction: string;
	confidence: number;
}

interface ActiveRole {
	name: string;
	perspective: string;
}

interface RoleSwitchLog {
	timestamp: number;
	from: string[];
	to: string[];
	reason: string;
}

interface SwitchLog {
	timestamp: number;
	from: string;
	to: string;
	reason: "failure" | "timeout" | "guardian-intervention" | "cost-optimization";
}

interface SubAgent {
	id: string;
	name: string;
	skill: string;
	modelId: string;
	status: "idle" | "pending" | "running" | "completed" | "waiting-confirmation" | "error";
	progress: number;
	needsConfirmation: boolean;
	output?: string;
	error?: string;
}

interface SessionSummary {
	id: string;
	status: string;
	input?: string;
	output?: string;
	error?: string;
	updatedAt?: number;
}

interface MonitorData {
	agentStatus: {
		planner: AgentStatus;
		executor: AgentStatus;
		reviewer: AgentStatus;
	};
	guardianStatus: GuardianStatus;
	observerHealth: ObserverHealth;
	latestObservation: Observation | null;
	activeRoles: ActiveRole[];
	modelSwitchLog: SwitchLog[];
	roleSwitchLog: RoleSwitchLog[];
	subAgents: SubAgent[];
	pendingConfirmations: SubAgent[];
	sessions?: SessionSummary[];
	stageFlow: {
		current: string;
		progress: number;
		completed: string[];
		pending: string[];
	};
}

export function useMonitor() {
	const [data, setData] = useState<MonitorData>({
		agentStatus: {
			planner: { status: "idle", model: "-" },
			executor: { status: "idle", model: "-" },
			reviewer: { status: "idle", model: "-" },
		},
		guardianStatus: {
			status: "idle",
			model: "opencode-go/deepseek-v4-flash",
			interventionCount: 0,
		},
		observerHealth: {
			isAlive: true,
			currentModel: "opencode-go/deepseek-v4-flash",
			lastObservation: 0,
			failureCount: 0,
			uptime: 0,
		},
		latestObservation: null,
		activeRoles: [],
		modelSwitchLog: [],
		roleSwitchLog: [],
		subAgents: [],
		pendingConfirmations: [],
		stageFlow: {
			current: "",
			progress: 0,
			completed: [],
			pending: [],
		},
	});

	useEffect(() => {
		let interval: ReturnType<typeof setInterval> | null = null;
		let closed = false;

		const applyUpdate = (payload: unknown) => {
			const update = (payload as { monitor?: Partial<MonitorData> }).monitor ?? payload;
			setData((prev) => ({ ...prev, ...(update as Partial<MonitorData>) }));
		};

		const startPolling = () => {
			if (interval) return;
			interval = setInterval(async () => {
				try {
					const res = await fetch("/api/monitor", { cache: "no-store" });
					applyUpdate(await res.json());
				} catch (e) {
					console.error("Monitor fetch failed:", e);
				}
			}, 2000);
		};

		let ws: WebSocket | null = null;
		try {
			ws = new WebSocket("ws://localhost:3000/api/monitor");
			ws.onmessage = (event) => applyUpdate(JSON.parse(event.data));
			ws.onerror = () => startPolling();
			ws.onclose = () => {
				if (!closed) startPolling();
			};
		} catch {
			startPolling();
		}

		// Prime the panel immediately; WebSocket only pushes when backend broadcasts.
		fetch("/api/monitor", { cache: "no-store" })
			.then((res) => res.json())
			.then(applyUpdate)
			.catch(() => startPolling());

		return () => {
			closed = true;
			ws?.close();
			if (interval) clearInterval(interval);
		};
	}, []);

	return data;
}
