"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkflowDefinition, WorkflowInputContract, WorkflowInputFieldDefinition, WorkflowTaskDefinition } from "@/lib/types";
import { formatWorkflowInput, initialInputValues, inputContractForWorkflow } from "@/lib/workflowInputContracts";

type ProfileDropPayload = {
  id: string;
  name?: string;
  skills?: string[];
};

type SkillItem = {
  id: string;
  description?: string;
};

type NodePoint = {
  x: number;
  y: number;
};

type RunNotice =
  | { status: "running"; input: string; startedAt: number }
  | { status: "success"; input: string; sessionId: string; cwd: string; startedAt: number }
  | { status: "error"; input: string; message: string; startedAt: number };

const NODE_WIDTH = 190;
const NODE_HEIGHT = 84;
const START_NODE = { x: 34, y: 56, width: 110, height: 56 };

const WORKFLOW_DOMAIN_LABELS: Record<string, string> = {
  "self-media": "自媒体",
  research: "行业调研",
  ecommerce: "电商",
  "customer-support": "客服",
  sales: "电话销售",
  generic: "通用模板",
  internal: "内部旧项",
  evaluation: "评测旧项",
};

const WORKFLOW_DOMAIN_ORDER = ["self-media", "research", "ecommerce", "customer-support", "sales", "generic"];
const HIDDEN_WORKFLOW_DOMAINS = new Set(["custom", "internal", "evaluation", "legacy", "uncategorized"]);
const WORKFLOW_TEMPLATE_LABELS: Record<string, string> = {
  "fetch-summarize": "抓取-摘要",
  "generate-variants": "生成-多版本",
  "classify-route": "分类-路由",
  "monitor-alert": "监控-告警",
  "extract-writeback": "结构化回写",
  "smoke-test": "烟测旧项",
  "manual-check": "手动检查",
  "eval-run": "评测运行",
};
const WORKFLOW_TEMPLATE_OPTIONS = [
  { id: "", label: "Blank workflow" },
  { id: "fetch-summarize", label: "通用-资料搜集与摘要" },
  { id: "classify-route", label: "通用-分类路由处理" },
  { id: "extract-writeback", label: "通用-结构化提取回写" },
  { id: "generate-variants", label: "通用-批量变体生成" },
  { id: "monitor-alert", label: "通用-监控告警分级" },
];

function workflowDomainLabel(domain: string | undefined): string {
  if (!domain || domain === "custom" || domain === "uncategorized") return "未分类";
  return WORKFLOW_DOMAIN_LABELS[domain] || domain;
}

function workflowTemplateLabel(templateType: string | undefined): string {
  return templateType ? WORKFLOW_TEMPLATE_LABELS[templateType] || templateType : "Workflow";
}

function slugDomain(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "custom";
  return trimmed
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "custom";
}

type AdaptiveInputLayout = {
  contract: WorkflowInputContract;
  primaryFields: WorkflowInputFieldDefinition[];
  contextFields: WorkflowInputFieldDefinition[];
  advancedFields: WorkflowInputFieldDefinition[];
  columns: string;
};

const SOURCE_FIELD_IDS = new Set(["source_materials", "links"]);
const TIME_FIELD_IDS = new Set(["time_window"]);
const FORMAT_FIELD_IDS = new Set(["output_format"]);

function workflowText(workflow: Partial<WorkflowDefinition>, tasks: WorkflowTaskDefinition[]) {
  return [
    workflow.name,
    workflow.description,
    workflow.templateType,
    ...tasks.flatMap((task) => [task.name, task.profileId, task.prompt]),
  ].filter(Boolean).join("\n").toLowerCase();
}

function hasUpstreamMaterialNode(tasks: WorkflowTaskDefinition[]) {
  return tasks.some((task) => {
    const text = [task.name, task.profileId, task.prompt].filter(Boolean).join(" ").toLowerCase();
    return /weak-research-extractor|content-researcher|gather|fetch|research|资料|素材|来源|搜索|抓取|监控/.test(text);
  });
}

