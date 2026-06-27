"use client";

import { useMonitor } from "@/hooks/useMonitor";

export function RolePanel() {
	const { activeRoles, roleSwitchLog } = useMonitor();

	return (
		<div className="border rounded-lg p-4 space-y-3">
			<h3 className="font-semibold text-sm">当前角色</h3>
			
			{/* 激活的角色 */}
			{activeRoles.length === 0 ? (
				<div className="text-xs text-gray-400">暂无加载角色</div>
			) : (
				<div className="space-y-2">
					{activeRoles.map((role, idx) => (
						<div key={idx} className="bg-purple-50 border border-purple-200 rounded p-2">
							<div className="text-sm font-medium text-purple-800">{role.name}</div>
							<div className="text-xs text-gray-600 mt-1">{role.perspective}</div>
						</div>
					))}
				</div>
			)}

			{/* 角色切换历史 */}
			<div className="pt-2 border-t">
				<div className="text-xs font-medium text-gray-600 mb-2">切换历史</div>
				<div className="space-y-2 max-h-40 overflow-y-auto">
					{roleSwitchLog.length === 0 ? (
						<div className="text-xs text-gray-400">暂无切换记录</div>
					) : (
						roleSwitchLog.map((log, idx) => (
							<div key={idx} className="text-xs border-l-2 border-purple-300 pl-2 py-1">
								<div className="text-gray-700">
									{log.from.length > 0 ? log.from.join(", ") : "无"} → {log.to.join(", ")}
								</div>
								<div className="text-gray-500 text-xs mt-0.5">
									{log.reason} · {new Date(log.timestamp).toLocaleTimeString()}
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
