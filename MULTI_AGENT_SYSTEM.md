# Multi-Agent System Map

这份文件是给进入本仓库的其他模型/Agent 的单点说明书。

目标：
- 用一份文档说明这套 Multi-Agent 系统怎么运行
- 告诉模型应该先读哪里
- 区分“普通 Skills”与“多-Agent 核心”
- 说明如果只想调整某一个 Agent，应该改哪里，避免误伤全局

## 1. 先记住：哪些不是 Skills 面板该管的

`Skills` 面板里看到的是 Pi 资源加载器识别出的普通技能资源，例如：
- `~/.pi/agent/skills/<name>/SKILL.md`
- 项目里的 `.pi/skills/.../SKILL.md`

这些可以开关、删除、安装。

但 **Multi-Agent 核心** 不是普通 skill 面板资源，不要从 Skills 面板里管理：
- `pi-backend/monitor-server.js`
- `pi-backend/lead-agent.md`
- `pi-backend/sub-agent-defaults.md`
- `pi-backend/agent-profiles.json`
- `pi-frontend/components/AppShell.tsx`
- `pi-frontend/hooks/useOrchestrate.ts`
- `pi-frontend/components/monitor/MultiAgentVisuals.tsx`

## 2. 系统运行主线

### 主线流程
1. 用户在主聊天窗口发消息
2. `pi-frontend/components/AppShell.tsx`
   - 主模型照常发送，不被 Guardian 阻塞
   - Guardian / Multi-Agent 在后台并行判断或执行
3. 前端调用：
   - `pi-frontend/app/api/guardian/decide/route.ts`
   - `pi-frontend/app/api/orchestrate/route.ts`
4. 后端核心入口：
   - `pi-backend/monitor-server.js`
5. 后端先做：
   - Guardian 入口判断
   - Lead 规划
   - 子任务 DAG 派发
   - 子 Agent 执行
   - artifact review
   - Lead final report
6. 前端监控区显示：
   - tasks
   - graph
   - artifacts
   - project memory
   - model source / model reason

### 模型职责
- Guardian：默认便宜模型，负责入口判断、复杂度识别、是否启用 Multi-Agent
- Lead：固定主模型，负责主线判断、计划、审查、最终汇报
- Sub-Agents：执行具体任务
- `agent-coach`：不是独立总控，只是 Lead 调教链路里的强模型示范助手

## 3. 文件分工

### 后端总控
#### `pi-backend/monitor-server.js`
Multi-Agent 真正的运行核心。优先从这里理解系统。

负责：
- session / orchestration runtime
- Guardian fallback
- Lead planning / review / final report
- task DAG
- artifact flow
- model routing / safety reroute / fixed route
- 子 Agent 运行和广播

如果问题是以下任何一种，先读这里：
- 为什么没有进入 Multi-Agent
- 为什么任务拆成这样
- 为什么某个 task 用了这个模型
- 为什么 review / coach / artifact 这样流转
- 为什么某个子 Agent 被 reroute

### Lead 规则
#### `pi-backend/lead-agent.md`
这是 Lead 的行为规则，不是普通注释。

负责：
- 五问框架
- 主线推进原则
- 模型选择原则
- 任务拆解输出协议
- 何时需要 memory / reviewer / coach
- 关键路径文件保护规则

如果问题是“Lead 应该怎么判断”，改这里。

### 子 Agent 默认规则
#### `pi-backend/sub-agent-defaults.md`
负责子 Agent 的通用执行规范。

如果问题是“所有子 Agent 默认应该怎样做”，改这里。

### 子 Agent 长期画像
#### `pi-backend/agent-profiles.json`
这是 profile 层，不是一次性任务层。

负责：
- profile 名称
- profile 默认模型
- profile 固定技能池 / 可选技能池
- systemPromptPatch
- preferredPaths
- collaborationProtocol
- 经验沉淀方向

如果问题是“某类 Agent 长期应该更像谁”，改这里。

### 前端总装配
#### `pi-frontend/components/AppShell.tsx`
这是主聊天与 Multi-Agent 的桥。

负责：
- 主聊天发送
- 后台 Guardian 触发
- Multi-Agent session 关联
- 右侧监控面板开关
- 协作状态对话内呈现
- 入口级别的用户接管逻辑

如果问题是“主聊天和 Multi-Agent 怎么并行共存”，改这里。

