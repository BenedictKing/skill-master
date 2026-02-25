import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { readTextSafe } from '../utils/fs-helpers.js';
import { SkillParseError } from '../utils/errors.js';
import type { ParsedSkill, SkillFrontmatter, Capability } from '../types/index.js';

/** Tool-to-capability reverse mapping for Claude Code tools */
const TOOL_CAPABILITY_MAP: Record<string, Capability> = {
  'Bash': 'shell',
  'Read': 'read_file',
  'Write': 'write_file',
  'Edit': 'edit_file',
  'Glob': 'find_file',
  'Grep': 'search_content',
  'Task': 'sub_task',
  'WebFetch': 'web_fetch',
  'WebSearch': 'web_search',
};

/** Parse a SKILL.md file content into frontmatter + body */
export function parseSkillMd(content: string, dirName?: string): ParsedSkill {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new SkillParseError('No valid frontmatter block found');
  }

  const rawFrontmatter = match[1];
  const body = match[2];

  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = parseYaml(rawFrontmatter) as SkillFrontmatter;
  } catch (err) {
    throw new SkillParseError(`YAML parse error: ${(err as Error).message}`);
  }

  validateFrontmatter(frontmatter);

  // Infer name from directory if not provided in frontmatter
  if (!frontmatter.name && dirName) {
    frontmatter.name = dirName;
  }

  if (!frontmatter.name) {
    throw new SkillParseError('Missing "name" field and unable to infer from directory');
  }

  return { frontmatter, body, rawFrontmatter };
}

/** Validate required frontmatter fields */
export function validateFrontmatter(fm: SkillFrontmatter): void {
  if (fm.name !== undefined && typeof fm.name !== 'string') {
    throw new SkillParseError('Invalid "name" field — must be a string');
  }
  if (fm.version !== undefined && typeof fm.version !== 'string') {
    throw new SkillParseError('Invalid "version" field — must be a string');
  }
  if (fm['allowed-tools'] !== undefined && !Array.isArray(fm['allowed-tools'])) {
    throw new SkillParseError('Invalid "allowed-tools" field — must be an array');
  }
}

/** Infer abstract capabilities from allowed-tools list */
export function inferCapabilities(allowedTools: string[]): Capability[] {
  const caps = new Set<Capability>();
  for (const tool of allowedTools) {
    const cap = TOOL_CAPABILITY_MAP[tool];
    if (cap) {
      caps.add(cap);
    }
  }
  return [...caps];
}

/** Serialize a ParsedSkill back to SKILL.md format */
export function serializeSkillMd(parsed: ParsedSkill): string {
  const yamlStr = stringifyYaml(parsed.frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yamlStr}\n---\n${parsed.body}`;
}

/** Search for SKILL.md files within a directory (looks in .claude/skills/*) */
export async function findSkillDirectory(dir: string): Promise<string | null> {
  const dirs = await findAllSkillDirectories(dir);
  return dirs.length > 0 ? dirs[0] : null;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

/** Discover all directories containing SKILL.md within a source */
export async function findAllSkillDirectories(dir: string, fullDepth = false): Promise<string[]> {
  if (fullDepth) {
    const results = new Set<string>();
    await walkForSkills(dir, 0, 5, results);
    return [...results];
  }

  const results: string[] = [];

  // Direct SKILL.md in root
  if (existsSync(join(dir, 'SKILL.md'))) {
    results.push(dir);
    return results;
  }

  // Priority search: common skill directory conventions
  const seenPaths = new Set<string>();
  const priorityDirs = [
    join(dir, 'skills'),
    join(dir, 'skills', '.curated'),
    join(dir, 'skills', '.experimental'),
    join(dir, 'skills', '.system'),
    join(dir, '.agent', 'skills'),
    join(dir, '.agents', 'skills'),
    join(dir, '.claude', 'skills'),
    join(dir, '.cline', 'skills'),
    join(dir, '.codex', 'skills'),
    join(dir, '.github', 'skills'),
    join(dir, '.kiro', 'skills'),
    join(dir, '.opencode', 'skills'),
    join(dir, '.roo', 'skills'),
    join(dir, '.windsurf', 'skills'),
  ];

  for (const searchDir of priorityDirs) {
    try {
      const entries = await readdir(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = join(searchDir, entry.name);
          if (existsSync(join(skillDir, 'SKILL.md')) && !seenPaths.has(skillDir)) {
            results.push(skillDir);
            seenPaths.add(skillDir);
          }
        }
      }
    } catch {
      // directory doesn't exist, skip
    }
  }

  // Fallback: search up to 2 levels deep for SKILL.md (skip hidden dirs)
  if (results.length === 0) {
    try {
      const topEntries = await readdir(dir, { withFileTypes: true });
      for (const entry of topEntries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
          const subDir = join(dir, entry.name);
          if (existsSync(join(subDir, 'SKILL.md')) && !seenPaths.has(subDir)) {
            results.push(subDir);
            seenPaths.add(subDir);
          }
          try {
            const subEntries = await readdir(subDir, { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isDirectory() && !sub.name.startsWith('.') && !SKIP_DIRS.has(sub.name)) {
                const nested = join(subDir, sub.name);
                if (existsSync(join(nested, 'SKILL.md')) && !seenPaths.has(nested)) {
                  results.push(nested);
                  seenPaths.add(nested);
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return results;
}

/** Recursively walk directories up to maxDepth looking for SKILL.md */
async function walkForSkills(dir: string, depth: number, maxDepth: number, results: Set<string>): Promise<void> {
  if (depth > maxDepth) return;

  if (existsSync(join(dir, 'SKILL.md'))) {
    results.add(dir);
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
        await walkForSkills(join(dir, entry.name), depth + 1, maxDepth, results);
      }
    }
  } catch {
    // ignore permission errors etc.
  }
}

/** Read and parse a SKILL.md from a directory */
export async function readSkillMd(dir: string): Promise<ParsedSkill | null> {
  const content = await readTextSafe(join(dir, 'SKILL.md'));
  if (!content) return null;
  return parseSkillMd(content, basename(dir));
}

/** Extract env keys from a .env.example file */
export function extractEnvKeys(envExampleContent: string): string[] {
  const keys: string[] = [];
  for (const line of envExampleContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
      if (match) {
        keys.push(match[1]);
      }
    }
  }
  return keys;
}

/** Discover skills inside node_modules (top-level and scoped packages) */
export async function discoverNodeModulesSkills(cwd: string): Promise<string[]> {
  const nmDir = join(cwd, 'node_modules');
  if (!existsSync(nmDir)) return [];

  const results: string[] = [];

  try {
    const entries = await readdir(nmDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (entry.name.startsWith('@')) {
        // Scoped packages: scan @scope/*
        try {
          const scopeEntries = await readdir(join(nmDir, entry.name), { withFileTypes: true });
          for (const scopeEntry of scopeEntries) {
            if (scopeEntry.isDirectory()) {
              const pkgDir = join(nmDir, entry.name, scopeEntry.name);
              if (existsSync(join(pkgDir, 'SKILL.md'))) {
                results.push(pkgDir);
              }
            }
          }
        } catch {
          // ignore
        }
      } else if (!entry.name.startsWith('.')) {
        const pkgDir = join(nmDir, entry.name);
        if (existsSync(join(pkgDir, 'SKILL.md'))) {
          results.push(pkgDir);
        }
      }
    }
  } catch {
    // ignore
  }

  return results;
}
