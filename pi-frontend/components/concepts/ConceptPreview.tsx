"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ConceptId = "codex" | "paper" | "signal";
type ScenarioId = "landing" | "session" | "workflow";
type AgentState = "idle" | "routing" | "running" | "review";

type NavItem = {
  label: string;
  hint: string;
};

type SidebarSection = {
  title: string;
  items: string[];
};

type MessageItem = {
  role: "user" | "assistant" | "system";
  text: string;
};

type TaskItem = {
  title: string;
  owner: string;
  state: string;
};

type WorkflowItem = {
  name: string;
  summary: string;
};

type ScenarioData = {
  label: string;
  eyebrow: string;
  description: string;
  inputPlaceholder: string;
  statusLine: string;
  messages: MessageItem[];
  tasks: TaskItem[];
};

type ConceptPreviewProps = {
  id: ConceptId;
  title: string;
  subtitle: string;
  description: string;
  mood: string;
  accent: string;
  nav: NavItem[];
  sidebar: SidebarSection[];
  workflows: WorkflowItem[];
  scenarios: Record<ScenarioId, ScenarioData>;
};

const scenarioOrder: ScenarioId[] = ["landing", "session", "workflow"];
const agentStateOrder: AgentState[] = ["idle", "routing", "running", "review"];

function prettyAgentState(state: AgentState): string {
  switch (state) {
    case "idle":
      return "Ready";
    case "routing":
      return "Routing";
    case "running":
      return "Running";
    case "review":
      return "Review";
  }
}

function MessageBubble({
  message,
  accent,
}: {
  message: MessageItem;
  accent: string;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: isSystem ? "100%" : "86%",
        borderRadius: isSystem ? 16 : 22,
        padding: isSystem ? "10px 12px" : "14px 16px",
        background: isUser ? accent : isSystem ? "rgba(15,23,42,0.05)" : "rgba(255,255,255,0.92)",
        color: isUser ? "#f8fafc" : "#0f172a",
        border: isSystem ? "1px dashed rgba(15,23,42,0.16)" : "1px solid rgba(15,23,42,0.07)",
        boxShadow: isSystem ? "none" : "0 18px 32px rgba(15,23,42,0.08)",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {message.text}
    </div>
  );
}

function ScenarioTabs({
  current,
  onChange,
  accent,
  scenarios,
}: {
  current: ScenarioId;
  onChange: (next: ScenarioId) => void;
  accent: string;
  scenarios: Record<ScenarioId, ScenarioData>;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {scenarioOrder.map((key) => {
        const active = current === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: 999,
              padding: "8px 12px",
              background: active ? accent : "rgba(15,23,42,0.06)",
              color: active ? "#f8fafc" : "#334155",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {scenarios[key].label}
          </button>
        );
      })}
    </div>
  );
}

function AgentStateTabs({
  current,
  onChange,
  accent,
}: {
  current: AgentState;
  onChange: (next: AgentState) => void;
  accent: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {agentStateOrder.map((state) => {
        const active = current === state;
        return (
          <button
            key={state}
            onClick={() => onChange(state)}
            style={{
              border: active ? `1px solid ${accent}` : "1px solid rgba(15,23,42,0.08)",
              cursor: "pointer",
              borderRadius: 999,
              padding: "7px 11px",
              background: active ? `${accent}14` : "rgba(255,255,255,0.66)",
              color: "#0f172a",
              fontSize: 12,
              fontWeight: active ? 800 : 700,
            }}
          >
            {prettyAgentState(state)}
          </button>
        );
      })}
    </div>
  );
}

