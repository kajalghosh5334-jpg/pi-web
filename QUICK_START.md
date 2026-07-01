# Pi Agent 完整系统启动指南

## ✅ 已完成的集成

### 后端
- ✅ Observer 真实模型调用（OpenCode-Go / DeepSeek 官方 / Ollama）
- ✅ Memory 实际读取（agent_memory/context.md + progress.md）
- ✅ Planner/Executor/Reviewer 接入模型调度器
- ✅ 监控 API 服务器（HTTP + WebSocket）
- ✅ 测试脚本

### 前端
- ✅ 监控面板（独立页面 /monitor）
- ✅ 5 个组件（Observer / Role / Agent / ModelSwitch / StageFlow）
- ✅ 实时 WebSocket 订阅

---

## 🚀 快速启动

### 1. 安装依赖

```bash
cd pi-backend
npm install
```

```bash
cd pi-frontend
npm install
```

安装完成后会自动在桌面生成 **Pi Web** 启动图标；双击图标会启动前端并以应用窗口打开。

### 2. 配置环境变量（可选）

如果要使用 DeepSeek 官方 API 备用：

```bash
export DEEPSEEK_API_KEY="your_api_key_here"
```

### 3. 启动后端监控服务器

```bash
cd pi-backend
node monitor-server.js
```

预期输出：
```
[Monitor] Observer 独立进程已启动
[Observer] 启动独立观察进程...
✅ 监控 API 启动: http://localhost:3000
   - 状态接口: http://localhost:3000/api/monitor
   - 健康检查: http://localhost:3000/api/health
   - WebSocket: ws://localhost:3000/api/monitor
```

### 4. 启动前端

```bash
cd pi-frontend
npm run dev
```

### 5. 访问监控面板

打开浏览器：**http://localhost:3001/monitor**

应该能看到：
- Observer 状态（绿色 = 运行中）
- 最新观察结果
- 当前角色（初始为空）
- Agent 状态
- 模型切换日志

---

## 🧪 测试验证

### 测试 1：Observer 独立运行

```bash
cd pi-backend
node test-observer.js
```

预期输出：
```
=== Observer + 角色编排测试 ===

[1] 启动 Observer...
[Observer] 启动独立观察进程...
[2] 等待首次观察...
[3] 获取观察结果...
   当前状态: 商业模式已确认
   目标状态: 有可执行的选题系统
   差距: 缺少内容策略和选题框架
   建议行动: 设计选题系统
   置信度: 0.85

[4] 编排角色...
   当前角色: 内容策划, 增长黑客

[5] 角色 prompt:
# 当前加载的角色
...

[6] 健康检查:
   状态: ✅ 健康
   当前模型: opencode-go/deepseek-v4-flash
   失败次数: 0

✅ 测试完成！
```

### 测试 2：API 接口

```bash
# 健康检查
curl http://localhost:3000/api/health

# 完整监控状态
curl http://localhost:3000/api/monitor
```

### 测试 3：模型切换

手动修改 `observer-daemon.ts` 中的 `analyzeState()` 抛出错误：

```typescript
private async analyzeState(memoryState: any): Promise<ObservationResult> {
    throw new Error("模拟失败"); // 测试用
    // ...
}
```

重启服务器，观察控制台：
```
[Observer] 观察失败 (1 次): ...
[Observer] 观察失败 (2 次): ...
[Observer] 观察失败 (3 次): ...
[Observer] 切换模型: opencode-go/deepseek-v4-flash → deepseek-official/deepseek-chat
```

前端 Observer 面板会显示新模型 ID。

---

## 📊 实际运行效果

### 1. 初次启动

**后端控制台**：
```
[Monitor] Observer 独立进程已启动
[Observer] 启动独立观察进程...
[Observer] 读取 Memory...
[Observer] 分析状态...
[RoleOrchestrator] 角色切换: [] → [内容策划, 增长黑客]
```

**前端监控面板**：
```
┌─ Observer ──────────────────┐
│ ✅ 运行中                   │
│ opencode-go/deepseek-v4-flash
│ 失败次数: 0                  │
│                              │
│ 【最新观察】                 │
│ 当前状态: 商业模式已确认     │
│ 目标状态: 有可执行的选题系统 │
│ 差距: 缺少内容策略           │
│ 建议: 设计选题系统           │
│ 置信度: 85%                  │
└──────────────────────────────┘
```

### 2. 对话后

用户通过主界面发送消息后：

**主循环处理**：
```
[MainLoop] 当前角色: 内容策划, 增长黑客
[Planner] 规划中...
[Planner with opencore-go/glm-5.2] 规划结果
[Executor] 执行中...
[Executor with opencore-go/kimi-k2.7-code] 执行结果
[Reviewer] 审查中...
[Reviewer with opencore-go/deepseek-v4-pro] 审查结果
```

**监控面板更新**：
- Agent Status：显示各 agent 正在工作
- Role Panel：显示当前激活的角色

---

## 🔧 故障排查

### 问题 1：Observer 启动失败

**症状**：控制台显示 `[Observer] 读取 Memory 失败`

**原因**：找不到 `agent_memory/` 目录

**解决**：
```bash
mkdir -p agent_memory
echo 'goal_final: "测试目标"' > agent_memory/context.md
echo 'current_step: "测试阶段"' > agent_memory/progress.md
```

### 问题 2：前端无法连接 WebSocket

**症状**：前端 console 显示 `WebSocket connection failed`

**原因**：后端监控服务器未启动或端口冲突

**解决**：
1. 确认 `monitor-server.js` 正在运行
2. 检查端口 3000 是否被占用：`lsof -i :3000`
3. 修改端口：编辑 `monitor-server.js` 和 `useMonitor.ts` 中的端口号

### 问题 3：Observer 一直失败

**症状**：控制台显示所有模型都失败

**原因**：
- OpenCode-Go 接口不通
- DeepSeek API Key 未配置
- Ollama 未安装

**解决**：
1. 检查网络连接
2. 配置 `DEEPSEEK_API_KEY` 环境变量
3. 安装 Ollama：`brew install ollama && ollama pull qwen2.5:7b`

---

## 📝 下一步优化

### 短期（1-2天）
- [ ] 接入 pi-ai 包的真实模型调用接口
- [ ] 优化 Memory 解析（支持 YAML 格式）
- [ ] 添加角色推荐（Observer 给出多个选项，用户确认）

### 中期（1周）
- [ ] 扩展角色库（20+ 专业角色）
- [ ] Observer 预判优化（在主模型调用前预测是否会失败）
- [ ] 添加成本统计（每个模型的 token 消耗）

### 长期（1个月）
- [ ] 角色能力画像（记录每个角色的成功率）
- [ ] 自适应路由（根据任务特征自动选模型 + 角色）
- [ ] 分布式 Observer（多实例高可用）

---

## 🎉 完成！

现在你有一个完整的：
- ✅ 多模型协同系统（critical / routine / guardian）
- ✅ Observer 独立进程（高可用、多备用）
- ✅ 动态角色加载（8 个专业角色）
- ✅ 自适应推进（自己感知状态、推断行动）
- ✅ 完整监控可视化

**监控面板地址**：http://localhost:3001/monitor
