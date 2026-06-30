#!/usr/bin/env node
/**
 * Link frontend's @earendil-works/* deps to the locally built packages in
 * ../pi-backend/packages so backend changes can be tested without publishing.
 *
 * This is a temporary local-dev bridge. Before releasing pi-web, the backend
 * packages must be published and this link must be removed (the frontend should
 * consume them from the registry like any other dependency).
 */
import { rmSync, symlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(__dirname, "..");
const backendDir = resolve(frontendDir, "..", "pi-backend", "packages");

const links = [
  { name: "@earendil-works/pi-coding-agent", target: "coding-agent" },
  { name: "@earendil-works/pi-ai", target: "ai" },
];

for (const { name, target } of links) {
  const targetPath = resolve(backendDir, target);
  if (!existsSync(targetPath)) {
    console.error(`Missing local backend package: ${targetPath}`);
    process.exit(1);
  }

  const linkPath = resolve(frontendDir, "node_modules", name);
  console.log(`Linking ${name} -> ${targetPath}`);
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(targetPath, linkPath, "dir");
}

console.log("Done. Run `npm run build` in pi-backend after any backend change.");
