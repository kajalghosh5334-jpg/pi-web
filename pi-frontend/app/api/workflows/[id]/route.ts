import { readFile, writeFile } from "fs/promises";
import { join } from "path";

import type { WorkflowDefinition } from "@/lib/types";

export const runtime = "nodejs";

const BACKEND_URL = process.env.PI_BACKEND_URL || "http://127.0.0.1:3000";
const WORKFLOW_CATALOG_PATH = join(process.cwd(), "../pi-backend/workflows.json");

async function patchLocalWorkflow(id: string, body: Record<string, unknown>) {
  const raw = await readFile(WORKFLOW_CATALOG_PATH, "utf8");
  const workflows = JSON.parse(raw) as Record<string, WorkflowDefinition>;
  const existing = workflows[id];
  if (!existing) return { status: 404, data: { error: "workflow not found" } };
  const workflow = {
    ...existing,
    ...body,
    id: existing.id,
    updatedAt: Date.now(),
  } as WorkflowDefinition;
  workflows[id] = workflow;
  await writeFile(WORKFLOW_CATALOG_PATH, JSON.stringify(workflows, null, 2) + "\n");
  return { status: 200, data: { ok: true, workflow, degraded: true, source: "local-workflows-json" } };
}

async function deleteLocalWorkflow(id: string) {
  const raw = await readFile(WORKFLOW_CATALOG_PATH, "utf8");
  const workflows = JSON.parse(raw) as Record<string, WorkflowDefinition>;
  if (!workflows[id]) return { status: 404, data: { error: "workflow not found" } };
  delete workflows[id];
  await writeFile(WORKFLOW_CATALOG_PATH, JSON.stringify(workflows, null, 2) + "\n");
  return { status: 200, data: { ok: true, degraded: true, source: "local-workflows-json" } };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${BACKEND_URL}/api/workflows/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Response.json(await res.json().catch(() => ({ ok: res.ok })), { status: res.status });
  } catch {
    try {
      const result = await patchLocalWorkflow(id, body);
      return Response.json(result.data, { status: result.status });
    } catch (localErr) {
      return Response.json({
        error: "Backend not available",
        localError: localErr instanceof Error ? localErr.message : String(localErr),
      }, { status: 500 });
    }
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/api/workflows/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return Response.json(await res.json().catch(() => ({ ok: res.ok })), { status: res.status });
  } catch {
    try {
      const result = await deleteLocalWorkflow(id);
      return Response.json(result.data, { status: result.status });
    } catch (localErr) {
      return Response.json({
        error: "Backend not available",
        localError: localErr instanceof Error ? localErr.message : String(localErr),
      }, { status: 500 });
    }
  }
}
