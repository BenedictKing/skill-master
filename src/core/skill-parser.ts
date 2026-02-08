import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
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
export function parseSkillMd(content: string): ParsedSkill {
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

  return { frontmatter, body, rawFrontmatter };
}

/** Validate required frontmatter fields */
export function validateFrontmatter(fm: SkillFrontmatter): void {
  if (!fm.name || typeof fm.name !== 'string') {
    throw new SkillParseError('Missing or invalid "name" field');
  }
  if (!fm.version || typeof fm.version !== 'string') {
    throw new SkillParseError('Missing or invalid "version" field');
  }
  if (!Array.isArray(fm['allowed-tools']) || fm['allowed-tools'].length === 0) {
    throw new SkillParseError('Missing or empty "allowed-tools" field');
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
  // Direct SKILL.md in root
  if (existsSync(join(dir, 'SKILL.md'))) {
    return dir;
  }

  // Search in .claude/skills/*/SKILL.md
  const skillsRoot = join(dir, '.claude', 'skills');
  if (!existsSync(skillsRoot)) {
    return null;
  }

  try {
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = join(skillsRoot, entry.name, 'SKILL.md');
        if (existsSync(skillMdPath)) {
          return join(skillsRoot, entry.name);
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

/** Read and parse a SKILL.md from a directory */
export async function readSkillMd(dir: string): Promise<ParsedSkill | null> {
  const content = await readTextSafe(join(dir, 'SKILL.md'));
  if (!content) return null;
  return parseSkillMd(content);
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
