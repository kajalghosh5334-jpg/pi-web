import type { ObservationResult } from "./observer-daemon.ts";
import type { Role } from "./role-registry.ts";
import { getRolesByNames } from "./role-registry.ts";

export interface RoleState {
	activeRoles: Role[];
	loadedAt: number;
	reason: string;
}

export interface RoleSwitchRecord {
	timestamp: number;
	from: string[];
	to: string[];
	reason: string;
	observationId: number;
}

export class RoleOrchestrator {
	private currentState: RoleState = {
		activeRoles: [],
		loadedAt: 0,
		reason: "初始状态",
	};

	private switchLog: RoleSwitchRecord[] = [];

	orchestrate(observation: ObservationResult): RoleState {
		const requiredRoles = getRolesByNames(observation.requiredRoles);

		// 判断是否需要切换
		const needSwitch = this.shouldSwitch(requiredRoles);

		if (needSwitch) {
			this.switchRoles(requiredRoles, observation);
		}

		return this.currentState;
	}

	private shouldSwitch(requiredRoles: Role[]): boolean {
		const currentIds = this.currentState.activeRoles.map((r) => r.id).sort();
		const requiredIds = requiredRoles.map((r) => r.id).sort();

		return JSON.stringify(currentIds) !== JSON.stringify(requiredIds);
	}

	private switchRoles(newRoles: Role[], observation: ObservationResult) {
		const oldRoleNames = this.currentState.activeRoles.map((r) => r.name);
		const newRoleNames = newRoles.map((r) => r.name);

		this.switchLog.push({
			timestamp: Date.now(),
			from: oldRoleNames,
			to: newRoleNames,
			reason: observation.nextAction,
			observationId: observation.timestamp,
		});

		this.currentState = {
			activeRoles: newRoles,
			loadedAt: Date.now(),
			reason: observation.nextAction,
		};

		console.log(`[RoleOrchestrator] 角色切换: [${oldRoleNames.join(", ")}] → [${newRoleNames.join(", ")}]`);
	}

	getCurrentRoles(): Role[] {
		return this.currentState.activeRoles;
	}

	getSwitchLog(limit = 20): RoleSwitchRecord[] {
		return this.switchLog.slice(-limit);
	}

	getRolePrompt(): string {
		if (this.currentState.activeRoles.length === 0) {
			return "";
		}

		const rolePrompts = this.currentState.activeRoles.map((role) => {
			return `
## 角色：${role.name}

**视角**：${role.perspective}

**关注点**：
${role.concerns.map((c) => `- ${c}`).join("\n")}

**检查清单**：
${role.checkpoints.map((c) => `- ${c}`).join("\n")}
`;
		});

		return `
# 当前加载的角色

你需要综合以下角色的视角来工作：

${rolePrompts.join("\n---\n")}

请在规划、执行、审查时，都带入这些角色的视角和检查标准。
`;
	}
}

export const roleOrchestrator = new RoleOrchestrator();
