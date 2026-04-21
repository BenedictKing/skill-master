import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRegistryEntry } from '../core/registry.js';
import { getEnvStatus } from '../core/env-manager.js';
import { readLocalLock, addSkillToLocalLock } from '../core/local-lock.js';
import type { VerificationReport } from '../types/index.js';

export async function verifyInstalledSkill(skillName: string, cwd: string): Promise<VerificationReport> {
  const entry = await getRegistryEntry(skillName);
  if (!entry) {
    throw new Error(`Skill \"${skillName}\" not found`);
  }

  const envStatus = await getEnvStatus(skillName, entry.env_keys);
  const envMissingKeys = envStatus === 'configured' ? [] : entry.env_keys;
  const conflicts: string[] = [];
  const messages = [] as VerificationReport['messages'];
  const dependencyWarnings: string[] = [];

  const lock = await readLocalLock(cwd);
  const siblingSkills = Object.keys(lock.skills).filter((name) => name !== skillName);
  if (siblingSkills.includes(skillName)) {
    conflicts.push('Duplicate skill name detected in lock file');
  }

  const skillDir = entry.canonical_path;
  const skillMdExists = existsSync(join(skillDir, 'SKILL.md'));
  if (!skillMdExists) {
    messages.push({ severity: 'error', message: 'SKILL.md is missing from canonical path' });
  } else {
    messages.push({ severity: 'info', message: 'SKILL.md exists in canonical path' });
  }

  if (entry.env_keys.length > 0 && envStatus !== 'configured') {
    messages.push({ severity: 'warning', message: `Environment configuration is ${envStatus}` });
  } else if (entry.env_keys.length > 0) {
    messages.push({ severity: 'info', message: 'Environment configuration looks complete' });
  } else {
    messages.push({ severity: 'info', message: 'Skill does not declare env keys' });
  }

  if (entry.capabilities.includes('shell')) {
    dependencyWarnings.push('Skill uses shell capability; runtime dependencies should be checked manually');
  }
  if (entry.capabilities.includes('web_search') || entry.capabilities.includes('web_fetch')) {
    dependencyWarnings.push('Skill uses web capabilities; network access and API credentials may be required');
  }

  const report: VerificationReport = {
    skillName,
    envStatus,
    envMissingKeys,
    dependencyWarnings,
    conflicts,
    messages,
    structureHealthy: skillMdExists,
    smokePassed: envStatus !== 'missing' && skillMdExists,
  };

  const lockEntry = lock.skills[skillName];
  if (lockEntry) {
    await addSkillToLocalLock(skillName, {
      ...lockEntry,
      verification: {
        checked_at: new Date().toISOString(),
        envStatus: report.envStatus,
        conflicts: report.conflicts,
        warnings: [
          ...report.messages.filter((m) => m.severity !== 'info').map((m) => m.message),
          ...report.dependencyWarnings,
        ],
        smokePassed: report.smokePassed,
      },
    }, cwd);
  }

  return report;
}