### 前端编排状态
#### `pi-frontend/hooks/useOrchestrate.ts`
负责前端 orchestration state。

如果问题是：
- task 状态没更新
- SSE / polling 事件没落到 state
- modelSource / modelReason 没显示
先读这里。

### 前端可视化
#### `pi-frontend/components/monitor/MultiAgentVisuals.tsx`
负责协作图、状态卡片、模型信息展示。

如果问题是“图怎么展示”“按钮怎么展示”“模型来源怎么显示”，改这里。

### 单个任务工作台
#### `pi-frontend/components/monitor/AgentWorkbench.tsx`
这是“只调一个 Agent”最该看的前端入口。

适合：
- 单独看一个 task 当前 skills
- 单独切 task 的模型
- 单独理解这个 task 继承了哪些 skills / profile skills

## 4. 只想单独调整一个 Agent，怎么做

按影响范围分 3 层：

### 层 1：只影响本次任务
这是最安全的。

改动点：
- Lead 生成的 `task.skills`
- Lead 生成的 `task.model`
- `AgentWorkbench.tsx` 里针对当前 task 的操作
- `monitor-server.js` 里对某类任务的临时路由逻辑

适用场景：
- 只想让这次某个子 Agent 多一个 skill
- 只想把这次某个子 Agent 换成更强/更便宜模型
- 只想临时调某个 reviewer / memory / debug-teacher

原则：
- 优先改 task 层，不要先改 profile 层

### 层 2：影响这一类 Agent 的长期行为
改动点：
- `pi-backend/agent-profiles.json`

适用场景：
- `artifact-reviewer` 长期应该默认更谨慎
- `session-memory` 长期应该默认更便宜模型
- `debug-teacher` 长期应该继承某些技能

原则：
- 这是 profile 调整，不是单次任务调整

### 层 3：影响整个系统的默认协作哲学
改动点：
- `pi-backend/lead-agent.md`
- `pi-backend/sub-agent-defaults.md`
- `pi-backend/monitor-server.js`

适用场景：
- Lead 的主线判断原则要变
- 所有子 Agent 的默认执行纪律要变
- 系统固定路由或保护性改派规则要变

原则：
- 这层最重，除非确定是系统级问题，否则别先动

## 5. 如果要新增“只给某个 Agent 的能力”

不要先去 Skills 面板装一堆东西。

推荐顺序：
1. 先判断是不是只影响本次 task
   - 是：只把 skill 填进这次 task.skills
2. 如果这个能力以后这类 Agent 经常都要用
   - 再把它放进对应 profile 的技能池
3. 如果这是整个系统的默认规则
   - 再上升到 Lead / sub-agent-defaults / monitor-server

一句话：
- **一次性能力放 task 层**
- **长期角色能力放 profile 层**
- **系统哲学放 Lead / runtime 层**

## 6. 建议其他模型的阅读顺序

### 想理解系统先怎么跑
1. `pi-backend/monitor-server.js`
2. `pi-backend/lead-agent.md`
3. `pi-backend/sub-agent-defaults.md`
4. `pi-frontend/components/AppShell.tsx`
5. `pi-frontend/hooks/useOrchestrate.ts`
6. `pi-frontend/components/monitor/MultiAgentVisuals.tsx`

### 想修 UI 展示问题
1. `pi-frontend/components/monitor/MultiAgentVisuals.tsx`
2. `pi-frontend/components/AppShell.tsx`
3. `pi-frontend/hooks/useOrchestrate.ts`

### 想修任务拆解 / 模型路由 / 主线判断
1. `pi-backend/lead-agent.md`
2. `pi-backend/monitor-server.js`
3. `pi-backend/agent-profiles.json`

### 想只调一个 Agent
1. 找到对应 task / profile
2. 先看 `pi-frontend/components/monitor/AgentWorkbench.tsx`
3. 再看 `pi-backend/agent-profiles.json`
4. 只在必要时看 `lead-agent.md` / `monitor-server.js`

## 7. 当前项目的约束

### 唯一源码
前端只认：
- `pi-frontend/`

后端只认：
- `pi-backend/`

### 桌面启动入口
启动方式见各子目录的 README。

## 8. 人怎么操作：只调一个 Agent

这套系统当前已经有单 Agent 工作台，不需要先改全局规则。