function adaptiveInputLayout(contract: WorkflowInputContract, workflow: Partial<WorkflowDefinition>, tasks: WorkflowTaskDefinition[]): AdaptiveInputLayout {
  const fields = contract.fields || [];
  const byId = new Map(fields.map((field) => [field.id, field]));
  const text = workflowText(workflow, tasks);
  const hasMaterialNode = hasUpstreamMaterialNode(tasks);
  const isBatch = workflow.templateType === "generate-variants" || /批量|变体|多版本|a\/b|ab|多平台|排期/.test(text);
  const isSummary = workflow.templateType === "fetch-summarize" || /摘要|提要|简报|复盘|报告|总结/.test(text);
  const isTimed = workflow.templateType === "monitor-alert" || /时间窗口|过去|近\s*\d+|监控|告警|每日|每周|2025h1|2026/.test(text);

  const primaryIds = new Set<string>(["task_goal"]);
  const contextIds = new Set<string>();

  if (workflow.templateType === "classify-route") {
    ["items_to_classify", "label_schema"].forEach((id) => primaryIds.add(id));
    ["risk_rules", "draft_policy"].forEach((id) => contextIds.add(id));
  } else if (workflow.templateType === "extract-writeback") {
    ["raw_materials", "target_schema"].forEach((id) => primaryIds.add(id));
    ["writeback_rules"].forEach((id) => contextIds.add(id));
  } else if (workflow.templateType === "generate-variants") {
    ["source_materials", "variant_requirements"].forEach((id) => primaryIds.add(id));
    ["brand_or_risk_rules"].forEach((id) => contextIds.add(id));
    if (isBatch) FORMAT_FIELD_IDS.forEach((id) => contextIds.add(id));
  } else if (workflow.templateType === "monitor-alert") {
    ["monitor_targets", "alert_thresholds"].forEach((id) => primaryIds.add(id));
    if (isTimed) TIME_FIELD_IDS.forEach((id) => contextIds.add(id));
    if (!hasMaterialNode) SOURCE_FIELD_IDS.forEach((id) => contextIds.add(id));
  } else {
    if (!hasMaterialNode) SOURCE_FIELD_IDS.forEach((id) => primaryIds.add(id));
    if (!hasMaterialNode && isTimed) TIME_FIELD_IDS.forEach((id) => contextIds.add(id));
    if (!hasMaterialNode && (isBatch || isSummary)) FORMAT_FIELD_IDS.forEach((id) => contextIds.add(id));
  }

  if (!hasMaterialNode && workflow.templateType === "fetch-summarize") SOURCE_FIELD_IDS.forEach((id) => primaryIds.add(id));
  if (hasMaterialNode) SOURCE_FIELD_IDS.forEach((id) => contextIds.delete(id));
  if (!isTimed || (hasMaterialNode && workflow.templateType !== "monitor-alert")) TIME_FIELD_IDS.forEach((id) => contextIds.delete(id));
  if ((!isBatch && !isSummary) || (hasMaterialNode && workflow.templateType !== "generate-variants")) FORMAT_FIELD_IDS.forEach((id) => contextIds.delete(id));

  const primaryFields = [...primaryIds].map((id) => byId.get(id)).filter(Boolean) as WorkflowInputFieldDefinition[];
  const contextFields = [...contextIds].filter((id) => !primaryIds.has(id)).map((id) => byId.get(id)).filter(Boolean) as WorkflowInputFieldDefinition[];
  const usedIds = new Set([...primaryFields, ...contextFields].map((field) => field.id));
  const advancedFields = fields.filter((field) => !usedIds.has(field.id) && !SOURCE_FIELD_IDS.has(field.id) && !TIME_FIELD_IDS.has(field.id) && !FORMAT_FIELD_IDS.has(field.id));
  const visibleFields = [...primaryFields, ...contextFields, ...advancedFields];

  return {
    contract: { ...contract, fields: visibleFields },
    primaryFields,
    contextFields,
    advancedFields,
    columns: primaryFields.length <= 2 ? "minmax(260px, 1.2fr) minmax(220px, 0.8fr)" : "repeat(auto-fit, minmax(220px, 1fr))",
  };
}

