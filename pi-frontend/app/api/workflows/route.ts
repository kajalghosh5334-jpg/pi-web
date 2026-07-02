import { readFile } from "fs/promises";
import { join } from "path";

import type { WorkflowDefinition } from "@/lib/types";

export const runtime = "nodejs";

const BACKEND_URL = process.env.PI_BACKEND_URL || "http://127.0.0.1:3000";

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
  const workflowCatalogPath = join(process.cwd(), "../pi-backend/workflows.json");
  const raw = await readFile(workflowCatalogPath, "utf8");
  return {
    workflows: normalizeWorkflows(JSON.parse(raw)),
    degraded: true,
    source: "local-workflows-json",
    error,
    backendStatus,
  };
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
    return Response.json({ error: "Backend not available" }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
