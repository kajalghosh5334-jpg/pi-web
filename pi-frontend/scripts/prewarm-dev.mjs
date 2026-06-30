import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.PI_WEB_PREWARM_BASE_URL || "http://127.0.0.1:30141";
const targets = ["/", "/api/sessions"];
const maxAttempts = 20;
const attemptDelayMs = 750;

async function ping(url) {
  try {
    await fetch(url, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await ping(`${baseUrl}/`)) return true;
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

  await Promise.allSettled(
    targets.map((target) => fetch(`${baseUrl}${target}`, { method: "GET" }))
  );
  console.log(`[prewarm-dev] warmed ${targets.join(", ")}`);
}

await main();