export function WorkflowEditor({
  workflow,
  onBack,
  onChange,
  onRan,
}: {
  workflow: WorkflowDefinition;
  onBack?: () => void;
  onChange?: (workflow: WorkflowDefinition) => void;
  onDeleted?: (workflowId: string) => void;
  onRan?: (sessionId: string, cwd: string) => void;
}) {
  const [draft, setDraft] = useState<WorkflowDefinition>(workflow);
  const [runInput, setRunInput] = useState("");
  const [runInputValues, setRunInputValues] = useState<Record<string, string>>(() => initialInputValues(inputContractForWorkflow(workflow), workflow));
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [runNotice, setRunNotice] = useState<RunNotice | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(workflow.tasks?.[0]?.id || null);
  const [dragActive, setDragActive] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [profiles, setProfiles] = useState<Array<{ id: string; name?: string }>>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [skillsLoadedForCwd, setSkillsLoadedForCwd] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  useEffect(() => {
    const normalizedTasks = (workflow.tasks || []).map((task, index) => ({
      ...task,
      id: task.id || `task-${index + 1}`,
      deps: [...(task.deps || [])],
      layout: {
        x: task.layout?.x ?? 180 + (index % 3) * 230,
        y: task.layout?.y ?? 58 + Math.floor(index / 3) * 132,
      },
    }));
    setDraft({ ...workflow, tasks: normalizedTasks });
    const nextContract = inputContractForWorkflow(workflow);
    setRunInputValues(initialInputValues(nextContract, workflow));
    setRunInput("");
    setRunNotice(null);
    setSelectedTaskId(normalizedTasks[0]?.id || null);
    setInspectorOpen(false);
    setSaveDialogOpen(false);
  }, [workflow]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch("/api/agent-profiles", { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setProfiles(Array.isArray(data?.profiles) ? data.profiles : []))
      .catch(() => setProfiles([]))
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const tasks = useMemo(() => draft.tasks || [], [draft.tasks]);
  const inputContract = useMemo(() => inputContractForWorkflow(draft), [draft]);
  const inputLayout = useMemo(() => adaptiveInputLayout(inputContract, draft, tasks), [draft, inputContract, tasks]);
  const runInputContract = inputLayout.contract;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const profileNames = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile.name || profile.id])), [profiles]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id || "", task])), [tasks]);
  const hasRunnableChain = useMemo(() => {
    if (tasks.length < 2) return false;
    return tasks.some((task) => (task.deps || []).some((dep) => dep && taskById.has(dep)));
  }, [taskById, tasks]);
  const missingRequiredInput = useMemo(() => (runInputContract.fields || []).filter((field) => field.required && !runInputValues[field.id]?.trim()), [runInputContract.fields, runInputValues]);
  const canRun = hasRunnableChain && missingRequiredInput.length === 0;
  const categoryOptions = useMemo(() => {
    const domains = new Set(WORKFLOW_DOMAIN_ORDER);
    if (draft.domain && !HIDDEN_WORKFLOW_DOMAINS.has(draft.domain)) domains.add(draft.domain);
    return [...domains].sort((a, b) => {
      const ia = WORKFLOW_DOMAIN_ORDER.indexOf(a);
      const ib = WORKFLOW_DOMAIN_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return workflowDomainLabel(a).localeCompare(workflowDomainLabel(b));
    });
  }, [draft.domain]);

  useEffect(() => {
    if (!inspectorOpen || !selectedTask) return;
    const cwdKey = draft.cwd || "";
    if (skillsLoadedForCwd === cwdKey) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const cwd = encodeURIComponent(cwdKey);
    fetch(`/api/skills?cwd=${cwd}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const nextSkills = Array.isArray(data?.skills)
          ? data.skills
              .map((skill: { name?: string; id?: string; description?: string }) => ({
                id: skill.name || skill.id || "",
                description: skill.description,
              }))
              .filter((skill: SkillItem) => skill.id)
          : [];
        setSkills(nextSkills);
        setSkillsLoadedForCwd(cwdKey);
      })
      .catch(() => setSkills([]))
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [draft.cwd, inspectorOpen, selectedTask, skillsLoadedForCwd]);

  const updateDraft = useCallback((patch: Partial<WorkflowDefinition>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateTask = useCallback((taskId: string, patch: Partial<WorkflowTaskDefinition>) => {
    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks || []).map((task) => task.id === taskId ? { ...task, ...patch } : task),
    }));
  }, []);

  const updateRunInputValue = useCallback((fieldId: string, value: string) => {
    setRunInputValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const addProfileNode = useCallback((profile: ProfileDropPayload, x = 190, y = 64) => {
    setDraft((prev) => {
      const existing = prev.tasks || [];
      const nextNumber = existing.length + 1;
      const idBase = profile.id.replace(/[^a-zA-Z0-9_-]/g, "-") || "profile";
      let id = `${idBase}-${nextNumber}`;
      let counter = nextNumber;
      while (existing.some((task) => task.id === id)) {
        counter += 1;
        id = `${idBase}-${counter}`;
      }
      const previousId = existing[existing.length - 1]?.id;
      const task: WorkflowTaskDefinition = {
        id,
        name: profile.name || profile.id,
        profileId: profile.id,
        skills: profile.skills || [],
        deps: previousId ? [previousId] : [],
        prompt: "",
        budget: { maxRetries: 1, timeoutMs: 120000 },
        layout: { x, y },
      };
      setSelectedTaskId(id);
      setInspectorOpen(false);
      return { ...prev, tasks: [...existing, task] };
    });
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setDraft((prev) => {
      const nextTasks = (prev.tasks || [])
        .filter((task) => task.id !== taskId)
        .map((task) => ({ ...task, deps: (task.deps || []).filter((dep) => dep !== taskId) }));
      if (selectedTaskId === taskId) {
        setSelectedTaskId(nextTasks[0]?.id || null);
        setInspectorOpen(false);
      }
      return { ...prev, tasks: nextTasks };
    });
  }, [selectedTaskId]);

  const persistWorkflow = useCallback(async (nextDraft: WorkflowDefinition) => {
    setBusy("save");
    try {
      const isDraft = nextDraft.id.startsWith("draft-workflow-");
      const res = await fetch(isDraft ? "/api/workflows" : `/api/workflows/${encodeURIComponent(nextDraft.id)}`, {
        method: isDraft ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.workflow) {
        window.alert(data?.error || "Workflow 保存失败");
        return;
      }
      setDraft(data.workflow);
      setSaveDialogOpen(false);
      onChange?.(data.workflow);
    } finally {
      setBusy(null);
    }
  }, [onChange]);

  const save = useCallback(() => {
    setSaveDialogOpen(true);
  }, []);

  const saveWithMetadata = useCallback((metadata: Pick<WorkflowDefinition, "name" | "description" | "domain" | "category" | "templateType">) => {
    const nextDraft: WorkflowDefinition = {
      ...draft,
      ...metadata,
      status: "active",
      debugStatus: draft.debugStatus || "unverified",
      leadProfileId: draft.leadProfileId || "strong-task-architect",
      reviewPolicy: draft.reviewPolicy || "lead_plus_reviewer",
    };
    void persistWorkflow(nextDraft);
  }, [draft, persistWorkflow]);

  const run = useCallback(async () => {
    const input = formatWorkflowInput(runInputContract, runInputValues);
    if (!hasRunnableChain || missingRequiredInput.length > 0) return;
    const startedAt = Date.now();
    setRunNotice({ status: "running", input, startedAt });
    setBusy("run");
    try {
      const saveRes = await fetch(`/api/workflows/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok || !saveData?.workflow) {
        const message = saveData?.error || "Workflow 保存失败";
        setRunNotice({ status: "error", input, message, startedAt });
        window.alert(message);
        return;
      }
      onChange?.(saveData.workflow);
      const res = await fetch(`/api/workflows/${encodeURIComponent(draft.id)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          inputPayload: {
            contract: runInputContract,
            values: runInputValues,
            missingFields: (runInputContract.fields || []).filter((field) => !runInputValues[field.id]?.trim()).map((field) => field.id),
          },
          cwd: draft.cwd || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sessionId) {
        const message = data?.error || "Workflow 运行失败";
        setRunNotice({ status: "error", input, message, startedAt });
        window.alert(message);
        return;
      }
      setRunNotice({ status: "success", input, sessionId: data.sessionId, cwd: draft.cwd || "", startedAt });
    } finally {
      setBusy(null);
    }
  }, [draft, hasRunnableChain, missingRequiredInput, onChange, runInputContract, runInputValues]);

  const edges = useMemo(() => buildEdges(tasks), [tasks]);

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: 10 }}>
      <section
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const raw = event.dataTransfer.getData("application/pi-profile");
          if (!raw) return;
          try {
            const profile = JSON.parse(raw) as ProfileDropPayload;
            const rect = event.currentTarget.getBoundingClientRect();
            addProfileNode(profile, Math.max(172, event.clientX - rect.left - NODE_WIDTH / 2), Math.max(28, event.clientY - rect.top - NODE_HEIGHT / 2));
          } catch {
            // Invalid external drag data is ignored.
          }
        }}
        style={{
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
          borderRadius: 22,
          border: `1px solid ${dragActive ? "color-mix(in srgb, var(--accent) 46%, transparent)" : "color-mix(in srgb, var(--shell-edge) 86%, transparent)"}`,
          background: "linear-gradient(135deg, color-mix(in srgb, var(--bg) 94%, transparent), color-mix(in srgb, var(--bg-secondary) 82%, transparent))",
          boxShadow: "var(--shell-shadow-sm)",
        }}
      >
        <div style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(color-mix(in srgb, var(--text-dim) 18%, transparent) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: 0.45,
        }} />

        <WorkflowTitle workflow={draft} />
        <StartNode />
        <EdgesLayer tasks={tasks} edges={edges} />

        {tasks.length === 0 ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Drag profiles into the canvas</div>
              <div>第一个 Profile 会接在 Start 后面，后续 Profile 会自动串成链路。</div>
            </div>
          </div>
        ) : null}

        {tasks.map((task, index) => {
          const x = task.layout?.x ?? 180 + (index % 3) * 230;
          const y = task.layout?.y ?? 58 + Math.floor(index / 3) * 132;
          const selected = task.id === selectedTaskId;
          return (
            <button
              key={task.id || index}
              type="button"
              onClick={() => setSelectedTaskId(task.id || null)}
              onDoubleClick={() => {
                setSelectedTaskId(task.id || null);
                setInspectorOpen(true);
              }}
              style={{
                position: "absolute",
                left: x,
                top: y,
                zIndex: 3,
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
                textAlign: "left",
                borderRadius: 14,
                border: selected ? "1px solid color-mix(in srgb, var(--accent) 58%, transparent)" : "1px solid color-mix(in srgb, var(--shell-edge) 90%, transparent)",
                background: selected ? "color-mix(in srgb, var(--accent) 9%, var(--bg))" : "color-mix(in srgb, var(--bg) 94%, transparent)",
                color: "var(--text)",
                boxShadow: selected ? "0 16px 36px rgba(15,23,42,0.14)" : "var(--shell-shadow-sm)",
                padding: 12,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: selected ? "var(--accent)" : "var(--text-dim)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.name || task.id || `Task ${index + 1}`}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {profileNames.get(task.profileId || "") || task.profileId || "No profile"}
              </div>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-dim)" }}>
                <span className="codex-pill" style={{ fontSize: 10, minHeight: 22, padding: "0 8px" }}>{(task.deps || []).length || "Start"} deps</span>
                <span className="codex-pill" style={{ fontSize: 10, minHeight: 22, padding: "0 8px" }}>{(task.skills || []).length} skills</span>
              </div>
            </button>
          );
        })}
      </section>

      <section className="codex-card" style={{ borderRadius: 18, padding: "12px", display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 850, color: "var(--text)" }}>{runInputContract.title || "Workflow 输入资料包"}</div>
              {runInputContract.description ? (
                <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.6, color: "var(--text-muted)" }}>{runInputContract.description}</div>
              ) : null}
            </div>
            <button type="button" onClick={run} disabled={busy !== null || !canRun} style={{ ...buttonStyle("primary"), minHeight: 38 }}>
              {busy === "run" ? "Running..." : "Run workflow"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: inputLayout.columns, gap: 10, alignItems: "start" }}>
            {inputLayout.primaryFields.map((field) => (
              <WorkflowInputField
                key={field.id}
                field={field}
                value={runInputValues[field.id] || ""}
                onChange={(value) => updateRunInputValue(field.id, value)}
              />
            ))}
          </div>
          {inputLayout.contextFields.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {inputLayout.contextFields.map((field) => (
                <WorkflowInputField
                  key={field.id}
                  field={field}
                  compact
                  value={runInputValues[field.id] || ""}
                  onChange={(value) => updateRunInputValue(field.id, value)}
                />
              ))}
            </div>
          ) : null}
          {inputLayout.advancedFields.length ? (
            <details>
              <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 800, color: "var(--text-muted)", padding: "2px 0" }}>高级输入</summary>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                {inputLayout.advancedFields.map((field) => (
                  <WorkflowInputField
                    key={field.id}
                    field={field}
                    compact
                    value={runInputValues[field.id] || ""}
                    onChange={(value) => updateRunInputValue(field.id, value)}
                  />
                ))}
              </div>
            </details>
          ) : null}
          <Field label="补充说明（可选）">
            <textarea
              value={runInput}
              onChange={(event) => {
                setRunInput(event.target.value);
                updateRunInputValue("additional_notes", event.target.value);
              }}
              placeholder="临时补充约束、输出偏好、不要遗漏的背景。"
              style={{ ...inputStyle, minHeight: 54, resize: "vertical" }}
            />
          </Field>
          {missingRequiredInput.length ? (
            <div style={{ fontSize: 11, color: "#ef4444", lineHeight: 1.6 }}>
              还缺少必填资料：{missingRequiredInput.map((field) => field.label).join("、")}
            </div>
          ) : null}
        </div>
        {runNotice ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "9px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              background: runNotice.status === "error" ? "rgba(239,68,68,0.08)" : runNotice.status === "success" ? "rgba(34,197,94,0.08)" : "var(--bg-secondary)",
              color: "var(--text)",
              fontSize: 12,
            }}
          >
            <div style={{ minWidth: 0, lineHeight: 1.6 }}>
              <strong>{runNotice.status === "success" ? "Workflow run created" : runNotice.status === "error" ? "Workflow run failed" : "Workflow run starting"}</strong>
              <span style={{ color: "var(--text-muted)" }}> · {new Date(runNotice.startedAt).toLocaleTimeString()}</span>
              <div style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {runNotice.input}
              </div>
              {runNotice.status === "error" ? <div style={{ color: "#ef4444" }}>{runNotice.message}</div> : null}
              {runNotice.status === "success" ? <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{runNotice.sessionId}</div> : null}
            </div>
            {runNotice.status === "success" ? (
              <button type="button" onClick={() => onRan?.(runNotice.sessionId, runNotice.cwd)} style={buttonStyle()}>
                Open session
              </button>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text)" }}>{draft.name || "未命名 Workflow"}</strong>
            <span> · {workflowDomainLabel(draft.domain)} · {workflowTemplateLabel(draft.templateType)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {onBack ? (
              <button type="button" onClick={onBack} title="Back" aria-label="Back" style={backIconButtonStyle}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="10 3 5 8 10 13" />
                </svg>
              </button>
            ) : null}
            <button type="button" onClick={save} disabled={busy !== null} style={buttonStyle("primary")}>
              {busy === "save" ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </section>

      {inspectorOpen ? (
        <InspectorDrawer title={selectedTask?.name || selectedTask?.id || "Workflow Inspector"} onClose={() => setInspectorOpen(false)}>
          {selectedTask ? (
            <TaskInspector
              task={selectedTask}
              tasks={tasks}
              profiles={profiles}
              skills={skills}
              updateTask={updateTask}
              removeTask={removeTask}
            />
          ) : (
            <WorkflowInspector draft={draft} profiles={profiles} updateDraft={updateDraft} />
          )}
        </InspectorDrawer>
      ) : null}
      {saveDialogOpen ? (
        <SaveWorkflowDialog
          draft={draft}
          categoryOptions={categoryOptions}
          busy={busy === "save"}
          onClose={() => setSaveDialogOpen(false)}
          onSave={saveWithMetadata}
        />
      ) : null}
    </div>
  );
}

function buildEdges(tasks: WorkflowTaskDefinition[]) {
  const taskById = new Map(tasks.map((task, index) => [task.id || `task-${index + 1}`, task]));
  const edges: Array<{ from: "start" | string; to: string }> = [];
  tasks.forEach((task, index) => {
    const to = task.id || `task-${index + 1}`;
    const validDeps = (task.deps || []).filter((dep) => taskById.has(dep));
    if (validDeps.length === 0 && index === 0) edges.push({ from: "start", to });
    validDeps.forEach((dep) => edges.push({ from: dep, to }));
  });
  return edges;
}

function getTaskPoint(task: WorkflowTaskDefinition, index: number, side: "left" | "right"): NodePoint {
  const x = task.layout?.x ?? 180 + (index % 3) * 230;
  const y = task.layout?.y ?? 58 + Math.floor(index / 3) * 132;
  return {
    x: x + (side === "right" ? NODE_WIDTH : 0),
    y: y + NODE_HEIGHT / 2,
  };
}

function EdgesLayer({ tasks, edges }: { tasks: WorkflowTaskDefinition[]; edges: Array<{ from: "start" | string; to: string }> }) {
  const taskIndex = useMemo(() => new Map(tasks.map((task, index) => [task.id || `task-${index + 1}`, index])), [tasks]);
  return (
    <svg aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none" }}>
      <defs>
        <marker id="workflow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="color-mix(in srgb, var(--accent) 62%, var(--text-muted))" />
        </marker>
      </defs>
      {edges.map((edge, index) => {
        const toIndex = taskIndex.get(edge.to);
        if (toIndex === undefined) return null;
        const toTask = tasks[toIndex];
        const from = edge.from === "start"
          ? { x: START_NODE.x + START_NODE.width, y: START_NODE.y + START_NODE.height / 2 }
          : (() => {
              const fromIndex = taskIndex.get(edge.from);
              return fromIndex === undefined ? null : getTaskPoint(tasks[fromIndex], fromIndex, "right");
            })();
        if (!from) return null;
        const to = getTaskPoint(toTask, toIndex, "left");
        const mid = Math.max(42, (to.x - from.x) / 2);
        const path = `M ${from.x} ${from.y} C ${from.x + mid} ${from.y}, ${to.x - mid} ${to.y}, ${to.x - 8} ${to.y}`;
        return (
          <path
            key={`${edge.from}-${edge.to}-${index}`}
            d={path}
            fill="none"
            stroke="color-mix(in srgb, var(--accent) 48%, var(--text-dim))"
            strokeWidth="1.7"
            strokeDasharray={edge.from === "start" ? "0" : "5 5"}
            markerEnd="url(#workflow-arrow)"
            opacity="0.86"
          />
        );
      })}
    </svg>
  );
}

function StartNode() {
  return (
    <div style={{
      position: "absolute",
      left: START_NODE.x,
      top: START_NODE.y,
      zIndex: 3,
      width: START_NODE.width,
      height: START_NODE.height,
      borderRadius: 16,
      border: "1px solid color-mix(in srgb, var(--accent) 32%, transparent)",
      background: "color-mix(in srgb, var(--accent) 10%, var(--bg))",
      color: "var(--text)",
      display: "grid",
      placeItems: "center",
      boxShadow: "var(--shell-shadow-sm)",
      fontSize: 12,
      fontWeight: 850,
    }}>
      Start
    </div>
  );
}

function WorkflowTitle({ workflow }: { workflow: WorkflowDefinition }) {
  return (
    <div style={{
      position: "absolute",
      right: 16,
      top: 14,
      zIndex: 4,
      maxWidth: 320,
      textAlign: "right",
      padding: "8px 12px",
      borderRadius: 999,
      border: "1px solid color-mix(in srgb, var(--shell-edge) 80%, transparent)",
      background: "color-mix(in srgb, var(--bg) 80%, transparent)",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ fontSize: 13, fontWeight: 850, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {workflow.name || "Untitled workflow"}
      </div>
    </div>
  );
}

function TaskInspector({
  task,
  tasks,
  profiles,
  skills,
  updateTask,
  removeTask,
}: {
  task: WorkflowTaskDefinition;
  tasks: WorkflowTaskDefinition[];
  profiles: Array<{ id: string; name?: string }>;
  skills: SkillItem[];
  updateTask: (taskId: string, patch: Partial<WorkflowTaskDefinition>) => void;
  removeTask: (taskId: string) => void;
}) {
  const taskId = task.id || "";
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Task ID">
        <input value={task.id || ""} onChange={(event) => updateTask(taskId, { id: event.target.value })} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
      </Field>
      <Field label="Name">
        <input value={task.name || ""} onChange={(event) => updateTask(taskId, { name: event.target.value })} style={inputStyle} />
      </Field>
      <Field label="Profile">
        <select value={task.profileId || ""} onChange={(event) => updateTask(taskId, { profileId: event.target.value })} style={inputStyle}>
          <option value="">Select profile</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.name || profile.id}</option>
          ))}
        </select>
      </Field>
      <Field label="Goal">
        <textarea value={task.prompt || ""} onChange={(event) => updateTask(taskId, { prompt: event.target.value })} style={{ ...inputStyle, minHeight: 96, resize: "vertical" }} />
      </Field>
      <Field label="Dependencies">
        <select
          multiple
          value={task.deps || []}
          onChange={(event) => updateTask(taskId, { deps: Array.from(event.target.selectedOptions).map((option) => option.value) })}
          style={{ ...inputStyle, minHeight: 92 }}
        >
          {tasks.filter((item) => item.id !== task.id).map((item) => (
            <option key={item.id} value={item.id}>{item.name || item.id}</option>
          ))}
        </select>
      </Field>
      <Field label="Skills">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {skills.map((skill) => {
            const active = (task.skills || []).includes(skill.id);
            return (
              <button
                key={skill.id}
                type="button"
                title={skill.description || skill.id}
                onClick={() => updateTask(taskId, { skills: active ? (task.skills || []).filter((item) => item !== skill.id) : [...(task.skills || []), skill.id] })}
                style={{
                  border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "var(--border)"}`,
                  background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : "var(--bg-secondary)",
                  color: "var(--text)",
                  borderRadius: 999,
                  padding: "5px 9px",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                {skill.id}
              </button>
            );
          })}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Retries">
          <input
            type="number"
            min={0}
            value={task.budget?.maxRetries ?? 0}
            onChange={(event) => updateTask(taskId, { budget: { ...(task.budget || {}), maxRetries: Number(event.target.value) } })}
            style={inputStyle}
          />
        </Field>
        <Field label="Timeout sec">
          <input
            type="number"
            min={0}
            value={Math.round((task.budget?.timeoutMs ?? 0) / 1000)}
            onChange={(event) => updateTask(taskId, { budget: { ...(task.budget || {}), timeoutMs: Number(event.target.value) * 1000 } })}
            style={inputStyle}
          />
        </Field>
      </div>
      <button type="button" onClick={() => removeTask(taskId)} style={{ ...buttonStyle("danger"), justifySelf: "start" }}>
        Remove node
      </button>
    </div>
  );
}

