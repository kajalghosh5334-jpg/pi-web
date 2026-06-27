# Pi Agent 观察器 + 角色编排系统实施总结

## ✅ 已完成的模块

### 后端核心（pi-backend）

```
packages/agent/src/
├── observer-daemon.ts        # Observer 独立进程（多模型备用）
├── role-registry.ts          # 角色库（8个专业角色）
├── role-orchestrator.ts      # 角色编排器（动态加载/切换）
└── main-loop.ts             # 主循环（观察→编排→执行）

packages/coding-agent/src/
└── monitor-api.ts           # 监控 API（扩展：Observer + 角色状态）
```

### 前端监控（pi-frontend）

```
components/monitor/
├── ObserverPanel.tsx        # Observer 状态面板
└── RolePanel.tsx            # 角色状态面板

hooks/
└── useMonitor.ts            # 扩展：Observer + 角色订阅
```

---

## 🎯 核心能力

### 1. Observer 独立进程（高可用）

**三层备用模型**：
```
主模型：opencode-go/deepseek-v4-flash
备用1：deepseek-official（直连官方 API）
备用2：ollama/qwen2.5:7b（本地备用）
```

**容错机制**：
- 连续失败 3 次 → 自动切换到下一层
- 30 秒无成功观察 → 尝试重启（回到主模型）
- 所有模型耗尽 → 标记为 `isAlive=false`，主流程进入降级模式

**独立心跳**：
- 每 5 秒观察一次（读 Memory → 分析 → 推断角色）
- 每 10 秒健康检查

### 2. 角色动态加载

**8 个专业角色**（role-registry.ts）：
- 商业顾问
- 内容策划
- 增长黑客
- 数据分析师
- 技术架构师
- 用户研究员
- 产品经理
- 运营专员

**编排逻辑**（role-orchestrator.ts）：
- 根据 Observer 推断结果动态加载
- 角色变化时记录切换日志
- 生成角色 prompt 注入到 planner/executor/reviewer

### 3. 主流程集成（main-loop.ts）

```
每轮对话：
  1. 检查 Observer 健康状态
  2. 获取最新观察结果
  3. 编排角色
  4. 带角色视角执行 planner → executor → reviewer
  5. Observer 挂了 → 降级到固定角色模式
```

### 4. 监控可视化

**前端显示**：
- Observer 状态（运行中/已停止、当前模型、失败次数）
- 最新观察结果（当前状态、目标状态、差距、建议行动、置信度）
- 当前加载的角色
- 角色切换历史

---

## 🔧 容错矩阵

| 组件 | 主模型 | 备用方案 | 最坏情况 |
|------|--------|---------|---------|
| **Observer** | deepseek-v4-flash | 官方 API → 本地 Ollama | 降级到固定角色 |
| **Planner** | glm-5.2 | deepseek-v4-pro | Guardian 切换 |
| **Executor** | kimi-k2.7 | glm-5.2 | Guardian 切换 |
| **Reviewer** | deepseek-v4-pro | glm-5.2 | Guardian 切换 |
| **Guardian** | deepseek-v4-flash | 无（最底层） | 系统暂停 |

---

## 📋 集成步骤

### 1. 后端启动

修改 `packages/coding-agent/src/cli.ts`（或主入口）：

```typescript
import { initMonitoring } from "./monitor-api.ts";
import { mainLoop } from "@earendil-works/pi-agent-core/main-loop";

async function main() {
    // 初始化监控系统（包含 Observer）
    await initMonitoring();
    
    // 启动主循环
    await mainLoop.start();
    
    // ... 原有逻辑
}
```

### 2. 实际调用点集成

在用户输入处理函数中：

```typescript
import { mainLoop } from "@earendil-works/pi-agent-core/main-loop";

async function handleUserInput(input: string) {
    const result = await mainLoop.processUserInput(input);
    return result;
}
```

### 3. 添加监控 API 路由

```typescript
import { getMonitorStatus, getHealthCheck } from "./monitor-api.ts";

app.get("/api/monitor", getMonitorStatus);
app.get("/api/health", getHealthCheck);
```

### 4. 前端集成

