"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ViewName = "chat" | "overview" | "workflow";
type SidebarMode = "browse" | "detail";
type ThinkingState = "placeholder" | "preview" | "steps" | "collapsed";
type AgentKey = "research" | "codegen" | "review" | "summarize";

type ConversationItem = {
  title: string;
  meta: string;
  multiAgent?: boolean;
};

type AgentCard = {
  key: AgentKey;
  name: string;
  role: string;
  badge: "running" | "done" | "escalated";
  ledger: string;
  footLeft: string;
  footRight: string;
};

type ConversationDetail = ConversationItem & {
  userMessage: string;
  answer: string[];
  agentCalls: number;
  ledgerWrites: number;
  duration: string;
  status: string;
  files: string[];
  tokenCount: string;
  activeAgents: number;
  thinkingSteps: Array<{ kind: "thought" | "tool"; label: string }>;
};

type WorkflowStage = {
  label: string;
  sublabel: string;
  status: "done" | "active" | "pending";
};

type WorkflowDetail = {
  dispatchedAt: string;
  stages: WorkflowStage[];
  stateList: Array<{ label: string; status: "past" | "current" | "future" }>;
  retryUsed: number;
  retryMax: number;
  retryNote: string;
  conflictNote: string;
  summary: string;
  nextAction: string;
};

const conversations: ConversationDetail[] = [
  {
    title: "调度死锁排查",
    meta: "进行中 · 2 分钟前",
    multiAgent: true,
    userMessage: "子 Agent 调度超时的根因，是不是 dispatch 和 wait 耦合在一起了？",
    answer: [
      "是的，根因就是 dispatch 和 wait 耦合在一起了。",
      "子 Agent 是按轮次调用的 LLM，没法主动上报状态，所以主流程只能阻塞等待返回，一旦子 Agent 跑得久，主调用就被拖住。",
      "解法是 fire-and-forget：dispatch 后立即返回，子 Agent 完成时把结果写入 Ledger，由编排层检测到写入后再独立唤起一次新的主 Agent 调用。",
    ],
    agentCalls: 3,
    ledgerWrites: 7,
    duration: "4 分 12 秒",
    status: "运行中",
    files: ["orchestrator/dispatch.ts", "ledger/schema.md", "ui/ThinkingStatusLine.tsx"],
    tokenCount: "48.2k",
    activeAgents: 2,
    thinkingSteps: [
      { kind: "thought", label: "检查 dispatch 调用栈是否阻塞主线程" },
      { kind: "tool", label: "读取 ledger.json" },
      { kind: "thought", label: "对比 dispatch 时间点与 ledger 写入时间点" },
      { kind: "tool", label: "grep agentRunning 状态流转点" },
      { kind: "thought", label: "确认超时发生在等待子 Agent 返回的同步等待上" },
      { kind: "thought", label: "归纳：dispatch 与 wait 耦合是根因" },
    ],
  },
  {
    title: "thinking status line 重构",
    meta: "昨天",
    userMessage: "thinking status line 要不要从 message 生命周期推断，改成编排层显式发边界事件？",
    answer: [
      "要改成编排层显式事件，不能继续从消息生命周期里猜。",
      "当前闪烁问题本质上是把 agent-run 级边界误判成了 message 级边界，所以状态会提前消失或反复切换。",
      "最稳的做法是在 orchestration 层发出类似 final_output_started 的结构性事件，让 UI 直接消费，而不是推断。",
    ],
    agentCalls: 1,
    ledgerWrites: 2,
    duration: "1 分 08 秒",
    status: "已完成",
    files: ["ui/ThinkingStatusLine.tsx", "hooks/useAgentSession.ts"],
    tokenCount: "12.6k",
    activeAgents: 0,
    thinkingSteps: [
      { kind: "thought", label: "确认现有状态依赖 message_end 事件" },
      { kind: "tool", label: "搜索 finalOutputStarted 引用位置" },
      { kind: "thought", label: "比较单 Agent 与编排态事件边界" },
      { kind: "thought", label: "得出结论：状态边界要显式声明" },
    ],
  },
  {
    title: "12 文件系统审计",
    meta: "6 月 24 日",
    multiAgent: true,
    userMessage: "对这套 12 文件系统做一次结构审计，看看最危险的地方在哪里。",
    answer: [
      "最危险的不是编排模式本身，而是共享上下文层和错误升级路径没有完全闭环。",
      "当前实现里 deterministic routing 的方向是对的，但 observability、failure isolation 和 escalation 还需要继续加强。",
      "建议优先把协议事件、状态落盘和任务级预算边界统一起来。",
    ],
    agentCalls: 4,
    ledgerWrites: 11,
    duration: "9 分 31 秒",
    status: "已完成",
    files: ["multi-agent-protocol.js", "monitor-server.js", "observer-daemon.ts"],
    tokenCount: "63.4k",
    activeAgents: 0,
    thinkingSteps: [
      { kind: "tool", label: "遍历多 agent 相关入口文件" },
      { kind: "thought", label: "对照 P0/P1 模块缺口" },
      { kind: "tool", label: "读取 monitor 与 protocol 实现" },
      { kind: "thought", label: "总结出共享上下文和故障隔离风险" },
    ],
  },
  {
    title: "run.py 双调用架构讨论",
    meta: "6 月 7 日",
    userMessage: "run.py 里双调用是不是值得保留，还是应该彻底合并？",
    answer: [
      "短期不建议粗暴合并，因为两段调用承担的时序责任不同。",
      "更合理的方向是抽出统一的协议层和状态层，让双调用共享边界定义，而不是先合并流程。",
    ],
    agentCalls: 0,
    ledgerWrites: 0,
    duration: "38 秒",
    status: "已归档",
    files: ["run.py", "agent-loop.ts"],
    tokenCount: "8.9k",
    activeAgents: 0,
    thinkingSteps: [
      { kind: "thought", label: "识别双调用各自承担的职责" },
      { kind: "thought", label: "判断合并风险高于短期收益" },
    ],
  },
  {
    title: "WeChat AppleScript 输入问题",
    meta: "6 月 7 日",
    userMessage: "WeChat 的 AppleScript 输入为什么偶发丢字？",
    answer: [
      "根因更像宿主输入焦点和注入时机不稳定，不是单纯的字符串编码问题。",
      "如果继续做，应该把焦点确认、重试和可观测日志拆出来单独处理。",
    ],
    agentCalls: 0,
    ledgerWrites: 0,
    duration: "51 秒",
    status: "已归档",
    files: ["applescript-input.ts"],
    tokenCount: "6.4k",
    activeAgents: 0,
    thinkingSteps: [
      { kind: "thought", label: "排除编码与文本清洗问题" },
      { kind: "thought", label: "聚焦焦点切换和输入时机" },
    ],
  },
];

