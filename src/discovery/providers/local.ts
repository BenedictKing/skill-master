import { getPluginGroupings } from '../../core/plugin-manifest.js';
import { readSkillMd } from '../../core/skill-parser.js';
import { envKeysFromDir, normalizeCandidate, unique } from '../normalize.js';
import type { SkillCandidate } from '../../types/index.js';

export async function discoverFromPluginManifest(root: string): Promise<SkillCandidate[]> {
  const groupings = await getPluginGroupings(root);
  const byPath = unique([...groupings.keys()]);
  const candidates: SkillCandidate[] = [];

  for (const resolvedPath of byPath) {
    const parsed = await readSkillMd(resolvedPath);
    const envKeys = await envKeysFromDir(resolvedPath);
    candidates.push(normalizeCandidate({
      provider: 'plugin-manifest',
      source: root,
      installHint: resolvedPath,
      path: resolvedPath,
      pluginName: groupings.get(resolvedPath),
      frontmatter: parsed?.frontmatter,
      envKeys,
    }));
  }

  return candidates;
}
