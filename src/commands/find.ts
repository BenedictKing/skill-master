import * as logger from '../utils/logger.js';

/** find command — search for skills from the registry */
export async function find(args: string[]): Promise<void> {
  const query = args.filter(a => !a.startsWith('-')).join(' ').trim();

  if (!query) {
    console.log('Usage: skill-master find <query>');
    console.log('');
    console.log('Search for skills in the online registry.');
    console.log('');
    console.log('Examples:');
    console.log('  skill-master find git');
    console.log('  skill-master find "code review"');
    process.exit(0);
  }

  logger.info(`Searching for "${query}"...`);

  try {
    const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.error(`Search API returned ${response.status}: ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json() as SearchResult[];

    if (!Array.isArray(data) || data.length === 0) {
      logger.info('No skills found matching your query.');
      return;
    }

    logger.blank();
    logger.tableHeader('Name', 'Source', 'Installs');

    for (const item of data) {
      logger.tableRow(
        item.name ?? '—',
        item.source ?? '—',
        String(item.installs ?? 0),
      );
    }
    logger.blank();
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      logger.error('Search request timed out. Please try again.');
    } else {
      logger.error(`Search failed: ${(err as Error).message}`);
    }
    process.exit(1);
  }
}

interface SearchResult {
  name?: string;
  source?: string;
  installs?: number;
}
