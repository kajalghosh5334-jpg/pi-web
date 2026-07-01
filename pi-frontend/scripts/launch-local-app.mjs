#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const port = process.env.PI_WEB_PORT || "30141";
const url = `http://localhost:${port}`;
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const logDir = process.env.PI_WEB_LOG_DIR
  ?? (process.platform === "win32"
    ? join(homedir(), "AppData", "Local", "Pi Web", "Logs")
    : join(homedir(), "Library", "Logs", "Pi Web"));
const pidFile = join(logDir, "pi-web.pid");

mkdirSync(logDir, { recursive: true });

async function ready() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`${url}/`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function startServer() {
  if (!existsSync(join(projectDir, "node_modules"))) {
    const install = spawnSync(npmCmd, ["install"], { cwd: projectDir, stdio: ["ignore", "inherit", "inherit"] });
    if (install.status !== 0) {
      throw new Error("npm install failed");
    }
  }

  if (existsSync(pidFile)) {
    const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 0);
        return;
      } catch {
        // stale pid
      }
    }
  }

  const child = spawn(npmCmd, ["run", "dev"], {
    cwd: projectDir,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  child.unref();
  writeFileSync(pidFile, String(child.pid));
}

function openAppWindow() {
  if (process.platform === "win32") {
    const candidates = [
      process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : null,
      process.env["PROGRAMFILES(X86)"] ? join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : null,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : null,
    ].filter((item) => typeof item === "string" && existsSync(item));
    const chrome = candidates[0];
    if (chrome) {
      const child = spawn(chrome, [`--app=${url}`], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return;
    }
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }

  if (process.platform === "darwin") {
    const child = spawn("open", ["-na", "Google Chrome", "--args", `--app=${url}`], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return;
  }

  const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}

async function main() {
  if (!(await ready())) {
    startServer();
    for (let i = 0; i < 80; i += 1) {
      if (await ready()) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
  }
  openAppWindow();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
