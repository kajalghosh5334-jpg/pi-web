import { NextResponse } from "next/server";
import { readFile, rm, stat, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";

export const dynamic = "force-dynamic";

interface SkillResponseItem {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
  sourceInfo?: {
    path?: string;
    source?: string;
    scope?: string;
    origin?: string;
    baseDir?: string;
  };
}

function normalizeContent(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitFrontmatter(raw: string): { hasFrontmatter: boolean; frontmatter: string; body: string } {
  const content = normalizeContent(raw);
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { hasFrontmatter: false, frontmatter: "", body: content };
  }
  return {
    hasFrontmatter: true,
    frontmatter: match[1],
    body: content.slice(match[0].length),
  };
}

function setDisableModelInvocation(raw: string, disabled: boolean): string {
  const { hasFrontmatter, frontmatter, body } = splitFrontmatter(raw);
  const lines = (hasFrontmatter ? frontmatter.split("\n") : []).filter((line) => !/^disable-model-invocation\s*:/.test(line.trim()));

  if (disabled) {
    lines.push("disable-model-invocation: true");
  }

  if (!hasFrontmatter) {
    if (!disabled) return normalizeContent(raw);
    return `---\ndisable-model-invocation: true\n---\n${body.replace(/^\n+/, "")}`;
  }

  const nextFrontmatter = lines.join("\n");
  return nextFrontmatter.trim().length > 0
    ? `---\n${nextFrontmatter}\n---\n${body.replace(/^\n+/, "")}`
    : body;
}

function isUnderPath(target: string, root: string): boolean {
  const normalizedTarget = resolve(target);
  const normalizedRoot = resolve(root);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function mapSkill(skill: {
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation?: boolean;
  sourceInfo?: { path?: string; source?: string; scope?: string; origin?: string; baseDir?: string };
}): SkillResponseItem {
  return {
    name: skill.name,
    description: skill.description,
    filePath: skill.filePath,
    baseDir: skill.sourceInfo?.baseDir ?? "",
    disableModelInvocation: skill.disableModelInvocation === true,
    sourceInfo: skill.sourceInfo,
  };
}

export async function GET(req: Request) {
  try {
    const cwd = new URL(req.url).searchParams.get("cwd") || process.cwd();
    const cwdStat = await stat(cwd).catch(() => null);
    if (!cwdStat) {
      return NextResponse.json({ skills: [], error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }
    if (!cwdStat.isDirectory()) {
      return NextResponse.json({ skills: [], error: `Not a directory: ${cwd}` }, { status: 400 });
    }

    const loader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    const fatal = diagnostics.find((d) => d.type === "error");

    return NextResponse.json({
      skills: skills.map(mapSkill),
      ...(fatal && skills.length === 0 ? { error: fatal.message } : {}),
    });
  } catch (error) {
    return NextResponse.json({ skills: [], error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { filePath, disableModelInvocation } = await req.json() as { filePath?: string; disableModelInvocation?: unknown };
    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json({ error: "filePath is required" }, { status: 400 });
    }
    if (typeof disableModelInvocation !== "boolean") {
      return NextResponse.json({ error: "disableModelInvocation must be boolean" }, { status: 400 });
    }

    const info = await stat(filePath).catch(() => null);
    if (!info) {
      return NextResponse.json({ error: `Skill file does not exist: ${filePath}` }, { status: 404 });
    }
    if (!info.isFile()) {
      return NextResponse.json({ error: `Not a file: ${filePath}` }, { status: 400 });
    }

    const raw = await readFile(filePath, "utf-8");
    await writeFile(filePath, setDisableModelInvocation(raw, disableModelInvocation), "utf-8");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { filePath, baseDir } = await req.json() as { filePath?: string; baseDir?: string };
    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json({ error: "filePath is required" }, { status: 400 });
    }

    const skillFile = resolve(filePath);
    const info = await stat(skillFile).catch(() => null);
    if (!info) {
      return NextResponse.json({ error: `Skill file does not exist: ${filePath}` }, { status: 404 });
    }
    if (!info.isFile()) {
      return NextResponse.json({ error: `Not a file: ${filePath}` }, { status: 400 });
    }

    const allowedRoots = [
      baseDir,
      `${getAgentDir()}/skills`,
    ].filter((value): value is string => Boolean(value)).map((value) => resolve(value));

    if (!allowedRoots.some((root) => isUnderPath(skillFile, root))) {
      return NextResponse.json({ error: "Refusing to delete skill outside known skill roots" }, { status: 400 });
    }

    const deleteTarget = skillFile.endsWith("/SKILL.md") ? dirname(skillFile) : skillFile;
    if (deleteTarget === resolve(baseDir || "") || deleteTarget === resolve(`${getAgentDir()}/skills`)) {
      return NextResponse.json({ error: "Refusing to delete the entire skills root" }, { status: 400 });
    }

    await rm(deleteTarget, { recursive: true, force: true });
    return NextResponse.json({ success: true, deleted: deleteTarget });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
