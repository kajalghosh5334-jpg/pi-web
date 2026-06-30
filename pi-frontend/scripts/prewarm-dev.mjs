import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.PI_WEB_PREWARM_BASE_URL || "http://127.0.0.1:30141";
const targets = [
  "/",
  "/api/sessions",
  "/api/workflows",
  "/api/models-config",
  "/api/auth/providers",
  "/api/auth/all-providers",
  "/api/train/__pi_prewarm__/start",
];
const maxAttempts = 40;
const attemptDelayMs = 750;

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body,
      signal: controller.signal,
    });
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if ((await request(`${baseUrl}/`, { timeoutMs: 2_000 })).ok) return true;
    await delay(attemptDelayMs);
  }
  return false;
}

async function main() {
  const ready = await waitForServer();
  if (!ready) {
    console.warn(`[prewarm-dev] skipped: ${baseUrl} not reachable`);
    return;
  }

  const results = await Promise.allSettled(
    targets.map((target) => request(`${baseUrl}${target}`, target.endsWith("/start")
      ? { method: "POST", body: "{}" }
      : {}))
  );
  const summary = results.map((result, index) => {
    if (result.status === "rejected") return `${targets[index]}=failed`;
    return `${targets[index]}=${result.value.status}`;
  });
  console.log(`[prewarm-dev] warmed ${summary.join(", ")}`);
}

await main();
