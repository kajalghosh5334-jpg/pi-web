import Link from "next/link";

const concepts = [
  {
    id: "codex",
    title: "Codex Console",
    subtitle: "operator-first",
    description: "高密度操作台，强调当前项目、当前会话和当前协作状态，适合重度编码与调试。",
    accent: "#2563eb",
    mood: "linear-gradient(180deg, #f4f7fb 0%, #eaf0f8 100%)",
  },
  {
    id: "paper",
    title: "Paper Studio",
    subtitle: "editorial flow",
    description: "把多 agent 产品做成项目工作台，强调阶段感、文稿感和产物归档，更像创作室。",
    accent: "#a15c38",
    mood: "linear-gradient(180deg, #f7f0e5 0%, #efe4d2 100%)",
  },
  {
    id: "signal",
    title: "Signal Ops",
    subtitle: "live collaboration",
    description: "强化多 agent 实时协作和监控，让任务分发、阻塞与产物流动一眼可见。",
    accent: "#0f766e",
    mood: "linear-gradient(180deg, #edf6f5 0%, #dcebea 100%)",
  },
];

export default function ConceptsIndexPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f7fafc 0%, #edf2f7 100%)",
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "42px 28px 72px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 840 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: "#64748b", fontWeight: 700 }}>
              Pi Agent Web Concepts
            </div>
            <h1 style={{ margin: "16px 0 0", fontSize: 62, lineHeight: 0.98, letterSpacing: "-0.06em" }}>
              Three complete product directions, not just theme colors.
            </h1>
            <p style={{ margin: "20px 0 0", fontSize: 18, lineHeight: 1.75, color: "#334155" }}>
              这三个方案都覆盖同一套主流程：项目入口、历史会话、主对话、多 agent 编排、工作流和监控区。
              区别不只是颜色，而是信息架构、版面密度、状态可见性和用户读图方式。
            </p>
          </div>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 16px",
              borderRadius: 999,
              background: "#0f172a",
              color: "#f8fafc",
              textDecoration: "none",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Back To Product
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20, marginTop: 34 }}>
          {concepts.map((concept) => (
            <Link
              key={concept.id}
              href={`/concepts/${concept.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                padding: 24,
                borderRadius: 32,
                background: concept.mood,
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 28px 52px rgba(15,23,42,0.10)",
                minHeight: 420,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.56)",
                    color: "#334155",
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {concept.subtitle}
                </div>
                <div style={{ marginTop: 18, fontSize: 36, lineHeight: 1, letterSpacing: "-0.05em", fontWeight: 800 }}>
                  {concept.title}
                </div>
                <div style={{ marginTop: 16, fontSize: 16, lineHeight: 1.75, color: "#334155" }}>{concept.description}</div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {[
                  "入口页先说明项目上下文",
                  "聊天与协作过程分层展示",
                  "多 agent 状态固定占位可见",
                ].map((line, index) => (
                  <div
                    key={line}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 14px",
                      borderRadius: 16,
                      background: index === 0 ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.52)",
                      border: "1px solid rgba(15,23,42,0.06)",
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: concept.accent,
                        boxShadow: `0 0 0 5px ${concept.accent}22`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 14, color: "#1e293b" }}>{line}</span>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
