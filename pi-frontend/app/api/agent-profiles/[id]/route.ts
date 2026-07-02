import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

const BACKEND_URL = process.env.PI_BACKEND_URL || "http://127.0.0.1:3000";
const PROFILE_STORE_PATH = join(process.cwd(), "../pi-backend/agent-profiles.json");

type ProfileRecord = {
  id?: string;
  name?: string;
  defaultModel?: string;
  skills?: string[];
  availableSkills?: string[];
  collaborationProtocol?: string;
};

async function patchLocalProfile(id: string, body: Record<string, unknown>) {
  const raw = await readFile(PROFILE_STORE_PATH, "utf8");
  const profiles = JSON.parse(raw) as Record<string, ProfileRecord>;
  const existing = profiles[id];
  if (!existing) return { status: 404, data: { error: "profile not found" } };
  const patch: Partial<ProfileRecord> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.defaultModel === "string") patch.defaultModel = body.defaultModel;
  if (typeof body.collaborationProtocol === "string") patch.collaborationProtocol = body.collaborationProtocol;
  if (Array.isArray(body.skills)) patch.skills = body.skills.filter((item): item is string => typeof item === "string");
  if (Array.isArray(body.availableSkills)) patch.availableSkills = body.availableSkills.filter((item): item is string => typeof item === "string");
  const profile = { ...existing, ...patch, id: existing.id || id };
  profiles[id] = profile;
  await writeFile(PROFILE_STORE_PATH, JSON.stringify(profiles, null, 2) + "\n", "utf8");
  return { status: 200, data: { ok: true, profile, degraded: true, source: "local-agent-profiles-json" } };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${BACKEND_URL}/api/agent-profiles/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Response.json(await res.json().catch(() => ({ ok: res.ok })), { status: res.status });
  } catch {
    try {
      const result = await patchLocalProfile(id, body);
      return Response.json(result.data, { status: result.status });
    } catch (localError) {
      return Response.json({
        error: "Backend not available",
        localError: localError instanceof Error ? localError.message : String(localError),
      }, { status: 500 });
    }
  }
}
