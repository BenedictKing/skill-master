import { discoverCandidates } from '../discovery/search.js';
import * as logger from '../utils/logger.js';

/** find command — discover skills from multiple sources */
export async function find(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const query = args.filter(a => !a.startsWith('-')).join(' ').trim();

  if (!query) {
    console.log('Usage: skill-master find <query> [--json]');
    console.log('');
    console.log('Search and discover skills from multiple sources.');
    console.log('');
    console.log('Examples:');
    console.log('  skill-master find git');
    console.log('  skill-master find "code review"');
    process.exit(0);
  }

  if (!json) {
    logger.info(`Searching for "${query}"...`);
  }

  try {
    const candidates = await discoverCandidates(query, process.cwd());

    if (json) {
      console.log(JSON.stringify({ query, results: candidates }, null, 2));
      return;
    }

    if (candidates.length === 0) {
      logger.info('No skills found matching your query.');
      return;
    }

    logger.blank();
    logger.tableHeader('Name', 'Provider', 'Install Hint');

    for (const item of candidates.slice(0, 25)) {
      logger.tableRow(
        item.name ?? '—',
        item.provider ?? '—',
        item.installHint ?? item.source ?? '—',
      );
    }
    logger.blank();
  } catch (err) {
    logger.error(`Search failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
