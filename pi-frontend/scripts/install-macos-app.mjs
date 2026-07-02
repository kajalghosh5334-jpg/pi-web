#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execPath } from "node:process";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const launchScript = resolve(projectDir, "scripts", "launch-local-app.mjs");
const appPath = resolve(process.env.PI_WEB_APP_PATH || join(homedir(), "Desktop", "Pi Web.app"));
const icnsPath = resolve(projectDir, "assets", "generated", "PiWeb.icns");
const executableName = "PiWeb";
const browserPreference = process.env.PI_WEB_BROWSER || "auto";
const port = process.env.PI_WEB_PORT || "30141";
const host = process.env.PI_WEB_HOST || "127.0.0.1";
const url = `http://${host}:${port}/`;

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
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

  mkdirSync(dirname(appPath), { recursive: true });
  rmSync(appPath, { recursive: true, force: true });
  const contentsDir = join(appPath, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  const resourcesDir = join(contentsDir, "Resources");
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });

  const executablePath = join(macosDir, executableName);
  writeFileSync(executablePath, [
    "#!/bin/sh",
    "set -eu",
    `NODE_BIN=${JSON.stringify(process.env.PI_WEB_NODE || execPath)}`,
    `LAUNCHER=${JSON.stringify(launchScript)}`,
    `BROWSER_ARG=${JSON.stringify(`--browser=${browserPreference}`)}`,
    `APP_URL=${JSON.stringify(url)}`,
    'LOG_DIR="${PI_WEB_LOG_DIR:-$HOME/Library/Logs/Pi Web}"',
    'mkdir -p "$LOG_DIR"',
    'LOG_FILE="$LOG_DIR/pi-web-launcher.log"',
    'echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) clicked Pi Web launcher" >>"$LOG_FILE"',
    'echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) target $APP_URL" >>"$LOG_FILE"',
    '"$NODE_BIN" "$LAUNCHER" "$BROWSER_ARG" >>"$LOG_FILE" 2>&1 &',
    "exit 0",
    "",
  ].join("\n"));
  chmodSync(executablePath, 0o755);

  writeFileSync(join(contentsDir, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Pi Web</string>
  <key>CFBundleDisplayName</key>
  <string>Pi Web</string>
  <key>CFBundleIdentifier</key>
  <string>com.pi.web</string>
  <key>CFBundleExecutable</key>
  <string>${executableName}</string>
  <key>CFBundleIconFile</key>
  <string>applet</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleSignature</key>
  <string>PiWB</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`);
  writeFileSync(join(contentsDir, "PkgInfo"), "APPLPiWB");

  copyFileSync(icnsPath, join(resourcesDir, "applet.icns"));

  const plist = join(appPath, "Contents", "Info.plist");
  plistBuddySetOrAdd(plist, "CFBundleName", "Pi Web");
  plistBuddySetOrAdd(plist, "CFBundleDisplayName", "Pi Web");
  plistBuddySetOrAdd(plist, "CFBundleIconFile", "applet");

  console.log(`Installed launcher: ${appPath}`);
  console.log("Click it to start Pi Web locally and open it in your browser.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
