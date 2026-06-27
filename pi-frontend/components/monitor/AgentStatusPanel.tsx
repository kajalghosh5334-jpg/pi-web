"use client";

import { useMonitor } from "@/hooks/useMonitor";

export function AgentStatusPanel() {
	const { agentStatus, guardianStatus } = useMonitor();

	return (
		<div className="border rounded-lg p-4 space-y-3">
			<h3 className="font-semibold text-sm">Agent Status</h3>
			
			<div className="grid grid-cols-2 gap-3">
				{/* Planner */}
				<div className={`p-3 rounded border ${
					agentStatus.planner.status === 'working' ? 'bg-blue-50 border-blue-300' :
					agentStatus.planner.status === 'done' ? 'bg-green-50 border-green-300' :
					'bg-gray-50 border-gray-200'
				}`}>
					<div className="text-xs font-medium text-gray-600">Planner</div>
					<div className="text-sm font-mono">{agentStatus.planner.model}</div>
					<div className="text-xs text-gray-500 mt-1">{agentStatus.planner.status}</div>
				</div>

				{/* Executor */}
				<div className={`p-3 rounded border ${
					agentStatus.executor.status === 'working' ? 'bg-blue-50 border-blue-300' :
					agentStatus.executor.status === 'done' ? 'bg-green-50 border-green-300' :
					'bg-gray-50 border-gray-200'
				}`}>
					<div className="text-xs font-medium text-gray-600">Executor</div>
					<div className="text-sm font-mono">{agentStatus.executor.model}</div>
					<div className="text-xs text-gray-500 mt-1">{agentStatus.executor.status}</div>
				</div>

				{/* Reviewer */}
				<div className={`p-3 rounded border ${
					agentStatus.reviewer.status === 'working' ? 'bg-blue-50 border-blue-300' :
					agentStatus.reviewer.status === 'done' ? 'bg-green-50 border-green-300' :
					'bg-gray-50 border-gray-200'
				}`}>
					<div className="text-xs font-medium text-gray-600">Reviewer</div>
					<div className="text-sm font-mono">{agentStatus.reviewer.model}</div>
					<div className="text-xs text-gray-500 mt-1">{agentStatus.reviewer.status}</div>
				</div>

				{/* Guardian */}
				<div className={`p-3 rounded border ${
					guardianStatus.status === 'watching' ? 'bg-yellow-50 border-yellow-300' :
					guardianStatus.status === 'intervened' ? 'bg-red-50 border-red-300' :
					'bg-gray-50 border-gray-200'
				}`}>
					<div className="text-xs font-medium text-gray-600">Guardian</div>
					<div className="text-sm font-mono">{guardianStatus.model}</div>
					<div className="text-xs text-gray-500 mt-1">
						{guardianStatus.status} ({guardianStatus.interventionCount} interventions)
					</div>
				</div>
			</div>
		</div>
	);
}
