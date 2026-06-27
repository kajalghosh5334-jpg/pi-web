"use client";

import { useMonitor } from "@/hooks/useMonitor";

export function StageFlow() {
	const { stageFlow } = useMonitor();

	return (
		<div className="border rounded-lg p-4">
			<h3 className="font-semibold text-sm mb-3">阶段流程</h3>
			
			<div className="space-y-3">
				{/* Progress bar */}
				<div>
					<div className="flex justify-between text-xs text-gray-600 mb-1">
						<span>{stageFlow.current || "未开始"}</span>
						<span>{stageFlow.progress}%</span>
					</div>
					<div className="w-full bg-gray-200 rounded-full h-2">
						<div
							className="bg-blue-500 h-2 rounded-full transition-all"
							style={{ width: `${stageFlow.progress}%` }}
						/>
					</div>
				</div>

				{/* Stages */}
				<div className="space-y-2">
					{stageFlow.completed.map((stage, idx) => (
						<div key={idx} className="flex items-center text-xs">
							<div className="w-2 h-2 rounded-full bg-green-500 mr-2" />
							<span className="text-gray-600 line-through">{stage}</span>
						</div>
					))}
					
					{stageFlow.current && (
						<div className="flex items-center text-xs">
							<div className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse" />
							<span className="text-blue-600 font-medium">{stageFlow.current}</span>
						</div>
					)}
					
					{stageFlow.pending.map((stage, idx) => (
						<div key={idx} className="flex items-center text-xs">
							<div className="w-2 h-2 rounded-full bg-gray-300 mr-2" />
							<span className="text-gray-400">{stage}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
