import type { VerifyJsonV1 } from '../types/contracts.js';
import { detectSkillConflicts } from '../verify/conflict-check.js';
import { runSmokeChecks } from '../verify/smoke.js';
import { verifyInstalledSkill } from '../verify/runtime-check.js';
import * as logger from '../utils/logger.js';

export async function verify(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const positional = args.filter((arg) => !arg.startsWith('-'));
  if (positional.length === 0) {
    console.log('Usage: skill-master verify <skill-name> [--json]');
    console.log('');
    console.log('Verify an installed skill after installation.');
    process.exit(0);
  }

  const skillName = positional[0];
  const baseReport = await verifyInstalledSkill(skillName, process.cwd());
  const conflicts = await detectSkillConflicts(skillName);
  const report = runSmokeChecks({
    ...baseReport,
    conflicts: [...baseReport.conflicts, ...conflicts],
  });

  if (json) {
    const output: VerifyJsonV1 = report;
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  logger.blank();
  logger.info(`Verification report for ${skillName}`);
  logger.kv('Env Status', report.envStatus);
  logger.kv('Structure Healthy', String(report.structureHealthy));
  logger.kv('Smoke Passed', String(report.smokePassed));
  logger.kv('Missing Env Keys', report.envMissingKeys.join(', ') || 'none');
  logger.kv('Conflicts', report.conflicts.join('; ') || 'none');

  for (const message of report.messages) {
    logger.kv(message.severity.toUpperCase(), message.message);
  }
  logger.blank();
}
