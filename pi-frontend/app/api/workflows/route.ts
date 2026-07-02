import { readFile, writeFile } from "fs/promises";
import { join } from "path";

import type { WorkflowDefinition } from "@/lib/types";

export const runtime = "nodejs";

const BACKEND_URL = process.env.PI_BACKEND_URL || "http://127.0.0.1:3000";
const WORKFLOW_CATALOG_PATH = join(process.cwd(), "../pi-backend/workflows.json");

function normalizeWorkflows(value: unknown): WorkflowDefinition[] {
  if (Array.isArray(value)) return value.filter(Boolean) as WorkflowDefinition[];
  if (value && typeof value === "object") {
    const record = value as { workflows?: unknown };
    if (Array.isArray(record.workflows)) return record.workflows.filter(Boolean) as WorkflowDefinition[];
    return Object.values(value as Record<string, unknown>).filter(Boolean) as WorkflowDefinition[];
  }
  return [];
}

async function readLocalWorkflowCatalog(error: string, backendStatus?: number) {
  const raw = await readFile(WORKFLOW_CATALOG_PATH, "utf8");
  return {
    workflows: normalizeWorkflows(JSON.parse(raw)),
    degraded: true,
    source: "local-workflows-json",
    error,
    backendStatus,
  };
}

function slugId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "workflow";
}

function uniqueWorkflowId(base: string, workflows: Record<string, unknown>) {
  let id = base;
  let index = 2;
  while (workflows[id]) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

async function createLocalWorkflow(body: Record<string, unknown>) {
  const raw = await readFile(WORKFLOW_CATALOG_PATH, "utf8");
  const workflows = JSON.parse(raw) as Record<string, WorkflowDefinition>;
  const now = Date.now();
  const name = String(body.name || "未命名 Workflow").trim() || "未命名 Workflow";
  const id = uniqueWorkflowId(slugId(name), workflows);
  const workflow: WorkflowDefinition = {
    id,
    name,
    description: String(body.description || ""),
    status: "active",
    debugStatus: "unverified",
    domain: String(body.domain || "uncategorized"),
    category: String(body.category || body.domain || "未分类"),
    templateType: String(body.templateType || ""),
    cwd: String(body.cwd || ""),
    leadProfileId: String(body.leadProfileId || "strong-task-architect"),
    reviewPolicy: body.reviewPolicy === "lead_only" ? "lead_only" : "lead_plus_reviewer",
    createdAt: now,
    updatedAt: now,
    tasks: Array.isArray(body.tasks) ? body.tasks as WorkflowDefinition["tasks"] : [],
    inputContract: body.inputContract && typeof body.inputContract === "object" ? body.inputContract as WorkflowDefinition["inputContract"] : undefined,
  };
  workflows[id] = workflow;
  await writeFile(WORKFLOW_CATALOG_PATH, JSON.stringify(workflows, null, 2) + "\n");
  return { ok: true, workflow, degraded: true, source: "local-workflows-json" };
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BACKEND_URL}/api/workflows`, { cache: "no-store", signal: controller.signal });
    const data = await res.json().catch(() => ({ workflows: [] }));
    if (res.ok) return Response.json(data, { status: res.status });
    return Response.json(await readLocalWorkflowCatalog(data?.error || "Backend workflow API failed", res.status));
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "Backend workflow API timed out" : "Backend not available";
    try {
      return Response.json(await readLocalWorkflowCatalog(message));
    } catch (localErr) {
      return Response.json({
        workflows: [],
        error: message,
        localError: localErr instanceof Error ? localErr.message : String(localErr),
      }, { status: 503 });
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BACKEND_URL}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return Response.json(await res.json().catch(() => ({ ok: res.ok })), { status: res.status });
  } catch {
    try {
      return Response.json(await createLocalWorkflow(body));
    } catch (localErr) {
      return Response.json({
        error: "Backend not available",
        localError: localErr instanceof Error ? localErr.message : String(localErr),
      }, { status: 503 });
    }
  } finally {
    clearTimeout(timeout);
  }
}
