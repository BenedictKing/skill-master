import { existsSync } from 'node:fs';
import { getRegistryEntry } from '../core/registry.js';
import { parseSource } from '../core/git-source.js';

export async function resolveComposeSource(input: string): Promise<string> {
  if (existsSync(input)) {
    return input;
  }

  const entry = await getRegistryEntry(input);
  if (entry) {
    return entry.canonical_path;
  }

  const parsed = parseSource(input);
  if (parsed.type === 'local' && parsed.path) {
    return parsed.path;
  }

  return input;
}
