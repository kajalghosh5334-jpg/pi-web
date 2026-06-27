"use client";

import { useState, useEffect } from "react";
import { useMonitor } from "@/hooks/useMonitor";

export function ObserverPanel() {
	const { observerHealth, latestObservation } = useMonitor();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div className="border rounded-lg p-4 space-y-3">
			<h3 className="font-semibold text-sm">Observer（观察器）</h3>
			
			{/* 健康状态 */}
			<div className={`p-3 rounded border ${
				observerHealth.isAlive ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
			}`}>
				<div className="flex items-center justify-between">
					<span className="text-xs font-medium">
						{observerHealth.isAlive ? '✅ 运行中' : '❌ 已停止'}
					</span>
					<span className="text-xs text-gray-500">
						失败次数: {observerHealth.failureCount}
					</span>
				</div>
				<div className="text-xs font-mono mt-1">{observerHealth.currentModel}</div>
				<div className="text-xs text-gray-500 mt-1">
					上次观察: {mounted ? new Date(observerHealth.lastObservation).toLocaleTimeString() : '-'}
				</div>
			</div>

			{/* 最新观察结果 */}
			{latestObservation && (
				<div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
					<div className="text-xs font-medium text-blue-800">最新观察</div>
					
					<div className="space-y-1 text-xs">
						<div>
							<span className="text-gray-600">当前状态：</span>
							<span className="text-gray-800">{latestObservation.currentState}</span>
						</div>
						<div>
							<span className="text-gray-600">目标状态：</span>
							<span className="text-gray-800">{latestObservation.targetState}</span>
						</div>
						<div>
							<span className="text-gray-600">差距：</span>
							<span className="text-orange-600">{latestObservation.gap}</span>
						</div>
						<div>
							<span className="text-gray-600">建议行动：</span>
							<span className="text-blue-600 font-medium">{latestObservation.nextAction}</span>
						</div>
						<div>
							<span className="text-gray-600">置信度：</span>
							<span className="text-green-600">{(latestObservation.confidence * 100).toFixed(0)}%</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
