import type { ProviderId } from "@earendil-works/pi-ai/types";

export interface ObserverModel {
	id: string;
	provider: ProviderId;
	priority: number;
	endpoint?: string;
}

export interface ObservationResult {
	timestamp: number;
	currentState: string;
	targetState: string;
	gap: string;
	nextAction: string;
	requiredRoles: string[];
	confidence: number;
}

export interface ObserverHealth {
	isAlive: boolean;
	currentModel: string;
	lastObservation: number;
	failureCount: number;
	uptime: number;
}

export class ObserverDaemon {
	private models: ObserverModel[] = [
		{
			id: "opencode-go/deepseek-v4-flash",
			provider: "opencode-go",
			priority: 1,
		},
		{
			id: "deepseek-official/deepseek-chat",
			provider: "deepseek",
			priority: 2,
			endpoint: "https://api.deepseek.com/v1",
		},
		{
			id: "ollama/qwen2.5:7b",
			provider: "ollama",
			priority: 3,
			endpoint: "http://localhost:11434",
		},
	];

	private currentModel: ObserverModel = this.models[0];
	private health: ObserverHealth = {
		isAlive: true,
		currentModel: this.models[0].id,
		lastObservation: 0,
		failureCount: 0,
		uptime: Date.now(),
	};

	private observationInterval?: NodeJS.Timeout;
	private healthCheckInterval?: NodeJS.Timeout;
	private latestObservation: ObservationResult | null = null;

	async start() {
		console.log("[Observer] 启动独立观察进程...");

		// 每5秒观察一次
		this.observationInterval = setInterval(() => {
			this.observe().catch((err) => {
				console.error("[Observer] 观察失败:", err);
			});
		}, 5000);

		// 每10秒健康检查
		this.healthCheckInterval = setInterval(() => {
			this.healthCheck();
		}, 10000);

		// 立即执行一次观察
		await this.observe();
	}

	async stop() {
		if (this.observationInterval) clearInterval(this.observationInterval);
		if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
		console.log("[Observer] 已停止");
	}

	async observe(): Promise<ObservationResult | null> {
		try {
			const memoryState = await this.readMemory();
			const observation = await this.analyzeState(memoryState);

			this.latestObservation = observation;
			this.health.lastObservation = Date.now();
			this.health.isAlive = true;
			this.health.failureCount = 0;

			return observation;
		} catch (error) {
			this.health.failureCount++;
			console.error(`[Observer] 观察失败 (${this.health.failureCount} 次):`, error);

			// 连续失败3次，切换模型
			if (this.health.failureCount >= 3) {
				await this.switchModel();
			}

			return null;
		}
	}

