# Pi Agent 多模型工作流改造集成指南

## 📦 已完成的模块

### 后端（pi-backend）
```
packages/ai/src/
├── orchestrator.ts        # 多模型调度器
└── guardian.ts           # 安全员监控器

packages/agent/src/
└── roles.ts              # 四角色系统 (planner/executor/reviewer/guardian)

packages/coding-agent/src/
└── monitor-api.ts        # 监控 API 接口
```

### 前端（pi-frontend）
```
components/monitor/
├── AgentStatusPanel.tsx   # Agent 状态面板
├── ModelSwitchLog.tsx     # 模型切换日志
└── StageFlow.tsx         # 阶段流程可视化

hooks/
└── useMonitor.ts         # 实时监控 hook
```

---

## 🔌 集成步骤

### 1. 后端核心流程集成

**修改 `packages/coding-agent/src/cli.ts`（或主入口文件）**

```typescript
import { initMonitoring } from "./monitor-api.ts";
import { orchestrator } from "@earendil-works/pi-ai/orchestrator";
import { AgentHandoff } from "@earendil-works/pi-agent-core/roles";

// 在 CLI 启动时初始化
async function main() {
    initMonitoring();  // 初始化监控系统
    
    // ... 原有启动逻辑
}
```

**修改模型调用逻辑（在实际调用 LLM 的地方）**

```typescript
import { orchestrator } from "@earendil-works/pi-ai/orchestrator";
import { guardian } from "./monitor-api.ts";

async function invokeModel(taskType: string, prompt: string) {
    // 1. 路由到合适的模型
    const assignment = orchestrator.route({
        type: taskType,
        complexity: "high",
        requiresGuardian: true,
    });
    
    // 2. 启动安全员监控
    const taskId = generateTaskId();
    guardian?.startMonitoring(taskId, assignment.primary.id, 30000);
    
    try {
        // 3. 调用主模型
        const result = await callLLM(assignment.primary.id, prompt);
        guardian?.markResponse(taskId);
        return result;
    } catch (error) {
        // 4. 失败时切换 fallback
        const switchRecord = guardian?.handleFailure(taskId, assignment.primary.id, error);
        if (switchRecord) {
            orchestrator.recordSwitch(switchRecord);
            // 尝试 fallback 模型
            return callLLM(assignment.fallback[0].id, prompt);
        }
        throw error;
    }
}
```

### 2. Agent 角色接力集成

**在任务执行入口处**

```typescript
import { AgentHandoff, AGENT_CONFIGS } from "@earendil-works/pi-agent-core/roles";

const handoff = new AgentHandoff();

// Planner 阶段
handoff.lockBrief({
    goal: "实现用户需求",
    approvedPlan: ["步骤1", "步骤2"],
    allowedFiles: ["src/**/*.ts"],
    forbiddenActions: ["rm -rf"],
});

// 接力到 Executor
handoff.handoff("executor");
const executorConfig = handoff.getActiveConfig();
// ... 用 executorConfig.preferredModels 执行任务

// 接力到 Reviewer
handoff.handoff("reviewer");
const reviewerConfig = handoff.getActiveConfig();
// ... 用 reviewerConfig.preferredModels 审查结果
```

### 3. 监控 API 暴露

**在 `packages/coding-agent/src/` 添加 HTTP/WebSocket 服务器**

如果 pi 已有 HTTP 服务器：
```typescript
import { getMonitorStatus, websocketMonitor } from "./monitor-api.ts";

app.get("/api/monitor", getMonitorStatus);

server.on("upgrade", (request, socket, head) => {
    if (request.url === "/api/monitor") {
        wss.handleUpgrade(request, socket, head, (ws) => {
            websocketMonitor(ws);
        });
    }
});
```

如果没有，需要添加：
```typescript
import express from "express";
import { WebSocketServer } from "ws";

const app = express();
const server = app.listen(3000);
const wss = new WebSocketServer({ server });

// ... 同上
```

### 4. 前端界面集成

**修改 `pi-frontend/components/AppShell.tsx`（或主布局）**

