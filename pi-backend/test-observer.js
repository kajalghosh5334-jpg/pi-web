#!/usr/bin/env node

/**
 * 快速测试 Observer + 角色编排
 */

import { observerDaemon } from "./packages/agent/src/observer-daemon.ts";
import { roleOrchestrator } from "./packages/agent/src/role-orchestrator.ts";

async function test() {
	console.log("=== Observer + 角色编排测试 ===\n");

	// 1. 启动 Observer
	console.log("[1] 启动 Observer...");
	await observerDaemon.start();

	// 2. 等待首次观察
	console.log("[2] 等待首次观察...");
	await new Promise(resolve => setTimeout(resolve, 6000));

	// 3. 获取观察结果
	console.log("[3] 获取观察结果...");
	const observation = observerDaemon.getLatestObservation();
	console.log("   当前状态:", observation?.currentState);
	console.log("   目标状态:", observation?.targetState);
	console.log("   差距:", observation?.gap);
	console.log("   建议行动:", observation?.nextAction);
	console.log("   置信度:", observation?.confidence);
	console.log("");

	// 4. 编排角色
	console.log("[4] 编排角色...");
	if (observation) {
		const roleState = roleOrchestrator.orchestrate(observation);
		console.log("   当前角色:", roleState.activeRoles.map(r => r.name).join(", "));
		console.log("");

		// 5. 获取角色 prompt
		console.log("[5] 角色 prompt:");
		console.log(roleOrchestrator.getRolePrompt());
	}

	// 6. 健康检查
	console.log("[6] 健康检查:");
	const health = observerDaemon.getHealth();
	console.log("   状态:", health.isAlive ? "✅ 健康" : "❌ 异常");
	console.log("   当前模型:", health.currentModel);
	console.log("   失败次数:", health.failureCount);
	console.log("");

	// 7. 停止
	console.log("[7] 停止 Observer...");
	await observerDaemon.stop();

	console.log("\n✅ 测试完成！");
}

test().catch(console.error);
