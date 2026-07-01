#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const launcherScript = resolve(projectDir, "scripts", "launch-local-app.mjs");
const nodeExe = process.execPath;
const shortcutDir = process.env.PI_WEB_SHORTCUT_DIR
  || join(homedir(), "Desktop");
const iconPath = resolve(projectDir, "public", "favicon.ico");
const browserPreference = process.env.PI_WEB_BROWSER || "auto";
const startMenuDir = join(
  process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("Windows shortcut generation supports Windows only.");
  }
  if (!existsSync(launcherScript)) {
    throw new Error(`Missing launcher script: ${launcherScript}`);
  }
  if (!existsSync(iconPath)) {
    throw new Error(`Missing icon file: ${iconPath}`);
  }

  const preferredDir = existsSync(shortcutDir) ? shortcutDir : startMenuDir;
  mkdirSync(preferredDir, { recursive: true });
  const finalShortcutPath = resolve(preferredDir, "Pi Web.lnk");

  const tmp = await mkdtemp(join(tmpdir(), "pi-web-shortcut-"));
  try {
    const vbsPath = join(tmp, "create-shortcut.vbs");
    const script = [
      'Set shell = CreateObject("WScript.Shell")',
      `Set shortcut = shell.CreateShortcut("${finalShortcutPath.replaceAll("\\", "\\\\")}")`,
      `shortcut.TargetPath = "${nodeExe.replaceAll("\\", "\\\\")}"`,
      `shortcut.Arguments = "${launcherScript.replaceAll("\\", "\\\\")} --browser=${browserPreference}"`,
      `shortcut.WorkingDirectory = "${projectDir.replaceAll("\\", "\\\\")}"`,
      `shortcut.IconLocation = "${iconPath.replaceAll("\\", "\\\\")},0"`,
      'shortcut.Description = "Pi Web"',
      "shortcut.Save",
      "",
    ].join("\n");
    writeFileSync(vbsPath, script, "utf8");
    run("cscript.exe", ["//nologo", vbsPath]);
    console.log(`Installed launcher shortcut: ${finalShortcutPath}`);
    console.log("Click it to start Pi Web locally and open it in your browser.");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