	private async readMemory(): Promise<any> {
		const fs = await import("fs/promises");
		const path = await import("path");

		try {
			// 读取 context.md
			const contextPath = path.join(process.cwd(), "agent_memory/context.md");
			const contextContent = await fs.readFile(contextPath, "utf-8");

			// 读取 progress.md
			const progressPath = path.join(process.cwd(), "agent_memory/progress.md");
			const progressContent = await fs.readFile(progressPath, "utf-8");

			// 提取关键信息
			const goalMatch = contextContent.match(/goal_final:\s*"([^"]+)"/);
			const completedMatch = progressContent.match(/completed:[\s\S]*?-\s*"([^"]+)"/g);
			const currentMatch = progressContent.match(/current_step:\s*"([^"]+)"/);

			return {
				goal: goalMatch ? goalMatch[1] : "未定义",
				completed: completedMatch ? completedMatch.map((m) => m.match(/"([^"]+)"/)?.[1] || "") : [],
				current: currentMatch ? currentMatch[1] : "未知阶段",
			};
		} catch (error) {
			console.warn("[Observer] 读取 Memory 失败，使用默认值:", error);
			return {
				goal: "未定义",
				completed: [],
				current: "初始阶段",
			};
		}
	}

	private async analyzeState(memoryState: any): Promise<ObservationResult> {
		const prompt = `你是一个项目观察员。分析当前项目状态，给出下一步行动建议。

当前状态：
- 目标：${memoryState.goal}
- 已完成：${memoryState.completed.join(", ")}
- 当前阶段：${memoryState.current}

请回答：
1. 当前状态是什么？
2. 目标状态是什么？
3. 差距在哪里？
4. 下一步最值得做什么？
5. 需要加载哪些角色？（从以下选择：商业顾问、内容策划、数据分析师、技术架构师、用户研究员、增长黑客、产品经理、运营专员）

用 JSON 格式回答：
{
  "currentState": "...",
  "targetState": "...",
  "gap": "...",
  "nextAction": "...",
  "requiredRoles": ["角色1", "角色2"],
  "confidence": 0.8
}`;

		try {
			const response = await this.callModel(this.currentModel, prompt);
			const result = JSON.parse(response);
			return {
				timestamp: Date.now(),
				...result,
			};
		} catch (error) {
			console.error("[Observer] 分析失败:", error);
			throw error;
		}
	}

	private async callModel(model: ObserverModel, prompt: string): Promise<string> {
		// 根据 provider 调用不同接口
		if (model.provider === "opencode-go") {
			return this.callOpenCodeGo(model.id, prompt);
		} else if (model.provider === "deepseek") {
			return this.callDeepSeekOfficial(model.endpoint!, prompt);
		} else if (model.provider === "ollama") {
			return this.callOllama(model.endpoint!, model.id, prompt);
		}
		throw new Error(`Unsupported provider: ${model.provider}`);
	}

	private async callOpenCodeGo(modelId: string, prompt: string): Promise<string> {
		// TODO: 使用 pi-ai 包的接口调用
		// 暂时返回 mock
		return JSON.stringify({
			currentState: "商业模式已确认",
			targetState: "有可执行的选题系统",
			gap: "缺少内容策略和选题框架",
			nextAction: "设计选题系统",
			requiredRoles: ["内容策划", "增长黑客"],
			confidence: 0.85,
		});
	}

	private async callDeepSeekOfficial(endpoint: string, prompt: string): Promise<string> {
		const response = await fetch(`${endpoint}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
			},
			body: JSON.stringify({
				model: "deepseek-chat",
				messages: [{ role: "user", content: prompt }],
				temperature: 0.7,
			}),
		});
		const data = (await response.json()) as { choices: [{ message: { content: string } }] };
		return data.choices[0].message.content;
	}

	private async callOllama(endpoint: string, modelId: string, prompt: string): Promise<string> {
		const response = await fetch(`${endpoint}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: modelId.split("/")[1],
				prompt,
				stream: false,
			}),
		});
		const data = (await response.json()) as { response: string };
		return data.response;
	}

	private async switchModel() {
		const currentPriority = this.currentModel.priority;
		const nextModel = this.models.find((m) => m.priority > currentPriority);

		if (nextModel) {
			console.log(`[Observer] 切换模型: ${this.currentModel.id} → ${nextModel.id}`);
			this.currentModel = nextModel;
			this.health.currentModel = nextModel.id;
			this.health.failureCount = 0;
		} else {
			console.error("[Observer] 所有备用模型已耗尽");
			this.health.isAlive = false;
		}
	}

	private healthCheck() {
		const now = Date.now();
		const timeSinceLastObservation = now - this.health.lastObservation;

		// 超过30秒没有成功观察，标记为不健康
		if (timeSinceLastObservation > 30000) {
			console.warn("[Observer] 健康检查失败：超过30秒未观察");
			this.health.isAlive = false;

			// 尝试重启：回到第一个模型
			this.currentModel = this.models[0];
			this.health.currentModel = this.models[0].id;
			this.health.failureCount = 0;
		}
	}

	getHealth(): ObserverHealth {
		return { ...this.health };
	}

	getLatestObservation(): ObservationResult | null {
		return this.latestObservation;
	}
}

// 单例模式
export const observerDaemon = new ObserverDaemon();
