"use client";

import { useMonitor } from "@/hooks/useMonitor";

export function ModelSwitchLog() {
	const { modelSwitchLog } = useMonitor();
	const switchLog = modelSwitchLog ?? [];

	const reasonLabels = {
		failure: "模型失败",
		timeout: "超时",
		"guardian-intervention": "安全员介入",
		"cost-optimization": "成本优化",
	};

	return (
		<div className="border rounded-lg p-4">
			<h3 className="font-semibold text-sm mb-3">模型切换日志</h3>
			
			<div className="space-y-2 max-h-64 overflow-y-auto">
				{switchLog.length === 0 ? (
					<div className="text-xs text-gray-400">暂无切换记录</div>
				) : (
					switchLog.map((log, idx) => (
						<div key={idx} className="text-xs border-l-2 border-gray-300 pl-3 py-1">
							<div className="font-mono text-gray-700">
								{log.from} → {log.to}
							</div>
							<div className="text-gray-500 mt-0.5">
								{reasonLabels[log.reason]} · {new Date(log.timestamp).toLocaleTimeString()}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}
