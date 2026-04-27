import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { readTextSafe, writeText } from '../utils/fs-helpers.js';
import { getSkillConfigPath, getSkillCanonicalPath } from '../utils/paths.js';
import * as logger from '../utils/logger.js';
import type { EnvStatus } from '../types/index.js';

export interface EnvSourceSnapshot {
  data: Record<string, string>;
  mtimeMs: number;
  priority: number;
}

/** Parse a .env file content into key-value pairs */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** Serialize key-value pairs back to .env format */
export function serializeEnv(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';
}

function parseEnvTemplateLine(line: string): { key: string; commented: boolean } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const commented = trimmed.startsWith('#');
  const candidate = commented ? trimmed.slice(1).trim() : trimmed;
  const match = candidate.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^"'#\s]*)\s*$/,
  );
  if (!match) {
    return null;
  }

  return { key: match[1], commented };
}

/**
 * Merge env records from multiple sources.
 * Non-empty values always beat empty values. Conflicting non-empty values prefer
 * the most recently modified source, with location order only used as a tie-breaker.
 */
export function mergeEnvRecords(
  sources: EnvSourceSnapshot[],
): Record<string, string> {
  const merged = new Map<string, { value: string; mtimeMs: number; priority: number }>();

  for (const source of sources) {
    for (const [key, value] of Object.entries(source.data)) {
      const current = merged.get(key);

      if (!current) {
        merged.set(key, {
          value,
          mtimeMs: source.mtimeMs,
          priority: source.priority,
        });
        continue;
      }

      const currentIsEmpty = current.value === '';
      const nextIsEmpty = value === '';

      if (currentIsEmpty !== nextIsEmpty) {
        if (!nextIsEmpty) {
          merged.set(key, {
            value,
            mtimeMs: source.mtimeMs,
            priority: source.priority,
          });
        }
        continue;
      }

      if (current.value === value) {
        continue;
      }

      if (source.mtimeMs > current.mtimeMs ||
        (source.mtimeMs === current.mtimeMs && source.priority < current.priority)) {
        merged.set(key, {
          value,
          mtimeMs: source.mtimeMs,
          priority: source.priority,
        });
      }
    }
  }

  return Object.fromEntries(
    [...merged.entries()].map(([key, snapshot]) => [key, snapshot.value]),
  );
}

/** Read and merge .env content from multiple locations by priority. */
export async function backupEnvFromLocations(
  locations: string[],
): Promise<Record<string, string> | null> {
  const seen = new Set<string>();
  const sources: EnvSourceSnapshot[] = [];
  let preferredSourcePath: string | undefined;
  let preferredSourceMtime = -1;
  let preferredSourcePriority = Number.MAX_SAFE_INTEGER;

  for (const [priority, loc] of locations.entries()) {
    if (seen.has(loc)) continue;
    seen.add(loc);

    const content = await readTextSafe(loc);
    if (!content) continue;

    const data = parseEnvFile(content);
    if (Object.keys(data).length === 0) continue;

    let mtimeMs = 0;
    try {
      mtimeMs = (await stat(loc)).mtimeMs;
    } catch {
      mtimeMs = 0;
    }

    if (mtimeMs > preferredSourceMtime ||
      (mtimeMs === preferredSourceMtime && priority < preferredSourcePriority)) {
      preferredSourcePath = loc;
      preferredSourceMtime = mtimeMs;
      preferredSourcePriority = priority;
    }

    sources.push({ data, mtimeMs, priority });
  }

  if (sources.length === 0) {
    return null;
  }

  if (preferredSourcePath) {
    logger.debug(`Backed up .env from ${preferredSourcePath}`);
  }

  return mergeEnvRecords(sources);
}

/**
 * Backup .env for a skill, searching multiple locations by priority:
 * 1. ~/.agents/config/<skill>/.env (persistent)
 * 2. agentSkillDir/.env (current agent dir, e.g. .claude/skills/<skill>)
 * 3. ~/.agents/skills/<skill>/.env (canonical)
 * When locations disagree, newer files win; location order breaks ties.
 */