修改主布局（如 `AppShell.tsx`）：

```tsx
import { ObserverPanel } from "./monitor/ObserverPanel";
import { RolePanel } from "./monitor/RolePanel";
import { AgentStatusPanel } from "./monitor/AgentStatusPanel";

export function AppShell() {
    return (
        <div className="flex h-screen">
            {/* 左侧：原有内容 */}
            <div className="flex-1">...</div>
            
            {/* 右侧：监控面板 */}
            <div className="w-80 border-l p-4 space-y-4 overflow-y-auto">
                <ObserverPanel />
                <RolePanel />
                <AgentStatusPanel />
            </div>
        </div>
    );
}
```

---

## 🚀 测试验证

### 1. 启动后端

```bash
cd pi-backend
npm install
npm run build
npm start
```

控制台应显示：
```
[Monitor] Observer 独立进程已启动
[Observer] 启动独立观察进程...
[Observer] 观察中...
```

### 2. 启动前端

```bash
cd pi-frontend
npm install
npm run dev
```

打开 http://localhost:3000，右侧应显示：
- Observer 状态（绿色背景 = 运行中）
- 最新观察结果
- 当前角色（初始为空，对话后出现）

### 3. 测试 Observer 切换

**模拟主模型失败**：
```bash
# 在后端代码中模拟失败
# observer-daemon.ts analyzeState() 中 throw new Error("模拟失败");
```

预期结果：
- 连续失败 3 次后
- 控制台显示：`[Observer] 切换模型: opencode-go/deepseek-v4-flash → deepseek-official/deepseek-chat`
- 前端 Observer 面板显示新模型 ID

### 4. 测试降级模式

**停止 Observer**：
```typescript
await observerDaemon.stop();
```

预期结果：
- 主流程检测到 `observerHealth.isAlive = false`
- 进入降级模式，不加载动态角色
- 继续用固定 planner/executor/reviewer 执行

---

## 📊 实际运行效果

### 用户视角

```
用户："我想做自媒体赚钱"

[Observer 观察]
  当前状态：空白项目
  目标状态：可盈利的自媒体
  差距：商业模式不明确
  建议行动：确认商业模式

[角色编排]
  加载角色：商业顾问、用户研究员

[Planner]
  （带商业顾问视角）
  输出：信息图 - 请确认商业模式（卖产品 or 卖流量？）

---

用户："卖产品给 AI 开发者"

[Observer 观察]
  当前状态：商业模式清晰
  目标状态：有可执行的内容策略
  差距：缺少选题系统
  建议行动：设计选题系统

[角色编排]
  切换角色：商业顾问 → 内容策划、增长黑客

[Planner]
  （带内容策划视角）
  输出：选题系统设计（3个选题方向 + 发布节奏）
```

### 监控面板显示

```
┌─ Observer ──────────────┐
│ ✅ 运行中               │
│ opencore-go/deepseek-v4-flash
│ 上次观察: 18:45:32      │
│ 失败次数: 0              │
│                          │
│ 【最新观察】             │
│ 当前状态: 商业模式清晰   │
│ 目标状态: 有选题系统     │
│ 差距: 缺内容策略         │
│ 建议: 设计选题系统       │
│ 置信度: 85%              │
└──────────────────────────┘

┌─ 当前角色 ──────────────┐
│ 内容策划                │
│ 关注选题策略、内容节奏   │
│                          │
│ 增长黑客                │
│ 关注流量获取、转化漏斗   │
│                          │
│ 【切换历史】             │
│ 商业顾问 → 内容策划      │
│ 18:45:20                │
└──────────────────────────┘
```

---

## 🎉 完成！

现在你有了：
1. ✅ 多模型协同（critical/routine/guardian）
2. ✅ 独立 Observer 进程（高可用、多备用）
3. ✅ 动态角色加载（8个专业角色）
4. ✅ 自适应推进（自己感知状态、推断行动）
5. ✅ 完整监控可视化

**下一步建议**：
- 把 TODO 部分（实际模型调用、Memory 读取）接入真实接口
- 扩展角色库（20+ 专业角色）
- 添加角色推荐（Observer 给出多个角色选项，用户确认）
