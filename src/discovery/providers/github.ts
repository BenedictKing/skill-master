import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cloneRepo, parseSource } from '../../core/git-source.js';
import { findAllSkillDirectories, findAllSkillDirectoriesWithPlugins, readSkillMd } from '../../core/skill-parser.js';
import { fetchAllWellKnownSkills, materializeWellKnownSkill } from '../../core/wellknown-source.js';
import { envKeysFromDir, normalizeCandidate } from '../normalize.js';
import type { ParsedSource, SkillCandidate } from '../../types/index.js';

async function discoverRemoteGitSource(source: string, parsed: ParsedSource): Promise<SkillCandidate[]> {
  const cloned = await cloneRepo(parsed.url!, parsed.ref);
  let baseDir = cloned;
  if (parsed.subpath && existsSync(join(cloned, parsed.subpath))) {
    baseDir = join(cloned, parsed.subpath);
  }

  const directories = await findAllSkillDirectories(baseDir);
  const targetDirs = directories.length > 0 ? directories : [baseDir];
  const candidates: SkillCandidate[] = [];

  for (const dir of targetDirs) {
    const parsedSkill = await readSkillMd(dir);
    if (!parsedSkill) continue;
    if (parsed.skillFilter && parsedSkill.frontmatter.name !== parsed.skillFilter) continue;
    const envKeys = await envKeysFromDir(dir);
    candidates.push(normalizeCandidate({
      provider: 'github',
      source,
      installHint: source,
      path: dir,
      frontmatter: parsedSkill.frontmatter,
      envKeys,
      parsedSource: parsed,
      warnings: ['Metadata derived from temporary clone of remote source'],
    }));
  }

  return candidates.length > 0 ? candidates : [
    {
      id: `github:${source}:${source}`,
      provider: 'github',
      name: parsed.skillFilter ?? source,
      source,
      installHint: source,
      description: 'Git source candidate (inspect to parse full metadata).',
      parsedSource: parsed,
      capabilities: [],
      allowedTools: [],
      envKeys: [],
      issues: [],
      warnings: ['Remote source was cloned but no SKILL.md metadata was found.'],
    },
  ];
}

export async function discoverFromSource(source: string, fullDepth = false): Promise<SkillCandidate[]> {
  const parsed = parseSource(source);
  if (parsed.type === 'local') {
    return discoverFromLocalPath(parsed.path!, fullDepth, source, parsed);
  }

  // well-known 端点：先尝试 well-known 发现，失败回退 git clone
  if (parsed.type === 'well-known') {
    try {
      let skills = await fetchAllWellKnownSkills(parsed.url!);
      if (skills.length > 0) {
        // 按 skillFilter 过滤，避免物化不相关的技能
        if (parsed.skillFilter) {
          const filtered = skills.filter(s => s.name === parsed.skillFilter || s.installName === parsed.skillFilter);
          if (filtered.length > 0) skills = filtered;
        }
        const candidates: SkillCandidate[] = [];
        for (const s of skills) {
          // 物化到临时目录，使 compose 等命令能读取实际文件
          const tempDir = await materializeWellKnownSkill(s);
          const parsedSkill = await readSkillMd(tempDir);
          candidates.push(normalizeCandidate({
            provider: 'well-known',
            source,
            installHint: source,
            path: tempDir,
            frontmatter: parsedSkill?.frontmatter ?? { name: s.name, description: s.installName ?? s.name },
            envKeys: parsedSkill ? await envKeysFromDir(tempDir) : [],
            parsedSource: parsed,
            warnings: ['Metadata from well-known discovery endpoint (materialized)'],
          }));
        }
        return candidates;
      }
    } catch { /* fall through to git clone */ }
  }

  return discoverRemoteGitSource(source, parsed);
}

export async function discoverFromLocalPath(
  dir: string,
  fullDepth = false,
  originalSource = dir,
  parsedSource?: ParsedSource,
): Promise<SkillCandidate[]> {
  const discovered = await findAllSkillDirectoriesWithPlugins(dir, fullDepth);
  const candidates: SkillCandidate[] = [];

  for (const item of discovered) {
    const parsed = await readSkillMd(item.path);
    const envKeys = await envKeysFromDir(item.path);
    candidates.push(normalizeCandidate({
      provider: item.pluginName ? 'plugin-manifest' : 'local',
      source: originalSource,
      installHint: parsed?.frontmatter.name ?? item.path,
      path: item.path,
      pluginName: item.pluginName,
      frontmatter: parsed?.frontmatter,
      envKeys,
      parsedSource,
    }));
  }

  return candidates;
}