export async function backupEnv(
  skillName: string,
  agentSkillDir?: string,
): Promise<Record<string, string> | null> {
  return backupEnvFromLocations([
    join(getSkillConfigPath(skillName), '.env'),
    ...(agentSkillDir ? [join(agentSkillDir, '.env')] : []),
    join(getSkillCanonicalPath(skillName), '.env'),
  ]);
}

/**
 * Restore .env to both persistent and skill directory locations.
 * Merges with .env.example if present.
 */
export async function restoreEnv(
  skillName: string,
  envData: Record<string, string>,
  skillDir: string,
): Promise<void> {
  // Read .env.example from skill dir if exists
  const exampleContent = await readTextSafe(join(skillDir, '.env.example'));
  let finalContent: string;

  if (exampleContent) {
    finalContent = mergeEnv(envData, exampleContent);
  } else {
    finalContent = serializeEnv(envData);
  }

  // Write to persistent config location
  const configEnvPath = join(getSkillConfigPath(skillName), '.env');
  await writeText(configEnvPath, finalContent);

  // Write to skill directory (for compatibility with loadApiKey)
  const skillEnvPath = join(skillDir, '.env');
  await writeText(skillEnvPath, finalContent);

  logger.debug(`Restored .env to ${configEnvPath} and ${skillEnvPath}`);
}

/**
 * Merge existing env data with .env.example template.
 * - The skill's .env.example is the canonical template
 * - Non-empty existing values override template values
 * - Extra custom keys missing from the template are preserved at the end
 */
export function mergeEnv(
  existing: Record<string, string>,
  exampleContent: string,
): string {
  const lines: string[] = [];
  const usedKeys = new Set<string>();

  for (const line of exampleContent.split('\n')) {
    const parsed = parseEnvTemplateLine(line);
    if (!parsed) {
      lines.push(line);
      continue;
    }

    usedKeys.add(parsed.key);
    const customValue = existing[parsed.key];
    if (customValue !== undefined && customValue !== '') {
      lines.push(`${parsed.key}=${customValue}`);
      continue;
    }

    lines.push(line);
  }

  const extraKeys = Object.entries(existing)
    .filter(([key, value]) => !usedKeys.has(key) && value !== '');

  if (extraKeys.length > 0) {
    lines.push('');
    lines.push('# Preserved custom keys not present in this skill version:');
    for (const [key, value] of extraKeys) {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join('\n').replace(/\n*$/, '\n');
}

/** Check the .env configuration status for a skill */
export async function getEnvStatus(
  skillName: string,
  requiredKeys: string[],
): Promise<EnvStatus> {
  if (requiredKeys.length === 0) return 'configured';

  const configEnvPath = join(getSkillConfigPath(skillName), '.env');
  const content = await readTextSafe(configEnvPath);

  if (!content) return 'missing';

  const data = parseEnvFile(content);
  const configuredKeys = Object.entries(data)
    .filter(([, v]) => v && !v.includes('your_') && !v.includes('_here'))
    .map(([k]) => k);

  const allConfigured = requiredKeys.every(k => configuredKeys.includes(k));
  const someConfigured = requiredKeys.some(k => configuredKeys.includes(k));

  if (allConfigured) return 'configured';
  if (someConfigured) return 'partial';
  return 'missing';
}

/** Set a single env value for a skill */
export async function setEnvValue(
  skillName: string,
  key: string,
  value: string,
  skillDir?: string,
): Promise<void> {
  const configEnvPath = join(getSkillConfigPath(skillName), '.env');
  const content = await readTextSafe(configEnvPath);
  const data = content ? parseEnvFile(content) : {};
  const resolvedSkillDir = skillDir ?? getSkillCanonicalPath(skillName);
  const exampleContent = await readTextSafe(join(resolvedSkillDir, '.env.example'));

  data[key] = value;
  const newContent = exampleContent
    ? mergeEnv(data, exampleContent)
    : serializeEnv(data);

  // Write to persistent location
  await writeText(configEnvPath, newContent);

  // Sync to skill directory if provided
  if (skillDir) {
    await writeText(join(skillDir, '.env'), newContent);
  }
}

/** Get the .env file path for editing */
export function getEnvEditPath(skillName: string): string {
  return join(getSkillConfigPath(skillName), '.env');
}
