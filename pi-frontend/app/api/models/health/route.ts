import { spawn } from "child_process";

export const dynamic = "force-dynamic";

interface ModelInput {
  id: string;
  provider: string;
  name?: string;
}

const PI_BIN = "/usr/local/bin/pi";
const PI_ENV = { ...process.env, PATH: `/usr/local/bin:${process.env.PATH || ""}` };
const CHECK_TIMEOUT_MS = 9000;
const MAX_MODELS = 24;

function checkModel(model: ModelInput, cwd: string): Promise<{ id: string; provider: string; ok: boolean; error?: string; durationMs: number }> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const args = ["--print", "--mode", "json", "--no-session", "--model", `${model.provider}/${model.id}`, "--no-tools"];
    const proc = spawn(PI_BIN, args, { cwd, env: PI_ENV });
    let settled = false;
    let stderr = "";
    let stdout = "";
    const done = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { proc.kill("SIGKILL"); } catch {}
      resolve({ id: model.id, provider: model.provider, ok, error, durationMs: Date.now() - startedAt });
    };
    const timer = setTimeout(() => done(false, "timeout"), CHECK_TIMEOUT_MS);
    proc.stdout.on("data", (d) => { stdout += String(d); });
    proc.stderr.on("data", (d) => { stderr += String(d); });
    proc.on("error", (err) => done(false, err.message));
    proc.on("close", (code) => {
      if (settled) return;
      const text = `${stdout}\n${stderr}`;
      done(code === 0 && /ok/i.test(text), code === 0 ? undefined : (stderr || stdout || `exit ${code}`).slice(0, 240));
    });
    proc.stdin.write("Reply with exactly: OK");
    proc.stdin.end();
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cwd = typeof body.cwd === "string" && body.cwd ? body.cwd : process.cwd();
  const models = Array.isArray(body.models) ? body.models.slice(0, MAX_MODELS) as ModelInput[] : [];
  if (!models.length) return Response.json({ results: [] });

  const results: Array<{ id: string; provider: string; ok: boolean; error?: string; durationMs: number }> = [];
  const queue = [...models];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const model = queue.shift();
      if (!model) return;
      results.push(await checkModel(model, cwd));
    }
  });
  await Promise.all(workers);
  return Response.json({ results, checkedAt: Date.now() });
}
