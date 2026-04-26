import { existsSync } from 'node:fs';
import { getRegistryEntry } from '../core/registry.js';
import { parseSource } from '../core/git-source.js';
import { discoverFromSource } from '../discovery/providers/github.js';

export async function resolveComposeSource(input: string): Promise<string> {
  if (existsSync(input)) {
    return input;
  }

  const entry = await getRegistryEntry(input);
  if (entry) {
    return entry.canonical_path;
  }

  const parsed = parseSource(input);
  if (parsed.type === 'local') {
    return parsed.path ?? input;
  }

  const candidates = await discoverFromSource(input).catch(() => []);
  const candidate = candidates.find((item) => item.path);
  if (candidate?.path) {
    return candidate.path;
  }

  return input;
}