```tsx
import { AgentStatusPanel } from "./monitor/AgentStatusPanel";
import { ModelSwitchLog } from "./monitor/ModelSwitchLog";
import { StageFlow } from "./monitor/StageFlow";

export function AppShell() {
    return (
        <div className="flex h-screen">
            {/* 左侧：原有内容 */}
            <div className="flex-1">
                {/* ... 原有组件 */}
            </div>
            
            {/* 右侧：监控面板 */}
            <div className="w-80 border-l p-4 space-y-4 overflow-y-auto">
                <AgentStatusPanel />
                <StageFlow />
                <ModelSwitchLog />
            </div>
        </div>
    );
}
```

---

## 🎯 测试验证

### 1. 启动后端
```bash
cd pi-backend
npm install
npm run build
npm start
```

### 2. 启动前端
```bash
cd pi-frontend
npm install
npm run dev
```

### 3. 验证功能

打开浏览器 `http://localhost:3000`，应该能看到：
- 右侧监控面板显示四个 agent 状态
- 执行任务时，agent 状态实时变化
- 模型失败/超时时，切换日志自动更新
- 阶段流程进度条实时推进

---

## 🔄 下一步优化

### 短期（1-2周）
1. [ ] 在 `context.md` 中读取模型配置，而不是硬编码
2. [ ] 添加模型成本统计（每个模型的 token 消耗）
3. [ ] 支持手动切换模型（在 UI 上点击强制切换）

### 中期（1个月）
1. [ ] Guardian 改用轻量模型做预判（在主模型调用前预测是否会失败）
2. [ ] 多任务并行监控（同时监控多个任务的模型状态）
3. [ ] 切换策略优化（根据历史成功率自动调整 fallback 优先级）

### 长期（3个月）
1. [ ] 模型能力画像（记录每个模型擅长的任务类型）
2. [ ] 自适应路由（根据任务特征自动选最优模型）
3. [ ] 成本优化建议（AI 分析当前配置，给出省钱建议）

---

## 📚 关键文件说明

### orchestrator.ts
- **作用**：根据任务类型自动路由到合适的模型
- **扩展点**：`initDefaultModels()` 中添加更多模型配置
- **配置来源**：未来可改为从 `~/.pi/agent/models.json` 读取

### guardian.ts
- **作用**：监控任务超时和失败，触发自动切换
- **扩展点**：可添加更多监控维度（成本、质量、速度）

### roles.ts
- **作用**：定义四角色协同规则，强制 execution_brief 锁定
- **扩展点**：可添加更多角色（如 researcher、writer）

### monitor-api.ts
- **作用**：暴露实时监控数据给前端
- **扩展点**：可添加更多指标（内存、CPU、网络）

---

## ⚠️ 注意事项

1. **WebSocket 端口冲突**：如果 3000 端口被占用，修改 `monitor-api.ts` 和 `useMonitor.ts` 中的端口
2. **模型 ID 匹配**：确保 `orchestrator.ts` 中的模型 ID 与你的 `models.json` 一致
3. **TypeScript 类型**：如果遇到类型错误，检查 `@earendil-works/pi-*` 包的版本是否一致

---

## 🚀 快速启动（最小化测试）

如果只想快速看效果，不做完整集成：

**1. 后端 Mock 数据**
```typescript
// 在 monitor-api.ts 中添加 mock 模式
export const MOCK_MODE = true;

export async function getMonitorStatus(req, res) {
    if (MOCK_MODE) {
        res.json({
            agentStatus: {
                planner: { status: "done", model: "glm-5.2" },
                executor: { status: "working", model: "kimi-k2.7-code" },
                reviewer: { status: "idle", model: "deepseek-v4-pro" },
            },
            guardianStatus: {
                status: "watching",
                model: "deepseek-v4-flash",
                interventionCount: 2,
            },
            switchLog: [
                { timestamp: Date.now(), from: "kimi", to: "glm-5.2", reason: "timeout" },
            ],
        });
        return;
    }
    // ... 正常逻辑
}
```

**2. 前端直接连接 Mock**
```bash
cd pi-frontend
npm run dev
# 打开 http://localhost:3000，监控面板会显示 mock 数据
```

---

完成！🎉
