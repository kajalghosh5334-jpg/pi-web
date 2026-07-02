#!/usr/bin/env node
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execPath } from "node:process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const port = process.env.PI_WEB_PORT || "30141";
const host = process.env.PI_WEB_HOST || "127.0.0.1";
const url = `http://${host}:${port}`;
const logDir = process.env.PI_WEB_LOG_DIR
  ?? (process.platform === "win32"
    ? join(homedir(), "AppData", "Local", "Pi Web", "Logs")
    : join(homedir(), "Library", "Logs", "Pi Web"));
const pidFile = join(logDir, "pi-web.pid");
const launchLockDir = join(logDir, "pi-web-launch.lock");
const browserProfileDir = join(logDir, "browser-profiles");
const launchLockTtlMs = 2 * 60 * 1000;
const knownBinDirs = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];
const buildIdFile = join(projectDir, ".next", "BUILD_ID");
const browserArg = process.argv.find((arg) => arg.startsWith("--browser="))?.slice("--browser=".length);
const browserPreference = (browserArg || process.env.PI_WEB_BROWSER || "auto").toLowerCase();
const shouldOpenWindow = !process.argv.includes("--no-open");

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

async function portIsListening() {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port: Number.parseInt(port, 10) });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolvePort(false);
    }, 1000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolvePort(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolvePort(false);
    });
  });
}

function acquireLaunchLock() {
  try {
    mkdirSync(launchLockDir);
    writeFileSync(join(launchLockDir, "pid"), `${process.pid}\n`);
    return true;
  } catch {
    try {
      const ageMs = Date.now() - statSync(launchLockDir).mtimeMs;
      if (ageMs > launchLockTtlMs) {
        rmSync(launchLockDir, { recursive: true, force: true });
        mkdirSync(launchLockDir);
        writeFileSync(join(launchLockDir, "pid"), `${process.pid}\n`);
        return true;
      }
    } catch {
      // If the lock disappears between checks, the next click can acquire it.
    }
    return false;
  }
}

function releaseLaunchLock() {
  rmSync(launchLockDir, { recursive: true, force: true });
}