const agentCards: AgentCard[] = [
  {
    key: "research",
    name: "调研 Agent",
    role: "role: research",
    badge: "running",
    ledger: "analyzing dispatch coupling pattern...",
    footLeft: "已运行 41s",
    footRight: "Run #0231",
  },
  {
    key: "codegen",
    name: "代码生成 Agent",
    role: "role: codegen",
    badge: "running",
    ledger: "drafting orchestrator/dispatch.ts patch...",
    footLeft: "已运行 18s",
    footRight: "Run #0232",
  },
  {
    key: "review",
    name: "审核 Agent",
    role: "role: review",
    badge: "escalated",
    ledger: "retry 3/3 exhausted - escalated for manual review",
    footLeft: "已运行 2m 03s",
    footRight: "Run #0229",
  },
  {
    key: "summarize",
    name: "汇总 Agent",
    role: "role: aggregate",
    badge: "done",
    ledger: "aggregation complete, no conflicts found",
    footLeft: "耗时 8s",
    footRight: "Run #0228",
  },
];

const workflowDetails: Record<AgentKey, WorkflowDetail> = {
  research: {
    dispatchedAt: "6/29 14:02:11",
    stages: [
      { label: "Dispatch", sublabel: "fire-and-forget", status: "done" },
      { label: "子 Agent 运行", sublabel: "独立轮次调用", status: "done" },
      { label: "Ledger 写入", sublabel: "强制写入 · 结构化", status: "active" },
      { label: "主 Agent 重新唤起", sublabel: "独立调用 · 非续接", status: "pending" },
      { label: "结果聚合", sublabel: "冲突不自动合并", status: "pending" },
    ],
    stateList: [
      { label: "DISPATCHED", status: "past" },
      { label: "RUNNING", status: "past" },
      { label: "LEDGER_WRITTEN", status: "current" },
      { label: "AGGREGATING", status: "future" },
    ],
    retryUsed: 1,
    retryMax: 3,
    retryNote: "超过固定重试次数后自动升级，不做无限重试或启发式判断。",
    conflictNote: "多个子 Agent 结果冲突时，编排层不自动合并或仲裁，仅在 Ledger 中标记冲突状态，交由主 Agent 在下一轮独立判断。",
    summary: "当前这条链路正在验证 dispatch 后立即返回、结果落 Ledger、再二次唤起主 Agent 的闭环。",
    nextAction: "等待 ledger watcher 检测写入并触发聚合。",
  },
  codegen: {
    dispatchedAt: "6/29 14:02:34",
    stages: [
      { label: "Dispatch", sublabel: "worker ownership fixed", status: "done" },
      { label: "代码修改", sublabel: "patch in progress", status: "active" },
      { label: "Patch 写回", sublabel: "session append", status: "pending" },
      { label: "主线程校验", sublabel: "lint / runtime", status: "pending" },
      { label: "结果聚合", sublabel: "final synthesis", status: "pending" },
    ],
    stateList: [
      { label: "DISPATCHED", status: "past" },
      { label: "PATCHING", status: "current" },
      { label: "VERIFYING", status: "future" },
      { label: "MERGED", status: "future" },
    ],
    retryUsed: 0,
    retryMax: 3,
    retryNote: "代码 worker 默认不重试写补丁，先交由主线程做静态校验后决定是否 rerun。",
    conflictNote: "若 patch 与用户本地改动冲突，编排层只标记冲突文件，不在后台自动覆盖。",
    summary: "这一条 workflow 用来展示 worker 负责局部修改、主线程负责整合验证的责任边界。",
    nextAction: "等待 patch 完成后进入 lint 和 UI smoke check。",
  },
  review: {
    dispatchedAt: "6/29 13:59:48",
    stages: [
      { label: "Dispatch", sublabel: "review requested", status: "done" },
      { label: "检查冲突", sublabel: "3 次固定重试", status: "done" },
      { label: "升级", sublabel: "manual review required", status: "active" },
      { label: "等待确认", sublabel: "user or lead agent", status: "pending" },
      { label: "恢复聚合", sublabel: "resume after approval", status: "pending" },
    ],
    stateList: [
      { label: "DISPATCHED", status: "past" },
      { label: "RETRYING", status: "past" },
      { label: "ESCALATED", status: "current" },
      { label: "AWAITING_CONFIRMATION", status: "future" },
    ],
    retryUsed: 3,
    retryMax: 3,
    retryNote: "达到上限后直接升级，不允许 review worker 无限制自愈。",
    conflictNote: "这里的冲突不是自动决策类问题，必须保留给主 Agent 或用户确认。",
    summary: "这条链路演示 failure isolation：单个 review agent 故障不会阻塞其他 worker 继续产出。",
    nextAction: "等待人工或主 Agent 对冲突策略做确认。",
  },
  summarize: {
    dispatchedAt: "6/29 13:58:22",
    stages: [
      { label: "Dispatch", sublabel: "collect outputs", status: "done" },
      { label: "读取 Ledger", sublabel: "consume structured results", status: "done" },
      { label: "冲突检测", sublabel: "no conflicts", status: "done" },
      { label: "结果聚合", sublabel: "single answer", status: "done" },
      { label: "写回主对话", sublabel: "completed", status: "active" },
    ],
    stateList: [
      { label: "DISPATCHED", status: "past" },
      { label: "COLLECTING", status: "past" },
      { label: "AGGREGATED", status: "past" },
      { label: "WRITTEN_BACK", status: "current" },
    ],
    retryUsed: 0,
    retryMax: 2,
    retryNote: "汇总 agent 只在读取到不完整上下文时做一次补读，不承担开放式推断重试。",
    conflictNote: "本次没有检测到冲突，所以结果可以直接回填到主对话线程。",
    summary: "这条链路展示完整闭环：多个 worker 完成后，汇总 agent 生成一个可读结论写回聊天。",
    nextAction: "等待用户继续追问或开始下一轮任务。",
  },
};