function WorkflowInspector({
  draft,
  profiles,
  updateDraft,
}: {
  draft: WorkflowDefinition;
  profiles: Array<{ id: string; name?: string }>;
  updateDraft: (patch: Partial<WorkflowDefinition>) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Lead Profile">
        <select value={draft.leadProfileId || "lead-agent"} onChange={(event) => updateDraft({ leadProfileId: event.target.value })} style={inputStyle}>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.name || profile.id}</option>
          ))}
        </select>
      </Field>
      <Field label="Review Policy">
        <select value={draft.reviewPolicy || "lead_plus_reviewer"} onChange={(event) => updateDraft({ reviewPolicy: event.target.value as WorkflowDefinition["reviewPolicy"] })} style={inputStyle}>
          <option value="lead_plus_reviewer">lead_plus_reviewer</option>
          <option value="lead_only">lead_only</option>
        </select>
      </Field>
      <Field label="完善状态">
        <select
          value={draft.debugStatus || "unverified"}
          onChange={(event) => {
            const debugStatus = event.target.value as WorkflowDefinition["debugStatus"];
            updateDraft(debugStatus === "polished"
              ? { debugStatus, debuggedAt: Date.now(), debugSource: "workflow-inspector" }
              : { debugStatus, debuggedAt: undefined, debugSource: undefined });
          }}
          style={inputStyle}
        >
          <option value="polished">完善</option>
          <option value="needs_debug">待完善</option>
          <option value="unverified">未验证</option>
        </select>
      </Field>
      <Field label="Working Directory">
        <input value={draft.cwd || ""} onChange={(event) => updateDraft({ cwd: event.target.value })} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
      </Field>
    </div>
  );
}

function InspectorDrawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 950, display: "flex", justifyContent: "flex-end", background: "rgba(15,23,42,0.18)" }} onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} className="codex-card codex-scroll-column" style={{ width: 390, maxWidth: "92vw", height: "100%", borderRadius: "24px 0 0 24px", padding: 18, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 850, color: "var(--text)", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>Inspector</div>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle}>×</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function SaveWorkflowDialog({
  draft,
  categoryOptions,
  busy,
  onClose,
  onSave,
}: {
  draft: WorkflowDefinition;
  categoryOptions: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (metadata: Pick<WorkflowDefinition, "name" | "description" | "domain" | "category" | "templateType">) => void;
}) {
  const [name, setName] = useState(draft.name || "");
  const [description, setDescription] = useState(draft.description || "");
  const [domain, setDomain] = useState(draft.domain && !HIDDEN_WORKFLOW_DOMAINS.has(draft.domain) ? draft.domain : "self-media");
  const [customCategory, setCustomCategory] = useState(draft.category && !WORKFLOW_DOMAIN_LABELS[draft.domain || ""] ? draft.category : "");
  const [templateType, setTemplateType] = useState(draft.templateType || "");
  const categoryChoices = useMemo(() => {
    const choices = new Set(categoryOptions.length ? categoryOptions : WORKFLOW_DOMAIN_ORDER);
    if (draft.domain && !HIDDEN_WORKFLOW_DOMAINS.has(draft.domain)) choices.add(draft.domain);
    return [...choices].sort((a, b) => {
      const ia = WORKFLOW_DOMAIN_ORDER.indexOf(a);
      const ib = WORKFLOW_DOMAIN_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return workflowDomainLabel(a).localeCompare(workflowDomainLabel(b));
    });
  }, [categoryOptions, draft.domain]);
  const nameReady = name.trim().length > 0;
  const effectiveDomain = domain === "__new__" ? slugDomain(customCategory) : domain;
  const effectiveCategory = domain === "__new__" ? customCategory.trim() : workflowDomainLabel(domain);
  const canSave = nameReady && effectiveDomain.length > 0 && (domain !== "__new__" || customCategory.trim().length > 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 980,
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "rgba(15,23,42,0.22)",
      }}
      onClick={onClose}
    >
      <section
        className="codex-card"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(620px, 96vw)",
          maxHeight: "90vh",
          overflow: "auto",
          borderRadius: 20,
          padding: 18,
          boxShadow: "0 24px 70px rgba(15,23,42,0.26)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 850, color: "var(--text)" }}>保存 Workflow</div>
            <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.6, color: "var(--text-muted)" }}>
              填写保存信息，并选择它之后在列表里的分类和通用类型。
            </div>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle}>×</button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Name *">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="给这个 workflow 起一个清楚的名字"
              style={{ ...inputStyle, fontWeight: 800 }}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="说明这个 workflow 解决什么问题、适合什么输入。"
              style={{ ...inputStyle, minHeight: 74, resize: "vertical" }}
            />
          </Field>

          <Field label="Category">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 8 }}>
              {categoryChoices.map((item) => (
                <OptionButton
                  key={item}
                  active={domain === item}
                  label={workflowDomainLabel(item)}
                  onClick={() => setDomain(item)}
                />
              ))}
              <OptionButton active={domain === "__new__"} label="新分类" onClick={() => setDomain("__new__")} />
            </div>
          </Field>
          {domain === "__new__" ? (
            <Field label="New Category *">
              <input
                value={customCategory}
                onChange={(event) => setCustomCategory(event.target.value)}
                placeholder="例如：招聘、法务、内部运营"
                style={inputStyle}
              />
            </Field>
          ) : null}

          <Field label="Workflow Type">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 8 }}>
              {WORKFLOW_TEMPLATE_OPTIONS.map((item) => (
                <OptionButton
                  key={item.id || "blank"}
                  active={templateType === item.id}
                  label={item.label}
                  onClick={() => setTemplateType(item.id)}
                />
              ))}
            </div>
          </Field>

          {!nameReady ? (
            <div style={{ fontSize: 11, color: "#ef4444" }}>保存前需要填写 workflow 名字。</div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 2 }}>
            <button type="button" onClick={onClose} disabled={busy} style={buttonStyle()}>Cancel</button>
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() => onSave({
                name: name.trim(),
                description: description.trim(),
                domain: effectiveDomain,
                category: effectiveCategory || effectiveDomain,
                templateType,
              })}
              style={{ ...buttonStyle("primary"), opacity: busy || !canSave ? 0.55 : 1 }}
            >
              {busy ? "Saving..." : "Save workflow"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function OptionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 38,
        borderRadius: 10,
        border: active ? "1px solid color-mix(in srgb, var(--accent) 54%, transparent)" : "1px solid var(--border)",
        background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : "var(--bg-secondary)",
        color: "var(--text)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 850 : 700,
        textAlign: "center",
        padding: "7px 9px",
      }}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function WorkflowInputField({
  field,
  value,
  onChange,
  compact = false,
}: {
  field: WorkflowInputFieldDefinition;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  const placeholder = field.placeholder || (field.type === "links" ? "每行一个链接" : field.type === "files" ? "每行一个文件路径" : "");
  const help = field.help ? <span style={{ fontSize: 10, lineHeight: 1.5, color: "var(--text-muted)" }}>{field.help}</span> : null;

  if (field.type === "select") {
    return (
      <Field label={label}>
        <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>
          <option value="">请选择</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {help}
      </Field>
    );
  }

  if (field.type === "text" || field.type === "datetime") {
    return (
      <Field label={label}>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={inputStyle} />
        {help}
      </Field>
    );
  }

  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, minHeight: compact ? 58 : field.type === "links" || field.type === "files" ? 76 : 92, resize: "vertical" }}
      />
      {help}
    </Field>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 12,
};

const iconButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

const backIconButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  flexShrink: 0,
};

function buttonStyle(kind: "default" | "primary" | "danger" = "default"): React.CSSProperties {
  return {
    padding: "7px 10px",
    borderRadius: 9,
    border: kind === "danger" ? "1px solid rgba(239,68,68,0.28)" : "1px solid var(--border)",
    background: kind === "primary" ? "var(--text)" : "var(--bg-secondary)",
    color: kind === "primary" ? "var(--bg)" : kind === "danger" ? "#ef4444" : "var(--text)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 750,
  };
}
