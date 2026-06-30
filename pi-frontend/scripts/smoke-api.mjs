const baseUrl = process.env.PI_WEB_SMOKE_BASE_URL || "http://127.0.0.1:30142";

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Keep raw text for diagnostics below.
    }
    return { path, status: res.status, ms: Date.now() - startedAt, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function providerValues(modelsConfig) {
  return Object.values(modelsConfig?.providers ?? {}).filter((provider) => provider && typeof provider === "object");
}

async function main() {
  const checks = [];

  const sessions = await request("/api/sessions");
  assert(sessions.status === 200, `/api/sessions expected 200, got ${sessions.status}`);
  assert(Array.isArray(sessions.json?.sessions), "/api/sessions did not return sessions[]");
  checks.push(`sessions=${sessions.json.sessions.length} (${sessions.ms}ms)`);

  const workflows = await request("/api/workflows");
  assert(workflows.status === 200, `/api/workflows expected 200, got ${workflows.status}`);
  assert(Array.isArray(workflows.json?.workflows), "/api/workflows did not return workflows[]");
  checks.push(`workflows=${workflows.json.workflows.length} (${workflows.ms}ms)`);

  const models = await request("/api/models-config");
  assert(models.status === 200, `/api/models-config expected 200, got ${models.status}`);
  const providers = providerValues(models.json);
  const providersWithRawApiKey = providers.filter((provider) => Object.prototype.hasOwnProperty.call(provider, "apiKey"));
  assert(providersWithRawApiKey.length === 0, "/api/models-config exposed apiKey fields");
  checks.push(`modelsProviders=${providers.length} redacted (${models.ms}ms)`);

  const authProviders = await request("/api/auth/providers");
  assert(authProviders.status === 200, `/api/auth/providers expected 200, got ${authProviders.status}`);
  checks.push(`authProviders (${authProviders.ms}ms)`);

  const trainMissing = await request("/api/train/__pi_smoke_missing__/start", { method: "POST", body: "{}" });
  assert([404, 500, 503, 504].includes(trainMissing.status), `/api/train missing-session expected handled error, got ${trainMissing.status}`);
  assert(trainMissing.json?.error, "/api/train missing-session did not return an error message");
  checks.push(`trainMissing=${trainMissing.status} (${trainMissing.ms}ms)`);

  console.log(`[smoke-api] ok ${checks.join(", ")}`);
}

main().catch((error) => {
  console.error(`[smoke-api] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