const thinkingLabels: Record<ThinkingState, string> = {
  placeholder: "正在思考...",
  preview: "正在分析 dispatch 与 wait 是否耦合...",
  steps: "思考中 · 第 4 步",
  collapsed: "已完成思考 · 6 步 · 12s",
};

function Badge({ type }: { type: AgentCard["badge"] }) {
  const label = type === "running" ? "运行中" : type === "done" ? "已完成" : "故障升级";
  return (
    <div className={`badge badge-${type}`}>
      <span className="d" />
      {label}
    </div>
  );
}

export function CodexLayoutPrototype() {
  const [activeView, setActiveView] = useState<ViewName>("chat");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("browse");
  const [selectedConversation, setSelectedConversation] = useState(0);
  const [thinkingState, setThinkingState] = useState<ThinkingState>("collapsed");
  const [selectedAgent, setSelectedAgent] = useState<AgentKey>("research");
  const currentConversation = conversations[selectedConversation] ?? conversations[0];
  const currentWorkflow = workflowDetails[selectedAgent];

  const statusSegments = useMemo(() => {
    const runCount = agentCards.filter((agent) => agent.badge === "running").length;
    const failCount = agentCards.filter((agent) => agent.badge === "escalated").length;
    const doneCount = agentCards.filter((agent) => agent.badge === "done").length;
    const waitCount = 1;
    const segments = [
      { key: "run", value: runCount, label: "运行中", className: "run" },
      { key: "wait", value: waitCount, label: "等待中", className: "" },
      { key: "done", value: doneCount + 4, label: "已完成", className: "" },
      { key: "fail", value: failCount, label: "失败", className: "fail" },
    ];
    return segments.filter((segment) => segment.value > 0);
  }, []);

  const cycleThinkingState = () => {
    const order: ThinkingState[] = ["placeholder", "preview", "steps", "collapsed"];
    const currentIndex = order.indexOf(thinkingState);
    setThinkingState(order[(currentIndex + 1) % order.length] ?? "collapsed");
  };

  const toggleSteps = () => {
    setThinkingState((current) => (current === "steps" ? "collapsed" : "steps"));
  };

  const openWorkflow = (agentKey: AgentKey) => {
    setSelectedAgent(agentKey);
    setActiveView("workflow");
  };

  const isStepsOpen = thinkingState === "steps";
  const showChevron = thinkingState === "steps" || thinkingState === "collapsed";

  return (
    <div className="proto-app">
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          派
        </div>

        <div className="tabs">
          {[
            { key: "chat", label: "对话" },
            { key: "overview", label: "Multi-Agent 总览" },
            { key: "workflow", label: "Workflow" },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`tab ${activeView === tab.key ? "active" : ""}`}
              onClick={() => setActiveView(tab.key as ViewName)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="top-stats">
          <span>
            Token <b>{currentConversation.tokenCount}</b>
          </span>
          <span>
            运行中 Agent <b>{currentConversation.activeAgents}</b>
          </span>
        </div>

        <button
          className="new-conv-btn"
          onClick={() => {
            setActiveView("chat");
            setSelectedConversation(0);
            setSidebarMode("browse");
            setThinkingState("placeholder");
          }}
        >
          + 新对话
        </button>
      </div>

      <div className={`view ${activeView === "chat" ? "active" : ""}`}>
        <div className="sidebar">
          <div className="mode-switch">
            {[
              { key: "browse", label: "浏览" },
              { key: "detail", label: "详情" },
            ].map((mode) => (
              <button
                key={mode.key}
                className={sidebarMode === mode.key ? "active" : ""}
                onClick={() => setSidebarMode(mode.key as SidebarMode)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {sidebarMode === "browse" ? (
            <div className="conv-list">
              {conversations.map((conversation, index) => (
                <button
                  key={conversation.title}
                  className={`conv-item ${selectedConversation === index ? "active" : ""}`}
                  onClick={() => setSelectedConversation(index)}
                >
                  <div className="t">
                    {conversation.multiAgent ? <span className="agent-flag" /> : null}
                    {conversation.title}
                  </div>
                  <div className="meta">{conversation.meta}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="detail-panel">
              <h4>本次对话</h4>
              <div className="detail-row">
                <span>调用 Agent</span>
                <span className="v">{currentConversation.agentCalls}</span>
              </div>
              <div className="detail-row">
                <span>Ledger 写入</span>
                <span className="v">{currentConversation.ledgerWrites} 次</span>
              </div>
              <div className="detail-row">
                <span>耗时</span>
                <span className="v">{currentConversation.duration}</span>
              </div>
              <div className="detail-row">
                <span>状态</span>
                <span className="v">{currentConversation.status}</span>
              </div>
              <div className="detail-files">
                <h4>涉及文件</h4>
                {currentConversation.files.map((file) => (
                  <div key={file} className="f">{file}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="chat-col">
          <div className="chat-scroll">
            <div className="msg-row msg-user">
              <div className="bubble">{currentConversation.userMessage}</div>
            </div>

            <div className="msg-row msg-assistant">
              <div className="bubble">
                <div className="tline">
                  <button
                    className={`tline-row ${isStepsOpen ? "expanded" : ""}`}
                    onClick={toggleSteps}
                  >
                    <span className="glyph">◆</span>
                    <span className="label">{thinkingLabels[thinkingState]}</span>
                    {showChevron ? <span className="chev">›</span> : null}
                  </button>

                  <div className={`tline-steps ${isStepsOpen ? "open" : ""}`}>
                    {currentConversation.thinkingSteps.map((step) => (
                      <div key={step.label} className={`tline-step ${step.kind === "tool" ? "tool" : ""}`}>
                        <span className="glyph">{step.kind === "tool" ? "⚙" : "◆"}</span>
                        <span className="label">{step.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="answer-text">
                  {currentConversation.answer.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="proto-demo">
            <span>原型演示 · thinking status line 状态：</span>
            <span className="state-name">{thinkingState}</span>
            <button onClick={cycleThinkingState}>切换下一状态 -&gt;</button>
          </div>

          <div className="input-bar">
            <div className="input-shell">
              <textarea placeholder="继续提问..." />
              <div className="input-controls">
                <div className="chip">DeepSeek V4 Flash ▾</div>
                <div className="chip on">⚙ 工具调用</div>
                <button className="send-btn">↑</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`view overview-view ${activeView === "overview" ? "active" : ""}`}>
        <div className="status-bar">
          {statusSegments.map((segment, index) => (
            <div key={segment.key} className="status-group">
              {index > 0 ? <div className="sep" /> : null}
              <div className={`status-seg ${segment.className}`}>
                <span className="num">{segment.value}</span>
                <span>{segment.label}</span>
              </div>
            </div>
          ))}
          <span className="hint">零计数状态自动隐藏</span>
        </div>

        <div className="agent-grid">
          {agentCards.map((agent) => (
            <button
              key={agent.key}
              className={`agent-card ${selectedAgent === agent.key ? "selected" : ""}`}
              onClick={() => openWorkflow(agent.key)}
            >
              <div className="top">
                <div>
                  <div className="name">{agent.name}</div>
                  <div className="role">{agent.role}</div>
                </div>
                <Badge type={agent.badge} />
              </div>

              <div className="ledger">
                <div className="l1">最近 Ledger 写入</div>
                {agent.ledger}
              </div>

              <div className="foot">
                <span>{agent.footLeft}</span>
                <span>{agent.footRight}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={`view workflow-view ${activeView === "workflow" ? "active" : ""}`}>
        <div className="wf-header">
          <button className="back-link" onClick={() => setActiveView("overview")}>
            ← 返回总览
          </button>
          <span className="wf-title">{selectedAgent ? (agentCards.find((agent) => agent.key === selectedAgent)?.name || "") + " · " + (agentCards.find((agent) => agent.key === selectedAgent)?.footRight || "") : ""}</span>
          <span className="wf-sub">dispatched {currentWorkflow.dispatchedAt}</span>
        </div>

        <div className="pipeline">
          {currentWorkflow.stages.map((stage, index) => (
            <div key={stage.label} className="pipeline-fragment">
              <div className={`pl-node ${stage.status}`}>
                <div className="pl-circle">
                  {stage.status === "done" ? "✓" : stage.status === "active" ? "●" : index + 1}
                </div>
                <div className="pl-label">{stage.label}</div>
                <div className="pl-sub">{stage.sublabel}</div>
              </div>
              {index < currentWorkflow.stages.length - 1 ? (
                <div className={`pl-line ${stage.status === "done" ? "done" : ""}`} />
              ) : null}
            </div>
          ))}
        </div>

        <div className="wf-cols">
          <div className="panel">
            <h4>状态机</h4>
            <div className="state-list">
              {currentWorkflow.stateList.map((item) => (
                <div key={item.label} className={`state-item ${item.status === "past" ? "past" : item.status === "current" ? "current" : ""}`}>
                  <span className="d" />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h4>故障隔离</h4>
            <div className="retry-row">
              <span className="retry-label">重试次数</span>
              <div className="retry-dots">
                {Array.from({ length: currentWorkflow.retryMax }).map((_, index) => (
                  <span key={index} className={index < currentWorkflow.retryUsed ? "used" : ""} />
                ))}
              </div>
              <span className="retry-meta">{currentWorkflow.retryUsed} / {currentWorkflow.retryMax}，固定上限</span>
            </div>
            <div className="fault-note">{currentWorkflow.retryNote}</div>
          </div>

          <div className="panel panel-full">
            <h4>结果聚合策略</h4>
            <div className="conflict-note">
              <span className="ic">⚠</span>
              <span>{currentWorkflow.conflictNote}</span>
            </div>
          </div>

          <div className="panel">
            <h4>当前摘要</h4>
            <div className="summary-note">{currentWorkflow.summary}</div>
          </div>

          <div className="panel">
            <h4>下一动作</h4>
            <div className="summary-note">{currentWorkflow.nextAction}</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(body) {
          margin: 0;
        }

        .proto-app {
          --bg-base: #eef3fb;
          --bg-surface: rgba(255, 255, 255, 0.92);
          --bg-sidebar: rgba(248, 250, 255, 0.9);
          --border: rgba(148, 163, 184, 0.22);
          --border-strong: rgba(100, 116, 139, 0.28);
          --text-primary: #0f172a;
          --text-secondary: #475569;
          --text-tertiary: #7b8798;
          --accent: #2563eb;
          --accent-soft: rgba(37, 99, 235, 0.1);
          --accent-soft-strong: rgba(37, 99, 235, 0.16);
          --warn: #f59e0b;
          --danger: #ef4444;
          --r-sm: 10px;
          --r-md: 14px;
          --r-lg: 18px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background:
            radial-gradient(circle at top left, rgba(37, 99, 235, 0.14), transparent 28%),
            linear-gradient(180deg, #f5f8ff 0%, #ebf1fa 100%);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
          font-size: 13px;
          line-height: 1.55;
          -webkit-font-smoothing: antialiased;
        }

        button {
          font: inherit;
        }

        .topbar {
          height: 56px;
          flex: 0 0 56px;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.82);
          backdrop-filter: blur(18px);
        }

        .brand {
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.02em;
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.14);
        }

        .tabs {
          display: flex;
          gap: 3px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.05);
        }

        .tab {
          padding: 6px 14px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .tab.active {
          background: rgba(255, 255, 255, 0.92);
          color: var(--text-primary);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
          font-weight: 700;
        }

        .top-stats {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 14px;
          color: var(--text-secondary);
          font-size: 12px;
        }

        .top-stats b {
          color: var(--text-primary);
        }

        .new-conv-btn {
          border: none;
          display: flex;
          align-items: center;
          gap: 5px;
          background: var(--accent);
          color: white;
          padding: 8px 13px;
          border-radius: 999px;
          font-size: 12.5px;
          font-weight: 700;
          box-shadow: 0 16px 24px rgba(37, 99, 235, 0.24);
          cursor: pointer;
        }

        .view {
          flex: 1;
          min-height: 0;
          display: none;
        }

        .view.active {
          display: flex;
        }

        .sidebar {
          width: 252px;
          flex: 0 0 252px;
          border-right: 1px solid var(--border);
          background: var(--bg-sidebar);
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(14px);
        }

        .mode-switch {
          display: flex;
          gap: 3px;
          background: rgba(15, 23, 42, 0.05);
          border-radius: 999px;
          padding: 4px;
          margin: 14px;
        }

        .mode-switch button {
          flex: 1;
          padding: 7px 0;
          border-radius: 999px;
          border: none;
          font-size: 12px;
          color: var(--text-secondary);
          background: transparent;
          cursor: pointer;
        }

        .mode-switch button.active {
          background: rgba(255, 255, 255, 0.96);
          color: var(--text-primary);
          font-weight: 700;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
        }

        .conv-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 10px 12px;
        }

        .conv-item {
          width: 100%;
          padding: 10px 11px;
          border-radius: 14px;
          margin-bottom: 4px;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s ease, box-shadow 0.15s ease;
        }

        .conv-item:hover {
          background: rgba(255, 255, 255, 0.76);
        }

        .conv-item.active {
          background: var(--accent-soft);
          box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
        }

        .t {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .meta {
          font-size: 11px;
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        .agent-flag {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          flex: 0 0 auto;
        }

        .detail-panel {
          padding: 16px;
        }

        .detail-panel h4,
        .panel h4 {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-tertiary);
          margin: 0 0 12px;
          font-weight: 700;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 7px 0;
          border-bottom: 1px solid var(--border);
          font-size: 12.5px;
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-row .v {
          color: var(--text-secondary);
        }

        .detail-files {
          margin-top: 14px;
        }

        .detail-files .f {
          font-size: 12px;
          color: var(--text-secondary);
          padding: 4px 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }

        .chat-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .chat-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 24px 0;
        }

        .msg-row {
          max-width: 720px;
          margin: 0 auto 18px;
          padding: 0 24px;
        }

        .msg-user {
          display: flex;
          justify-content: flex-end;
        }

        .msg-user .bubble {
          background: var(--accent-soft);
          color: var(--text-primary);
          padding: 11px 14px;
          border-radius: 16px;
          max-width: 78%;
          font-size: 13px;
          box-shadow: 0 16px 28px rgba(37, 99, 235, 0.08);
        }

        .msg-assistant .bubble {
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid var(--border);
          padding: 6px 14px 14px;
          border-radius: 18px;
          font-size: 13px;
          box-shadow: 0 26px 48px rgba(15, 23, 42, 0.08);
        }

        .tline {
          margin: 8px 0 4px;
        }

        .tline-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          padding: 6px 0;
          color: var(--text-tertiary);
          font-size: 12px;
          border: none;
          background: none;
          text-align: left;
        }

        .tline-row .glyph {
          font-size: 12px;
          color: var(--text-tertiary);
          width: 14px;
          text-align: center;
        }

        .tline-row .label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tline-row .chev {
          font-size: 10px;
          transition: transform 0.15s ease;
          color: var(--text-tertiary);
        }

        .tline-row.expanded .chev {
          transform: rotate(90deg);
        }

        .tline-steps {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.18s ease;
        }

        .tline-steps.open {
          max-height: 180px;
          overflow-y: auto;
          border-top: 1px solid var(--border);
          margin-top: 2px;
        }

        .tline-step {
          display: flex;
          gap: 7px;
          padding: 6px 2px;
          font-size: 11.5px;
          color: var(--text-secondary);
        }

        .tline-step .glyph {
          width: 14px;
          text-align: center;
          color: var(--text-tertiary);
          flex: 0 0 auto;
        }

        .tline-step.tool .label {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
        }

        .answer-text {
          padding-top: 6px;
          font-size: 13px;
          color: var(--text-primary);
        }

        .answer-text p {
          margin: 0 0 8px;
        }

        .answer-text p:last-child {
          margin-bottom: 0;
        }

        .proto-demo {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 auto;
          max-width: 720px;
          padding: 8px 24px;
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .proto-demo button {
          border: 1px solid var(--border-strong);
          padding: 5px 10px;
          border-radius: 999px;
          color: var(--text-secondary);
          font-size: 11px;
          background: rgba(255, 255, 255, 0.85);
          cursor: pointer;
        }

        .state-name {
          color: var(--accent);
          font-weight: 700;
          text-transform: lowercase;
        }

        .input-bar {
          border-top: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.86);
          padding: 14px 24px 16px;
        }

        .input-shell {
          max-width: 720px;
          margin: 0 auto;
          border: 1px solid var(--border-strong);
          border-radius: 18px;
          padding: 11px 12px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 18px 28px rgba(15, 23, 42, 0.06);
        }

        .input-shell textarea {
          width: 100%;
          border: none;
          resize: none;
          font: inherit;
          color: var(--text-primary);
          outline: none;
          height: 38px;
          background: transparent;
        }

        .input-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }

        .chip {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11.5px;
          color: var(--text-secondary);
          background: rgba(15, 23, 42, 0.05);
          padding: 6px 10px;
          border-radius: 999px;
        }

        .chip.on {
          background: var(--accent-soft);
          color: var(--accent);
        }

        .send-btn {
          margin-left: auto;
          border: none;
          background: var(--accent);
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }

        .overview-view,
        .workflow-view {
          flex-direction: column;
          padding: 22px 28px;
          overflow-y: auto;
        }

        .status-bar {
          display: flex;
          align-items: center;
          gap: 0;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 12px 16px;
          margin-bottom: 18px;
          font-size: 12.5px;
          max-width: 960px;
          box-shadow: 0 18px 32px rgba(15, 23, 42, 0.08);
        }

        .status-group {
          display: flex;
          align-items: center;
        }

        .status-seg {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-secondary);
          padding-right: 18px;
        }

        .status-seg .num {
          font-weight: 700;
          font-size: 14px;
          color: var(--text-primary);
        }

        .status-seg.run .num {
          color: var(--accent);
        }

        .status-seg.fail .num {
          color: var(--danger);
        }

        .sep {
          width: 1px;
          height: 16px;
          background: var(--border);
          margin-right: 18px;
        }

        .hint {
          margin-left: auto;
          color: var(--text-tertiary);
          font-size: 11.5px;
        }

        .agent-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 14px;
          max-width: 960px;
        }

        .agent-card {
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 14px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.92);
          transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
          box-shadow: 0 18px 34px rgba(15, 23, 42, 0.08);
        }

        .agent-card:hover {
          border-color: var(--border-strong);
          box-shadow: 0 24px 38px rgba(15, 23, 42, 0.1);
          transform: translateY(-1px);
        }

        .agent-card.selected {
          border-color: rgba(37, 99, 235, 0.38);
          box-shadow: 0 24px 38px rgba(37, 99, 235, 0.14);
        }

        .top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .name {
          font-weight: 700;
          font-size: 13px;
        }

        .role {
          font-size: 11.5px;
          color: var(--text-tertiary);
          margin-top: 1px;
        }

        .badge {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          padding: 4px 9px;
          border-radius: 999px;
          font-weight: 700;
          flex: 0 0 auto;
        }

        .badge .d {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .badge-running {
          background: var(--accent-soft);
          color: var(--accent);
        }

        .badge-running .d {
          background: var(--accent);
        }

        .badge-done {
          background: rgba(15, 23, 42, 0.06);
          color: var(--text-secondary);
        }

        .badge-done .d {
          background: var(--text-tertiary);
        }

        .badge-escalated {
          background: rgba(239, 68, 68, 0.1);
          color: var(--danger);
        }

        .badge-escalated .d {
          background: var(--danger);
        }

        .ledger {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
          font-size: 11.5px;
          color: var(--text-secondary);
          text-align: left;
        }

        .ledger .l1 {
          color: var(--text-tertiary);
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 3px;
        }

        .foot {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .wf-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }

        .back-link {
          border: none;
          background: none;
          font-size: 12px;
          color: var(--accent);
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 0;
        }

        .wf-title {
          font-size: 15px;
          font-weight: 700;
        }

        .wf-sub {
          font-size: 11.5px;
          color: var(--text-tertiary);
          margin-left: auto;
        }

        .pipeline {
          display: flex;
          align-items: flex-start;
          gap: 0;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 22px 18px;
          margin-bottom: 18px;
          max-width: 1020px;
          overflow-x: auto;
          box-shadow: 0 18px 32px rgba(15, 23, 42, 0.08);
        }

        .pipeline-fragment {
          display: contents;
        }

        .pl-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 150px;
          flex: 0 0 auto;
          text-align: center;
        }

        .pl-circle {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          border: 2px solid var(--border-strong);
          color: var(--text-tertiary);
          background: rgba(255, 255, 255, 0.96);
        }

        .pl-node.done .pl-circle {
          border-color: var(--text-tertiary);
          color: var(--text-secondary);
        }

        .pl-node.active .pl-circle {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-soft);
        }

        .pl-label {
          font-size: 11.5px;
          margin-top: 8px;
          color: var(--text-primary);
          font-weight: 700;
        }

        .pl-sub {
          font-size: 10.5px;
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        .pl-line {
          flex: 1;
          height: 2px;
          background: var(--border-strong);
          margin-top: 17px;
          min-width: 24px;
        }

        .pl-line.done {
          background: var(--text-tertiary);
        }

        .wf-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          max-width: 1020px;
        }

        .panel {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 18px 32px rgba(15, 23, 42, 0.08);
        }

        .panel-full {
          grid-column: 1 / -1;
        }

        .state-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .state-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          padding: 6px 8px;
          border-radius: 10px;
          color: var(--text-tertiary);
        }

        .state-item .d {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--border-strong);
          flex: 0 0 auto;
        }

        .state-item.current {
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 700;
        }

        .state-item.current .d {
          background: var(--accent);
        }

        .state-item.past {
          color: var(--text-secondary);
        }

        .state-item.past .d {
          background: var(--text-tertiary);
        }

        .retry-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .retry-label {
          color: var(--text-secondary);
          font-size: 12px;
        }

        .retry-dots {
          display: flex;
          gap: 5px;
        }

        .retry-dots span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--border-strong);
        }

        .retry-dots span.used {
          background: var(--warn);
        }

        .retry-meta {
          color: var(--text-tertiary);
          font-size: 11px;
        }

        .fault-note {
          font-size: 11.5px;
          color: var(--text-secondary);
          background: rgba(15, 23, 42, 0.04);
          padding: 9px 10px;
          border-radius: 10px;
          margin-top: 6px;
        }

        .summary-note {
          font-size: 12px;
          line-height: 1.65;
          color: var(--text-secondary);
          background: rgba(15, 23, 42, 0.04);
          padding: 10px 12px;
          border-radius: 10px;
        }

        .conflict-note {
          font-size: 11.5px;
          color: var(--text-secondary);
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.24);
          padding: 10px 12px;
          border-radius: 12px;
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }

        .ic {
          color: var(--warn);
          flex: 0 0 auto;
        }

        @media (max-width: 980px) {
          .topbar {
            flex-wrap: wrap;
            height: auto;
            padding: 12px 16px;
          }

          .view.active {
            flex-direction: column;
          }

          .sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid var(--border);
          }

          .wf-cols {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