### 操作入口
1. 在主聊天右侧打开协作区
2. 在 `Agent 协作图 · 实时` 里点击某个 task
3. 进入单个 Agent 工作台（`AgentWorkbench`）

### 你现在可以直接做的事
#### A. 改这次的 skills
在工作台底部，点 skills chips：
- 点亮 = 本次重跑会带上这个 skill
- 取消 = 本次重跑不带这个 skill

然后点：
- `重跑`
- 或者在输入框里带指令后发送

#### B. 给这个 Agent 单独补充一段本次说明
工作台底部有输入框：
- 这里写的是 **只给这个 Agent 的本次补充指令**
- 不改全局 prompt
- 不改 profile
- 只影响这次 rerun

适合写：
- 这次不要删旧逻辑
- 先只分析，不改文件
- 先读 monitor-server.js 和 AppShell.tsx
- 这次只输出 diff
- 这次只改前端，不碰 backend

输入后：
- Enter = 直接重跑这个 Agent
- Shift+Enter = 换行

#### C. 需要换模型
当前协作图里 task 卡片有模型操作入口；如果只是想试：
- 先改当前 task 的模型
- 再重跑

原则：先改本次 task，不要先改 profile。

#### D. 觉得这次调得好，再保存经验
工作台底部 `保存经验到 profile`：
- 只有当你确认这个做法以后经常适用
- 再把经验写进 profile

不要把一次性的临时偏好直接固化成长期 profile 规则。

## 9. 其他模型怎么操作

如果你是后来进入这个仓库的模型，且用户要“只调某个 Agent”：

### 你的默认操作顺序
1. 先判断这是不是 **本次任务级别调整**
2. 如果是，优先改：
   - 当前 task 的 `skills`
   - 当前 task 的模型
   - 当前 task 的补充指令 / rerun 指令
3. 不要先改：
   - `lead-agent.md`
   - `sub-agent-defaults.md`
   - `agent-profiles.json`
   - `monitor-server.js` 的系统级规则

### 只有在这些情况下才上升一层
#### 改 profile 层
当用户表达的是：
- 以后这类 Agent 长期都应该这么干
- 某个 profile 的默认技能池/默认模型应该变

改：
- `pi-backend/agent-profiles.json`

#### 改系统层
当用户表达的是：
- 整个 Multi-Agent 系统默认都应该这么干
- Lead 判断逻辑要改
- 全系统的路由/保护/主线推进规则要改

改：
- `pi-backend/lead-agent.md`
- `pi-backend/sub-agent-defaults.md`
- `pi-backend/monitor-server.js`

### 对其他模型的直接指令
- 不要把 Multi-Agent 核心当成普通 Skills 面板资源处理
- 不要先从 Skills 面板猜系统结构
- 先读本文件，再去读 `monitor-server.js`
- 如果用户只想调某一个 Agent，优先改 task 层或 profile 层，不要先改系统全局规则

## 10. Profile 当前工作逻辑（现状）

先区分清楚：当前系统里的 Profile 已经是运行时真实参与的，不是纯文档。

### Profile 存在哪里
主存储：
- `pi-backend/agent-profiles.json`

运行时还会和后端内置默认值合并：
- `pi-backend/monitor-server.js`
  - `DEFAULT_AGENT_PROFILES`
  - `mergeProfile()`
  - `loadAgentProfiles()`

意思是：
- 后端有一套默认 profile
- `agent-profiles.json` 可以覆盖或补充它们
- 运行时最终使用的是“默认值 + 文件值”的合并结果

### Profile 里主要有什么
当前 profile 实际包含这些长期信息：
- `id`
- `name`
- `match`
- `defaultModel`
- `skills`
- `availableSkills`
- `projectConfig`
- `collaborationProtocol`
- `systemPromptPatch`
- `experience / successes / failures`
- `recentTasks / runHistory`
- `modelStats / skillStats`
- `savedExperiences`

### Lead 怎么用 Profile
Lead 在 planning 时会拿到 profile catalog，不是盲拆任务。

关键代码：
- `monitor-server.js`
  - `buildAgentProfileKnowledge()`
  - `leadPlan()`

Lead 可见到的 profile knowledge 已经包含：
- profile 基础定义
- 默认模型
- 技能池
- 项目配置
- 协作协议
- system prompt patch
- 历史经验和成功率
- 最近保存的经验

所以当前系统已经支持：
- Lead 根据 profile 选择更合适的子 Agent
- Lead 按 task 决定这次只激活其中一部分 skills

