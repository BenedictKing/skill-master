import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource } from './git-source.js';
import type { SkillSource } from '../types/index.js';

/**
 * package.json `skills` field — declarative skill dependencies.
 *
 * ```json
 * {
 *   "skills": {
 *     "my-skill": "npm:some-pkg",
 *     "multi": "npm:@scope/pkg/inner-skill",
 *     "from-git": "owner/repo",
 *     "pinned": "owner/repo#v1.2.0"
 *   }
 * }
 * ```
 *
 * `npm:` entries resolve against the installed node_modules (the package must
 * already be a dependency); git entries reuse the normal git source pipeline.
 * A `#ref` suffix on a git entry pins the branch/tag.
 */

export interface SkillsFieldEntry {
  /** Key in the skills object; selects a sub-skill for multi-skill packages */
  declaredName: string;
  /** Raw value as written in package.json */
  raw: string;
  /** Resolved skill directory for npm: entries (undefined for git entries) */
  localDir?: string;
  /** Install source (local for npm: entries, git otherwise) */
  source: SkillSource;
  /** Value written to the lock `source` field */
  lockSource: string;
}

export interface SkillsFieldResult {
  entries: SkillsFieldEntry[];
  errors: Array<{ name: string; raw: string; message: string }>;
}

/** Validate and normalize the raw `skills` field value into name → spec pairs */
export function parseSkillsFieldField(raw: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (raw === undefined || raw === null) return result;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('package.json "skills" field must be an object of { "skill-name": "source" }');
  }
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`package.json "skills" entry "${name}" must be a non-empty string`);
    }
    result.set(name, value.trim());
  }
  return result;
}

/** Locate the SKILL.md directory inside an installed package (root, skills/, dist/skills/) */
export function findSkillDirInPackage(pkgDir: string, declaredName?: string): string | null {
  if (existsSync(join(pkgDir, 'SKILL.md'))) {
    return pkgDir;
  }

  const candidates: string[] = [];
  for (const sub of ['skills', join('dist', 'skills')]) {
    const subDir = join(pkgDir, sub);
    if (!existsSync(subDir)) continue;
    for (const entry of readdirSync(subDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(subDir, entry.name, 'SKILL.md'))) {
        candidates.push(join(subDir, entry.name));
      }
    }
  }

  if (declaredName) {
    const match = candidates.find((dir) => dir.split('/').pop() === declaredName);
    if (match) return match;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  return null;
}

/** Read package.json workspaces globs (string[] or { packages: [] }) */
export function readWorkspaces(cwd: string): string[] {
  const pkgJson = readPackageJson(cwd);
  if (!pkgJson) return [];
  const raw = pkgJson.workspaces;
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (raw && typeof raw === 'object' && Array.isArray((raw as { packages?: unknown }).packages)) {
    return ((raw as { packages: unknown[] }).packages).filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function readPackageJson(cwd: string): Record<string, unknown> | null {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Minimal glob → RegExp for workspace patterns (* and ** only, no braces) */
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Walk directories under base matching the remaining glob segments, collecting relative paths */
function walkRel(base: string, relPrefix: string, segs: string[], results: string[]): void {
  if (segs.length === 0) {
    results.push(relPrefix);
    return;
  }
  const [head, ...rest] = segs;
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return;
  }
  const matcher = head.includes('*') ? globToRegExp(head) : null;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (head === '**') {
      walkRel(join(base, entry.name), rel, segs, results);
    } else {
      const matches = matcher ? matcher.test(entry.name) : entry.name === head;
      if (matches) walkRel(join(base, entry.name), rel, rest, results);
    }
  }
  if (head === '**') {
    // ** also matches zero segments
    walkRel(base, relPrefix, rest, results);
  }
}

/** List workspace package directories matching the workspaces globs */
export function listWorkspaceDirs(cwd: string): string[] {
  const dirs: string[] = [];
  for (const glob of readWorkspaces(cwd)) {
    const normalized = glob.replace(/\/+$/, '');
    if (normalized === '') continue;
    const pattern = globToRegExp(normalized);
    const rels: string[] = [];
    walkRel(cwd, '', normalized.split('/'), rels);
    for (const rel of rels) {
      if (pattern.test(rel) && existsSync(join(cwd, rel, 'package.json'))) {
        dirs.push(join(cwd, rel));
      }
    }
  }
  return [...new Set(dirs)];
}

/**
 * Resolve the `skills` field of a project (and, with `recursive`, its workspaces)
 * into installable entries. npm: entries that are not installed yet, ambiguous
 * multi-skill packages, and unparsable git sources come back as errors.
 */
export function resolveSkillsField(cwd: string, recursive: boolean): SkillsFieldResult {
  const result: SkillsFieldResult = { entries: [], errors: [] };
  const seen = new Set<string>();

  const roots = [cwd];
  if (recursive) {
    for (const dir of listWorkspaceDirs(cwd)) roots.push(dir);
  }

  for (const root of roots) {
    const pkgJson = readPackageJson(root);
    if (!pkgJson) continue;
    let specs: Map<string, string>;
    try {
      specs = parseSkillsFieldField(pkgJson.skills);
    } catch (err) {
      result.errors.push({ name: join(root, 'package.json'), raw: 'skills', message: (err as Error).message });
      continue;
    }
    if (specs.size === 0) continue;

    for (const [name, raw] of specs) {
      if (seen.has(name)) continue;
      seen.add(name);
      result.entries.push(resolveEntry(cwd, name, raw, result.errors));
    }
  }

  return { entries: result.entries.filter((e) => e.localDir !== undefined || e.source.type === 'git'), errors: result.errors };
}

function resolveEntry(cwd: string, name: string, raw: string, errors: SkillsFieldResult['errors']): SkillsFieldEntry {
  if (raw.startsWith('npm:')) {
    const pkgPath = raw.slice(4).replace(/^\/+/, '');
    const pkgDir = join(cwd, 'node_modules', ...pkgPath.split('/'));
    const skillDir = findSkillDirInPackage(pkgDir, name);
    if (!skillDir) {
      if (!existsSync(pkgDir)) {
        errors.push({ name, raw, message: `package "${pkgPath}" is not installed — add it to your dependencies and install first` });
      } else {
        errors.push({ name, raw, message: `no SKILL.md found in "${pkgPath}" (root, skills/, dist/skills/)${name ? ` matching "${name}"` : ''}` });
      }
      return { declaredName: name, raw, source: { type: 'local', path: pkgDir }, lockSource: raw };
    }
    return {
      declaredName: name,
      raw,
      localDir: skillDir,
      source: { type: 'local', path: skillDir },
      lockSource: `npm:${pkgPath}`,
    };
  }

  // Git source with optional #ref pin
  const hashIdx = raw.lastIndexOf('#');
  const [sourcePart, ref] = hashIdx > 0 ? [raw.slice(0, hashIdx), raw.slice(hashIdx + 1)] : [raw, undefined];
  try {
    const parsed = parseSource(sourcePart);
    if (parsed.type !== 'git' || !parsed.url) {
      throw new Error(`not a git source (${parsed.type})`);
    }
    return {
      declaredName: name,
      raw,
      source: { type: 'git', url: parsed.url, branch: ref },
      lockSource: ref ? `${sourcePart}#${ref}` : sourcePart,
    };
  } catch (err) {
    errors.push({ name, raw, message: `cannot parse git source: ${(err as Error).message}` });
    return { declaredName: name, raw, source: { type: 'local', path: sourcePart }, lockSource: raw };
  }
}
