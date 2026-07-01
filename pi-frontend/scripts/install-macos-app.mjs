#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const launchScript = resolve(projectDir, "scripts", "launch-local-app.sh");
const appPath = resolve(process.env.PI_WEB_APP_PATH || join(homedir(), "Applications", "Pi Web.app"));
const icnsPath = resolve(projectDir, "assets", "generated", "PiWeb.icns");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

function quoteAppleScriptString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function plistBuddySetOrAdd(plist, key, value) {
  const setResult = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plist], { stdio: "pipe" });
  if (setResult.status === 0) return;
  const addResult = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${value}`, plist], { stdio: "inherit" });
  if (addResult.status !== 0) {
    throw new Error(`/usr/libexec/PlistBuddy could not set ${key}`);
  }
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("macOS app launcher generation currently supports macOS only.");
  }
  if (!existsSync(launchScript)) {
    throw new Error(`Missing launcher script: ${launchScript}`);
  }

  run("node", [resolve(projectDir, "scripts", "generate-icons.mjs")]);
  chmodSync(launchScript, 0o755);

  const tmp = await mkdtemp(join(tmpdir(), "pi-web-app-"));
  try {
    const appleScriptPath = join(tmp, "PiWeb.applescript");
    writeFileSync(appleScriptPath, [
      "on run",
      `  do shell script "\\"${quoteAppleScriptString(launchScript)}\\" >/tmp/pi-web-launcher.log 2>&1 &"`,
      "end run",
      "",
    ].join("\n"));

    mkdirSync(dirname(appPath), { recursive: true });
    rmSync(appPath, { recursive: true, force: true });
    run("osacompile", ["-o", appPath, appleScriptPath]);

    const resourcesDir = join(appPath, "Contents", "Resources");
    copyFileSync(icnsPath, join(resourcesDir, "applet.icns"));

    const plist = join(appPath, "Contents", "Info.plist");
    plistBuddySetOrAdd(plist, "CFBundleName", "Pi Web");
    plistBuddySetOrAdd(plist, "CFBundleDisplayName", "Pi Web");
    plistBuddySetOrAdd(plist, "CFBundleIconFile", "applet");

    console.log(`Installed launcher: ${appPath}`);
    console.log("Click it to start Pi Web locally and open it in Chrome app mode.");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
