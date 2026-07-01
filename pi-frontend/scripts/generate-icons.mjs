#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { copyFile, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const sourceIcon = resolve(projectDir, "assets", "app-icon-source.png");
const generatedDir = resolve(projectDir, "assets", "generated");
const appFavicon = resolve(projectDir, "app", "favicon.ico");
const publicFavicon = resolve(projectDir, "public", "favicon.ico");

const pngTargets = [
  { size: 1024, paths: [resolve(projectDir, "public", "pi-web-app-icon.png"), resolve(projectDir, "app", "icon.png")] },
  { size: 512, paths: [resolve(projectDir, "public", "icon-512.png")] },
  { size: 192, paths: [resolve(projectDir, "public", "icon-192.png")] },
  { size: 180, paths: [resolve(projectDir, "app", "apple-icon.png")] },
];

const iconsetSizes = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

function requireCommand(command, hint) {
  const result = spawnSync("bash", ["-lc", `command -v ${command} >/dev/null`], { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} is required. ${hint}`);
}

async function resizePng(size, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  run("sips", ["-z", String(size), String(size), sourceIcon, "--out", outPath]);
}

async function main() {
  if (!existsSync(sourceIcon)) {
    throw new Error(`Missing source icon: ${sourceIcon}`);
  }
  requireCommand("sips", "Run this script on macOS, or replace it with an image resize tool available on your platform.");
  requireCommand("iconutil", "Run this script on macOS to generate the .icns launcher icon.");

  for (const target of pngTargets) {
    for (const outPath of target.paths) {
      await resizePng(target.size, outPath);
    }
  }

  const faviconScript = `
from PIL import Image
src = Image.open(${JSON.stringify(sourceIcon)}).convert("RGBA")
src.save(${JSON.stringify(appFavicon)}, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
src.save(${JSON.stringify(publicFavicon)}, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
`;
  run("python3", ["-c", faviconScript]);

  mkdirSync(generatedDir, { recursive: true });
  const tmp = await mkdtemp(join(tmpdir(), "pi-web-iconset-"));
  const iconsetDir = join(tmp, "PiWeb.iconset");
  mkdirSync(iconsetDir, { recursive: true });
  try {
    for (const [name, size] of iconsetSizes) {
      await resizePng(size, join(iconsetDir, name));
    }
    const icnsPath = join(generatedDir, "PiWeb.icns");
    rmSync(icnsPath, { force: true });
    run("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath]);
    await copyFile(icnsPath, resolve(projectDir, "public", "pi-web-app.icns"));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  await cp(sourceIcon, join(generatedDir, "app-icon-source.png"));
  console.log(`Generated web icons and macOS launcher icon from ${sourceIcon}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
