"use client";

import { ObserverPanel } from "@/components/monitor/ObserverPanel";
import { RolePanel } from "@/components/monitor/RolePanel";
import { AgentStatusPanel } from "@/components/monitor/AgentStatusPanel";
import { ModelSwitchLog } from "@/components/monitor/ModelSwitchLog";
import { StageFlow } from "@/components/monitor/StageFlow";

export default function MonitorPage() {
	return (
		<div className="min-h-screen bg-gray-50 p-6">
			<div className="max-w-7xl mx-auto">
				<h1 className="text-2xl font-bold mb-6">Pi Agent 监控面板</h1>
				
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* 左列 */}
					<div className="space-y-6">
						<ObserverPanel />
						<RolePanel />
						<StageFlow />
					</div>
					
					{/* 右列 */}
					<div className="space-y-6">
						<AgentStatusPanel />
						<ModelSwitchLog />
					</div>
				</div>
			</div>
		</div>
	);
}
