import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readTextSafe, writeText, ensureDir } from '../utils/fs-helpers.js';
import { getSkillConfigPath, getSkillCanonicalPath } from '../utils/paths.js';
import * as logger from '../utils/logger.js';
import type { EnvStatus } from '../types/index.js';

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

/**
 * Backup .env for a skill, searching multiple locations by priority:
 * 1. ~/.agents/config/<skill>/.env (persistent)
 * 2. agentSkillDir/.env (current agent dir, e.g. .claude/skills/<skill>)
 * 3. ~/.agents/skills/<skill>/.env (canonical)
 */
export async function backupEnv(
  skillName: string,
  agentSkillDir?: string,
): Promise<Record<string, string> | null> {
  const locations = [
    join(getSkillConfigPath(skillName), '.env'),
    ...(agentSkillDir ? [join(agentSkillDir, '.env')] : []),
    join(getSkillCanonicalPath(skillName), '.env'),
  ];

  for (const loc of locations) {
    const content = await readTextSafe(loc);
    if (content) {
      const data = parseEnvFile(content);
      if (Object.keys(data).length > 0) {
        logger.debug(`Backed up .env from ${loc}`);
        return data;
      }
    }
  }

  return null;
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
 * - Existing keys are NEVER overwritten
 * - New keys from example are appended with empty values and comments
 */
export function mergeEnv(
  existing: Record<string, string>,
  exampleContent: string,
): string {
  const lines: string[] = [];
  const usedKeys = new Set<string>();

  // First, write all existing keys
  for (const [key, value] of Object.entries(existing)) {
    lines.push(`${key}=${value}`);
    usedKeys.add(key);
  }

  // Then, append new keys from example
  const exampleKeys = parseEnvFile(exampleContent);
  const newKeys = Object.keys(exampleKeys).filter(k => !usedKeys.has(k));

  if (newKeys.length > 0) {
    lines.push('');
    lines.push('# New keys added by skill update (please configure):');
    for (const key of newKeys) {
      lines.push(`# ${key}=`);
    }
  }

  return lines.join('\n') + '\n';
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

  data[key] = value;
  const newContent = serializeEnv(data);

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
