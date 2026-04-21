import { discoverCandidates } from '../discovery/search.js';
import type { FindJsonV1 } from '../types/contracts.js';
import type { CandidateProvider, SkillCandidate } from '../types/index.js';
import * as logger from '../utils/logger.js';

interface FindFlags {
  json: boolean;
  provider?: CandidateProvider;
}

const MIN_NAME_WIDTH = 50;
const MIN_INSTALL_HINT_WIDTH = 80;
const MIN_PROVIDER_WIDTH = 12;

function padCell(value: string, width: number): string {
  return value.padEnd(width);
}

export function parseFindArgs(args: string[]): { query: string; flags: FindFlags } {
  const flags: FindFlags = { json: false };
  const words: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      flags.json = true;
      continue;
    }

    if (arg.startsWith('--provider=')) {
      flags.provider = arg.slice('--provider='.length) as CandidateProvider;
      continue;
    }

    if (arg === '--provider' && args[i + 1]) {
      flags.provider = args[i + 1] as CandidateProvider;
      i++;
      continue;
    }

    if (!arg.startsWith('-')) {
      words.push(arg);
    }
  }

  return {
    query: words.join(' ').trim(),
    flags,
  };
}

export function sortCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
  return [...candidates].sort((a, b) => {
    const installHintCompare = (a.installHint ?? a.source ?? '').localeCompare(b.installHint ?? b.source ?? '');
    if (installHintCompare !== 0) return installHintCompare;

    const nameCompare = (a.name ?? '').localeCompare(b.name ?? '');
    if (nameCompare !== 0) return nameCompare;

    return (a.provider ?? '').localeCompare(b.provider ?? '');
  });
}

function computeFindColumnWidths(candidates: SkillCandidate[]): { name: number; provider: number; installHint: number } {
  const visible = candidates.slice(0, 25);

  const name = Math.max(
    MIN_NAME_WIDTH,
    'Name'.length,
    ...visible.map((item) => (item.name ?? '—').length),
  );

  const provider = Math.max(
    MIN_PROVIDER_WIDTH,
    'Provider'.length,
    ...visible.map((item) => (item.provider ?? '—').length),
  );

  const installHint = Math.max(
    MIN_INSTALL_HINT_WIDTH,
    'Install Hint'.length,
    ...visible.map((item) => (item.installHint ?? item.source ?? '—').length),
  );

  return { name, provider, installHint };
}

function printFindResults(candidates: SkillCandidate[]): void {
  const visible = candidates.slice(0, 25);
  const widths = computeFindColumnWidths(visible);

  console.log('');
  console.log([
    padCell('Provider', widths.provider),
    padCell('Name', widths.name),
    padCell('Install Hint', widths.installHint),
  ].join(' | '));
  console.log([
    '-'.repeat(widths.provider),
    '-'.repeat(widths.name),
    '-'.repeat(widths.installHint),
  ].join('-|-'));

  for (const item of visible) {
    console.log([
      padCell(item.provider ?? '—', widths.provider),
      padCell(item.name ?? '—', widths.name),
      padCell(item.installHint ?? item.source ?? '—', widths.installHint),
    ].join(' | '));
  }

  console.log('');
}

/** find command — discover skills from multiple sources */
export async function find(args: string[]): Promise<void> {
  const { query, flags } = parseFindArgs(args);

  if (!query) {
    console.log('Usage: skill-master find <query> [--provider <provider>] [--json]');
    console.log('');
    console.log('Search and discover skills from multiple sources.');
    console.log('');
    console.log('Examples:');
    console.log('  skill-master find git');
    console.log('  skill-master find "code review"');
    console.log('  skill-master find "exa search" --provider gh-skill');
    process.exit(0);
  }

  if (!flags.json) {
    const providerSuffix = flags.provider ? ` (provider: ${flags.provider})` : '';
    logger.info(`Searching for "${query}"${providerSuffix}...`);
  }

  try {
    const candidates = await discoverCandidates(query, process.cwd());
    const filteredCandidates = flags.provider
      ? candidates.filter((candidate) => candidate.provider === flags.provider)
      : candidates;
    const sortedCandidates = sortCandidates(filteredCandidates);

    if (flags.json) {
      const output: FindJsonV1 = { query, results: sortedCandidates };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (sortedCandidates.length === 0) {
      logger.info('No skills found matching your query.');
      return;
    }

    printFindResults(sortedCandidates);
  } catch (err) {
    logger.error(`Search failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
