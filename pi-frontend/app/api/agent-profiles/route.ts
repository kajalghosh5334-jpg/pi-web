import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

const BACKEND_URL = process.env.PI_BACKEND_URL || "http://127.0.0.1:3000";
const GENERIC_WORKFLOW_PROFILE_IDS = [
  "weak-research-extractor",
  "weak-structured-operator",
  "classification-router",
  "structured-writeback-operator",
  "content-draft-producer",
  "support-kb-responder",
  "research-report-analyst",
  "sales-call-analyst",
  "content-strategy-director",
  "strong-task-architect",
  "strong-quality-reviewer",
  "content-editor-reviewer",
  "monitor-alert-operator",
];

type ProfileRecord = { id?: string; name?: string };
type WorkflowRecord = {
  leadProfileId?: string;
  tasks?: Array<{ profileId?: string }>;
};

function workflowProfileIds(workflows: Record<string, WorkflowRecord>) {
  const ids = new Set(GENERIC_WORKFLOW_PROFILE_IDS);
  for (const workflow of Object.values(workflows || {})) {
    if (workflow?.leadProfileId) ids.add(workflow.leadProfileId);
    for (const task of workflow?.tasks || []) {
      if (task?.profileId) ids.add(task.profileId);
    }
  }
  return ids;
}

async function readLocalProfiles(error: string) {
  const backendDir = join(process.cwd(), "../pi-backend");
  const [profilesRaw, workflowsRaw] = await Promise.all([
    readFile(join(backendDir, "agent-profiles.json"), "utf8"),
    readFile(join(backendDir, "workflows.json"), "utf8"),
  ]);
  const profiles = JSON.parse(profilesRaw) as Record<string, ProfileRecord>;
  const workflows = JSON.parse(workflowsRaw) as Record<string, WorkflowRecord>;
  const allowed = workflowProfileIds(workflows);
  return {
    profiles: Object.values(profiles)
      .filter((profile) => profile?.id && allowed.has(profile.id))
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))),
    degraded: true,
    source: "local-agent-profiles-json",
    error,
  };
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BACKEND_URL}/api/agent-profiles`, { cache: "no-store", signal: controller.signal });
    const data = await res.json().catch(() => ({ error: "Invalid backend response" }));
    if (res.ok) return Response.json(data, { status: res.status });
    return Response.json(await readLocalProfiles(data?.error || "Backend profile API failed"));
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Backend timed out" : "Backend not available";
    try {
      return Response.json(await readLocalProfiles(message));
    } catch (localError) {
      return Response.json({
        error: message,
        localError: localError instanceof Error ? localError.message : String(localError),
      }, { status: 503 });
    }
  } finally {
    clearTimeout(timeout);
  }
}