export function ConceptPreview(props: ConceptPreviewProps) {
  const [scenario, setScenario] = useState<ScenarioId>("landing");
  const [agentState, setAgentState] = useState<AgentState>("routing");
  const [selectedNav, setSelectedNav] = useState(0);
  const [selectedWorkflow, setSelectedWorkflow] = useState(0);

  const scenarioData = props.scenarios[scenario];

  const activeTasks = useMemo(() => {
    return scenarioData.tasks.map((task, index) => {
      let state = task.state;
      if (agentState === "idle") state = index === 0 ? "waiting" : "standby";
      if (agentState === "routing") state = index === 0 ? "dispatching" : "queued";
      if (agentState === "running") state = index === 0 ? "working" : index === 1 ? "syncing" : "reviewing";
      if (agentState === "review") state = index === 0 ? "ready" : index === 1 ? "merged" : "approval";
      return { ...task, state };
    });
  }, [agentState, scenarioData.tasks]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: props.mood,
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: 1540, margin: "0 auto", padding: "26px 22px 32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/concepts"
              style={{
                textDecoration: "none",
                color: "#0f172a",
                background: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(15,23,42,0.08)",
                borderRadius: 999,
                padding: "10px 14px",
                fontWeight: 700,
              }}
            >
              Back
            </Link>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.52)",
                border: "1px solid rgba(15,23,42,0.06)",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#475569",
              }}
            >
              {props.subtitle}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <ScenarioTabs current={scenario} onChange={setScenario} accent={props.accent} scenarios={props.scenarios} />
            <AgentStateTabs current={agentState} onChange={setAgentState} accent={props.accent} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px minmax(0, 1fr) 340px",
            gap: 18,
            alignItems: "stretch",
          }}
        >
          <aside
            style={{
              borderRadius: 28,
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 24px 48px rgba(15,23,42,0.09)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b", fontWeight: 800 }}>
                Pi Agent Web
              </div>
              <div style={{ marginTop: 10, fontSize: 30, lineHeight: 0.96, letterSpacing: "-0.05em", fontWeight: 820 }}>
                {props.title}
              </div>
              <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.65, color: "#475569" }}>
                {props.description}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {props.nav.map((item, index) => {
                const active = index === selectedNav;
                return (
                  <button
                    key={item.label}
                    onClick={() => setSelectedNav(index)}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 18,
                      background: active ? `${props.accent}16` : "rgba(15,23,42,0.04)",
                      color: "#0f172a",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 760 }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{item.hint}</div>
                  </button>
                );
              })}
            </div>

            {props.sidebar.map((section) => (
              <div key={section.title}>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b", fontWeight: 800 }}>
                  {section.title}
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {section.items.map((item, index) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 14,
                        background: index === 0 ? "rgba(15,23,42,0.05)" : "rgba(255,255,255,0.7)",
                        border: "1px solid rgba(15,23,42,0.06)",
                        fontSize: 13,
                        color: "#334155",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: index === 0 ? props.accent : "rgba(100,116,139,0.45)",
                          boxShadow: index === 0 ? `0 0 0 5px ${props.accent}22` : "none",
                          flexShrink: 0,
                        }}
                      />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <main
            style={{
              borderRadius: 28,
              background: "rgba(255,255,255,0.64)",
              border: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 28px 56px rgba(15,23,42,0.09)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 760,
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid rgba(15,23,42,0.08)",
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b", fontWeight: 800 }}>
                  {scenarioData.eyebrow}
                </div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 780 }}>{scenarioData.description}</div>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 18,
                  background: "rgba(15,23,42,0.05)",
                  fontSize: 13,
                  color: "#475569",
                  maxWidth: 320,
                  lineHeight: 1.5,
                }}
              >
                {scenarioData.statusLine}
              </div>
            </div>

            <div style={{ flex: 1, display: "grid", gridTemplateRows: "1fr auto" }}>
              <div style={{ padding: 20, overflow: "auto", display: "grid", gap: 14 }}>
                {scenarioData.messages.map((message) => (
                  <MessageBubble key={`${message.role}-${message.text}`} message={message} accent={props.accent} />
                ))}
                {agentState !== "idle" && (
                  <div
                    style={{
                      alignSelf: "flex-start",
                      padding: "12px 14px",
                      borderRadius: 16,
                      background: "rgba(15,23,42,0.05)",
                      border: "1px dashed rgba(15,23,42,0.15)",
                      color: "#475569",
                      fontSize: 13,
                    }}
                  >
                    {agentState === "routing" && "Lead agent is splitting the task and preparing worker prompts."}
                    {agentState === "running" && "Sub-agents are active. Progress stays in the collaboration rail while the chat waits for the merged answer."}
                    {agentState === "review" && "Workers are complete. The supervisor is resolving conflicts and preparing the final write-back."}
                  </div>
                )}
              </div>

              <div style={{ padding: 18, borderTop: "1px solid rgba(15,23,42,0.08)", background: "rgba(248,250,252,0.82)" }}>
                <div
                  style={{
                    minHeight: 54,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.88)",
                    border: "1px solid rgba(15,23,42,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 14px",
                  }}
                >
                  <span style={{ color: "#64748b", fontSize: 14 }}>{scenarioData.inputPlaceholder}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={{
                        border: "none",
                        borderRadius: 14,
                        background: "rgba(15,23,42,0.08)",
                        padding: "10px 12px",
                        fontWeight: 700,
                        color: "#334155",
                      }}
                    >
                      Attach
                    </button>
                    <button
                      style={{
                        border: "none",
                        borderRadius: 14,
                        background: props.accent,
                        padding: "10px 14px",
                        color: "#f8fafc",
                        fontWeight: 800,
                      }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <aside
            style={{
              borderRadius: 28,
              background: "rgba(13,23,42,0.90)",
              color: "#e2e8f0",
              boxShadow: "0 28px 56px rgba(15,23,42,0.22)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minHeight: 760,
            }}
          >
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#94a3b8", fontWeight: 800 }}>
                Collaboration Rail
              </div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 780 }}>Multi-Agent Status</div>
            </div>

            <div
              style={{
                padding: "14px 16px",
                borderRadius: 18,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(148,163,184,0.12)",
              }}
            >
              <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Current phase
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: props.accent,
                    boxShadow: `0 0 0 6px ${props.accent}22`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 18, fontWeight: 760 }}>{prettyAgentState(agentState)}</span>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {activeTasks.map((task) => (
                <div
                  key={task.title}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(148,163,184,0.12)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 760 }}>{task.title}</div>
                    <div
                      style={{
                        padding: "5px 9px",
                        borderRadius: 999,
                        background: `${props.accent}22`,
                        color: "#f8fafc",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {task.state}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>{task.owner}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#94a3b8", fontWeight: 800 }}>
                Workflows
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {props.workflows.map((workflow, index) => {
                  const active = index === selectedWorkflow;
                  return (
                    <button
                      key={workflow.name}
                      onClick={() => setSelectedWorkflow(index)}
                      style={{
                        border: active ? `1px solid ${props.accent}` : "1px solid rgba(148,163,184,0.12)",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: 18,
                        background: active ? `${props.accent}14` : "rgba(255,255,255,0.05)",
                        color: "#e2e8f0",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 760 }}>{workflow.name}</div>
                      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.55, color: "#94a3b8" }}>{workflow.summary}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Link
              href="/"
              style={{
                marginTop: "auto",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 14px",
                borderRadius: 16,
                background: props.accent,
                color: "#f8fafc",
                fontWeight: 800,
              }}
            >
              Open Product
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