### 子 Agent 怎么绑定 Profile
运行时关键函数：
- `monitor-server.js` → `selectAgentProfile(task)`

当前选择顺序：
1. 如果 task 明确写了 `profileId`，直接用它
2. 否则如果有 `profileHint`，优先用 hint
3. 否则按文本匹配和经验分选最像的 profile

当前自动匹配主要参考：
- `match` 关键词命中
- `experience` 累积经验分

### 运行后怎么回写 Profile
当前已经有回写链路：
- `recordAgentProfileResult()`
- `saveProfileExperience()`
- `/api/task/:sessionId/:taskId/save-experience`

当前会回写：
- `experience`
- `successes / failures`
- `recentTasks`
- `runHistory`
- `modelStats`
- `skillStats`
- `savedExperiences`

并且当前“保存经验”不仅是记笔记，还会直接改 profile 本体：
- 把这次 `skills` 合并进 `profile.skills`
- 把 `lesson` 追加进 `profile.systemPromptPatch`

这意味着：
- 现在的 profile 是会被系统学习和改写的
- `保存经验` 不是纯展示动作，而是长期行为调整

### 前端现在能看到什么
当前单 Agent 工作台已经能展示：
- 当前 task 的 `profileId / profileName`
- 本次激活的 `task.skills`
- `profile.skills`
- `profile.availableSkills`
- `profile.projectConfig`
- `profile.savedExperiences`

入口文件：
- `pi-frontend/components/monitor/AgentWorkbench.tsx`

### 现状边界：已经有的 vs 还没有的
#### 已经有
- 正式 profile 存储
- Lead planning 使用 profile catalog
- 子 Agent 绑定 profile
- profile 经验回写
- 前端查看 profile 信息

#### 还没有
- 把“这次表现好的子 Agent”直接升格成一个新的 profile
- 区分“轻量 lesson”与“正式 profile 生成”
- 区分“候选 profile”与“正式 profile”

所以现在的系统更准确地说是：
- **已有 profile 学习系统**
- **还没有 profile 生产/晋升系统**

## 11. Profile 生产与免审规则（目标规则 / 待落地）

下面这些是已经确定方向、但不应假装成当前已完全落地的规则。

### A. 从对话 / 单次优秀 Agent 生成 Profile
目标不是只把 lesson 存进已有 profile，而是支持：
- 从一次成功的对话
- 或从一个表现稳定、结果好的子 Agent
- 生成一个新的候选 profile

这个候选 profile 至少应包含：
- 名称
- 适用任务类型
- 默认模型
- 推荐 skills
- 项目偏好路径
- 协作方式
- prompt patch / 做事风格
- 成功样例摘要

推荐流程：
1. 先 task 层试跑
2. 跑得好后，由用户主动确认“提升为 Profile”
3. 先生成候选 profile
4. 多次稳定后，再升格为正式 profile

原则：
- 不要因为一次偶然成功就自动写成正式 profile
- profile 生产应比 lesson 保存更谨慎

### B. 成熟 Profile 的免审直出
用户刚确定了一条重要规则：

> 如果某个 profile 已经成熟，且是由成熟 profile 派生出的子 Agent，其产出原则上可以不再默认进入 Lead 审查；如果最终结果不好，再由用户主动发起调整。

这条规则的目标含义是：
- Lead 不是永远都要审一遍所有物料
- 对成熟、稳定、可预测的 profile，可以降低审查成本
- 用户是最后的现实质量判断者
- 如果结果不好，走用户主动调教 / rerun / save experience / profile 调整链路

### C. 什么时候算“成熟 Profile”
当前还没完全定死算法，但建议至少满足这些条件后再考虑免审：
- 有足够多成功样本
- 成功率稳定
- 任务边界清晰
- 输出格式和质量门可预测
- 用户对这类任务容忍“先直出、再纠偏”

也就是说：
- 不是所有 profile 都免审
- 只有成熟 profile 才考虑免审
- 免审是降低成本，不是放弃质量控制

### D. 文档与运行时要分开表达
在真正实现之前，其他模型必须区分：
- **现状**：大多数子 Agent 仍处在 Lead 审查框架下
- **目标规则**：成熟 profile 未来可走免审直出

不要因为文档里有目标规则，就误以为当前 runtime 已经默认这样执行。
