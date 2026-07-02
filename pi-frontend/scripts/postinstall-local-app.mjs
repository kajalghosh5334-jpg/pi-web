#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const installScript = resolve(projectDir, "scripts", "install-app.mjs");

function shouldSkip() {
  if (process.env.CI) return "CI environment";
  if (process.env.PI_WEB_SKIP_POSTINSTALL_APP === "1") return "PI_WEB_SKIP_POSTINSTALL_APP=1";
  if (projectDir.includes(`${sep}node_modules${sep}`)) return "package install";
  if (process.platform !== "darwin" && process.platform !== "win32") return "unsupported platform";
  if (!existsSync(installScript)) return "missing install script";
  return null;
}

function runInstall(extraEnv = {}) {
  return spawnSync(process.execPath, [installScript], {
    cwd: projectDir,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

const skipReason = shouldSkip();
if (skipReason) {
  console.log(`[pi-web] desktop launcher postinstall skipped: ${skipReason}`);
  process.exit(0);
}

console.log("[pi-web] installing desktop launcher...");
let result = runInstall({ PI_WEB_SKIP_BUILD: "1" });
if (result.error || result.status !== 0) {
  console.warn("[pi-web] desktop launcher install failed.");
}

if (result.error || result.status !== 0) {
  console.warn("[pi-web] desktop launcher was not installed automatically. Run `npm run app:install` to retry.");
}
