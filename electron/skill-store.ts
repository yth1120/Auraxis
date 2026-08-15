/**
 * skill-store.ts — 渐进式技能发现.
 *
 * Scans a skills root (userData/skills) for SKILL.md files (one level deep
 * by default), parses YAML-ish frontmatter, and serves model-invocable
 * summaries + full bodies. Keep the parser dependency-free and strict:
 * malformed files are skipped with a warning, never fatal.
 */
import { promises as fs } from 'fs';
import path from 'path';

export interface SkillMeta {
  name: string;
  description: string;
  whenToUse?: string;
  path: string;
  updatedAt: number;
}

export interface SkillDetail extends SkillMeta {
  body: string;
}

const SKILL_FILE = 'SKILL.md';
const MAX_SCAN_DEPTH = 2;

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  if (!raw.startsWith('---')) return { meta, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return { meta, body: raw };
  const head = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\n/, '');
  for (const line of head.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase().replace(/-/g, '_');
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (value) meta[key] = value;
  }
  return { meta, body };
}

function nameFromDir(filePath: string): string {
  const dir = path.basename(path.dirname(filePath));
  return dir === 'skills' ? path.basename(filePath, '.md') : dir;
}

async function walk(root: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(full, depth + 1, out);
    } else if (entry.isFile() && entry.name.toLowerCase() === SKILL_FILE.toLowerCase()) {
      out.push(full);
    }
  }
}

export async function ensureSkillsDirectory(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
}

/** List skill summaries. `complete` mirrors 技能发现契约. */
export async function listSkills(root: string): Promise<{ skills: SkillMeta[]; complete: boolean }> {
  const files: string[] = [];
  await walk(root, 1, files);
  const skills: SkillMeta[] = [];
  for (const file of files.sort()) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const { meta } = parseFrontmatter(raw);
      const stat = await fs.stat(file);
      skills.push({
        name: meta.name || nameFromDir(file),
        description: meta.description || '',
        whenToUse: meta.when_to_use,
        path: file,
        updatedAt: stat.mtimeMs,
      });
    } catch {
      // Skip unreadable/corrupt skills; keep discovery resilient.
    }
  }
  return { skills, complete: true };
}

export async function readSkill(root: string, name: string): Promise<SkillDetail | null> {
  const { skills } = await listSkills(root);
  const hit = skills.find((s) => s.name === name);
  if (!hit) return null;
  const raw = await fs.readFile(hit.path, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  return {
    ...hit,
    description: meta.description || hit.description,
    whenToUse: meta.when_to_use || hit.whenToUse,
    body: body.trim(),
  };
}

/**
 * Create or overwrite a skill. `name` becomes the skill directory (slugified,
 * path-traversal-proof); the file is `<root>/<slug>/SKILL.md`. If the content
 * has no frontmatter, a `name`/`description` header is prepended so the skill
 * is immediately discoverable by listSkills.
 */
export async function writeSkill(root: string, name: string, content: string): Promise<string> {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (!slug) throw new Error('技能名称无效');
  const dir = path.join(root, slug);
  await ensureSkillsDirectory(dir);
  const body = content.trim();
  const raw = body.startsWith('---')
    ? `${body}\n`
    : `---\nname: ${name.trim()}\ndescription: ${name.trim()} 技能\n---\n\n${body}\n`;
  const file = path.join(dir, SKILL_FILE);
  await fs.writeFile(file, raw, 'utf-8');
  return file;
}
