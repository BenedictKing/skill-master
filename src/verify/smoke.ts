import type { VerificationReport } from '../types/index.js';

export function runSmokeChecks(report: VerificationReport): VerificationReport {
  const smokePassed = report.structureHealthy && report.conflicts.length === 0 && report.envStatus !== 'missing';
  return {
    ...report,
    smokePassed,
    messages: [
      ...report.messages,
      {
        severity: smokePassed ? 'info' : 'warning',
        message: smokePassed ? 'Smoke checks passed' : 'Smoke checks found follow-up work',
      },
    ],
  };
}
