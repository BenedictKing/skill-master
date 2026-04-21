import { discoverNodeModulesSkills, readSkillMd } from '../../core/skill-parser.js';
import { envKeysFromDir, normalizeCandidate } from '../normalize.js';
import type { SkillCandidate } from '../../types/index.js';

export async function discoverFromNodeModules(cwd: string): Promise<SkillCandidate[]> {
  const skillDirs = await discoverNodeModulesSkills(cwd);
  const candidates: SkillCandidate[] = [];

  for (const dir of skillDirs) {
    const parsed = await readSkillMd(dir);
    const envKeys = await envKeysFromDir(dir);
    candidates.push(normalizeCandidate({
      provider: 'node_modules',
      source: dir,
      installHint: dir,
      path: dir,
      frontmatter: parsed?.frontmatter,
      envKeys,
    }));
  }

  return candidates;
}
