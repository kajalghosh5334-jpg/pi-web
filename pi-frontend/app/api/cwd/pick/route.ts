import { NextResponse } from "next/server";
import { statSync, type Stats } from "fs";
import { homedir } from "os";
import { isAbsolute, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { allowFileRoot } from "@/lib/file-access";

const execFileAsync = promisify(execFile);

function normalizeCwd(cwd: string): string {
  if (cwd === "~") return homedir();
  if (cwd.startsWith("~/")) return resolve(homedir(), cwd.slice(2));
  return isAbsolute(cwd) ? cwd : resolve(cwd);
}

async function pickDirectory(): Promise<string | null> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("osascript", [
        "-e",
        'POSIX path of (choose folder with prompt "Select project folder")',
      ]);
      const path = stdout.trim();
      return path || null;
    } catch (error) {
      const message = String(error);
      if (message.includes("User canceled")) return null;
      throw error;
    }
  }

  throw new Error(`Native folder picker is not supported on ${process.platform} yet`);
}

export async function POST() {
  try {
    const picked = await pickDirectory();
    if (!picked) {
      return NextResponse.json({ cancelled: true });
    }

    const cwd = normalizeCwd(picked);
    let stat: Stats;
    try {
      stat = statSync(cwd);
    } catch {
      return NextResponse.json({ error: `Directory does not exist: ${picked}` }, { status: 400 });
    }

    if (!stat.isDirectory()) {
      return NextResponse.json({ error: `Path is not a directory: ${picked}` }, { status: 400 });
    }

    allowFileRoot(cwd);
    return NextResponse.json({ cwd });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