function findNpmCli() {
  const nodeDir = dirname(execPath);
  const candidates = [
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    ...knownBinDirs.map((binDir) => join(dirname(binDir), "lib", "node_modules", "npm", "bin", "npm-cli.js")),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function findNpmBin() {
  const candidates = [
    "/usr/local/bin/npm",
    "/opt/homebrew/bin/npm",
    "/usr/bin/npm",
    "/bin/npm",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function childEnv() {
  const pathEntries = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
    "/bin",
    process.env.PATH || "",
  ].filter(Boolean);
  return {
    ...process.env,
    PATH: pathEntries.join(":"),
  };
}

function spawnDetached(command, args, options = {}) {
  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", options.stdoutFd ?? "ignore", options.stderrFd ?? "ignore"],
    windowsHide: true,
    env: options.env ?? childEnv(),
    cwd: options.cwd,
  });
  child.on("error", (error) => {
    const logFd = options.stderrFd;
    if (typeof logFd === "number") {
      const message = `${new Date().toISOString()} launcher error: ${error instanceof Error ? error.stack || error.message : String(error)}\n`;
      try {
        writeSync(logFd, message);
      } catch {
        // ignore logging failures
      }
    }
  });
  child.unref();
  return child;
}

function runPackageManager(args, cwd, logFd, detached = false) {
  const npmCli = findNpmCli();
  if (npmCli) {
    return detached
      ? spawnDetached(execPath, [npmCli, ...args], { cwd, stdoutFd: logFd, stderrFd: logFd })
      : spawnSync(execPath, [npmCli, ...args], { cwd, stdio: ["ignore", logFd, logFd], env: childEnv() });
  }

  const npmBin = findNpmBin();
  if (npmBin) {
    return detached
      ? spawnDetached(npmBin, args, { cwd, stdoutFd: logFd, stderrFd: logFd })
      : spawnSync(npmBin, args, { cwd, stdio: ["ignore", logFd, logFd], env: childEnv() });
  }

  return detached
    ? spawnDetached("npm", args, { cwd, stdoutFd: logFd, stderrFd: logFd })
    : spawnSync("npm", args, { cwd, stdio: ["ignore", logFd, logFd], env: childEnv() });
}

function serverScriptName() {
  return existsSync(buildIdFile) ? "start" : "dev";
}

function macDefaultBrowserPreference() {
  if (process.platform !== "darwin") return null;
  const result = spawnSync("defaults", ["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || !result.stdout) return null;

  const httpHandler = result.stdout
    .split("},")
    .find((entry) => entry.includes("LSHandlerURLScheme = http;"));
  const role = httpHandler?.match(/LSHandlerRoleAll = "([^"]+)";/)?.[1];
  if (role === "com.quark.desktop") return "quark";
  if (role === "com.google.chrome") return "chrome";
  return null;
}

function browserCandidates() {
  const chrome = {
    id: "chrome",
    appPaths: process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app",
          join(homedir(), "Applications", "Google Chrome.app"),
        ]
      : [],
    paths: process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          join(homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
        ]
      : process.platform === "win32"
        ? [
            process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : null,
            process.env["PROGRAMFILES(X86)"] ? join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : null,
            process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : null,
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/snap/bin/chromium",
          ],
  };

  const quark = {
    id: "quark",
    appPaths: process.platform === "darwin"
      ? [
          "/Applications/Quark.app",
          join(homedir(), "Applications", "Quark.app"),
          "/Applications/夸克.app",
          join(homedir(), "Applications", "夸克.app"),
        ]
      : [],
    paths: process.platform === "darwin"
      ? [
          "/Applications/Quark.app/Contents/MacOS/Quark",
          join(homedir(), "Applications", "Quark.app", "Contents", "MacOS", "Quark"),
          "/Applications/夸克.app/Contents/MacOS/Quark",
          join(homedir(), "Applications", "夸克.app", "Contents", "MacOS", "Quark"),
        ]
      : process.platform === "win32"
        ? [
            process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Quark", "Quark.exe") : null,
            process.env["PROGRAMFILES(X86)"] ? join(process.env["PROGRAMFILES(X86)"], "Quark", "Quark.exe") : null,
            process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Quark", "Quark.exe") : null,
            process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Quark", "Application", "Quark.exe") : null,
          ]
        : [],
  };

  if (browserPreference === "quark") return [quark, chrome];
  if (browserPreference === "chrome") return [chrome, quark];
  if (macDefaultBrowserPreference() === "quark") return [quark, chrome];
  return [chrome, quark];
}

function restoreAppWindow(browser) {
  if (process.platform !== "darwin") return false;

  const appName = browser.id === "quark" ? "Quark" : "Google Chrome";
  const script = `
set targetHost to "${url}"
tell application "${appName}"
  repeat with browserWindow in windows
    try
      set tabIndex to 1
      repeat with browserTab in tabs of browserWindow
        set currentUrl to URL of browserTab
        if currentUrl starts with targetHost then
          set minimized of browserWindow to false
          set active tab index of browserWindow to tabIndex
          set index of browserWindow to 1
          activate
          return "found"
        end if
        set tabIndex to tabIndex + 1
      end repeat
    end try
  end repeat
end tell
return "not-found"
`;

  const result = spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 && String(result.stdout || "").includes("found");
}

function openBrowserAppWindow() {
  for (const browser of browserCandidates()) {
    const executable = browser.paths.find((candidate) => typeof candidate === "string" && existsSync(candidate));
    if (!executable) continue;

    const userDataDir = join(browserProfileDir, browser.id);
    mkdirSync(userDataDir, { recursive: true });
    console.log(`${new Date().toISOString()} opening ${browser.id} app window: ${url}/`);
    spawnDetached(executable, [
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--app=${url}/`,
    ]);
    return true;
  }

  return false;
}

function openUrlWindow() {
  if (process.platform === "darwin") {
    if (browserPreference === "chrome" || browserPreference === "quark") {
      const appName = browserPreference === "quark" ? "Quark" : "Google Chrome";
      const result = spawnSync("open", ["-a", appName, url], { stdio: "ignore" });
      if (result.status === 0) return;
    }
    spawnSync("open", [url], { stdio: "ignore" });
    return;
  }

  if (process.platform === "win32") {
    const preferredBrowser = browserPreference === "auto" ? null : browserCandidates()[0];
    const executable = preferredBrowser?.paths.find((candidate) => typeof candidate === "string" && existsSync(candidate));
    if (executable) {
      spawnDetached(executable, [url]);
      return;
    }
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }

  spawnDetached("xdg-open", [url]);
}

function startServer() {
  if (!existsSync(join(projectDir, "node_modules"))) {
    const installFd = openSync(join(logDir, "pi-web.log"), "a");
    const install = runPackageManager(["install"], projectDir, installFd);
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

  const logFd = openSync(join(logDir, "pi-web.log"), "a");
  const child = runPackageManager(["run", serverScriptName()], projectDir, logFd, true);
  if (child.pid) {
    writeFileSync(pidFile, String(child.pid));
  }
}

function openAppWindow() {
  // Chrome app windows can report a matching tab to AppleScript while the user-visible
  // window is not restored. Prefer opening the app window directly so desktop icon
  // clicks always produce a visible Pi window.
  if (openBrowserAppWindow()) return;

  for (const browser of browserCandidates()) {
    if (restoreAppWindow(browser)) return;
  }

  openUrlWindow();
}

async function main() {
  if (!acquireLaunchLock()) return;

  try {
    if (!(await ready())) {
      if (!(await portIsListening())) {
        startServer();
      }
      for (let i = 0; i < 120; i += 1) {
        if (await ready()) break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      }
    }
    if (shouldOpenWindow) {
      openAppWindow();
    }
  } finally {
    releaseLaunchLock();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
