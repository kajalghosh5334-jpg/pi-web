export async function GET() {
	try {
		const res = await fetch('http://localhost:3000/api/monitor');
		const data = await res.json();
		return Response.json(data);
	} catch (error) {
		return Response.json({
			agentStatus: {
				planner: { status: "idle", model: "-" },
				executor: { status: "idle", model: "-" },
				reviewer: { status: "idle", model: "-" },
			},
			guardianStatus: { status: "idle", model: "-", interventionCount: 0 },
			observerHealth: {
				isAlive: false,
				currentModel: "-",
				lastObservation: Date.now(),
				failureCount: 0,
				uptime: 0,
			},
			latestObservation: null,
			activeRoles: [],
			modelSwitchLog: [],
			roleSwitchLog: [],
			stageFlow: { current: "", progress: 0, completed: [], pending: [] },
		});
	}
}
