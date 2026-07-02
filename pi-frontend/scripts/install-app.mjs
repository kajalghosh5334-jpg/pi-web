#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");

function run(script) {
  const result = spawnSync(process.execPath, [resolve(projectDir, "scripts", script)], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function buildApp() {
  if (process.env.PI_WEB_SKIP_BUILD === "1") return true;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "build"], { cwd: projectDir, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.warn("[pi-web] production build failed; installing a dev-mode launcher instead.");
    return false;
  }
  return true;
}

buildApp();

if (process.platform === "darwin") {
  run("install-macos-app.mjs");
} else if (process.platform === "win32") {
  run("install-windows-shortcut.mjs");
} else {
  console.error("App installation is supported on macOS and Windows only.");
  process.exit(1);
}
