import { existsSync, readdirSync, readlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getAgentConfig, getInstallablePlatforms } from '../platform/agents.js';
import type { AgentPlatform } from '../types/index.js';
import { SKILLS_DIR } from '../utils/paths.js';

/** A symlink left behind in an agent skills dir whose target no longer exists */
export interface OrphanedSkillLink {
  agent: AgentPlatform;
  /** The agent skills dir (project-level or global) containing the link */
  agentDir: string;
  /** Full path of the dangling link */
  linkPath: string;
  /** The raw link target (already missing on disk) */
  target: string;
}

/**
 * Scan every known agent's skills dirs (project-level under cwd + global) for
 * dangling symlinks. Real directories and links whose target still exists are
 * never reported — only links that resolve to nothing.
 *
 * @param cwd project root used to resolve project-level skills dirs
 * @param name optional skill name filter
 */
export function findOrphanedSkillLinks(cwd: string, name?: string): OrphanedSkillLink[] {
  const results: OrphanedSkillLink[] = [];
  // canonical 存储里的条目是真实目录而非软链,跳过避免误报;同时用于目录去重
  const seenDirs = new Set<string>([resolve(SKILLS_DIR)]);

  for (const agent of getInstallablePlatforms()) {
    const config = getAgentConfig(agent);
    for (const dir of [join(cwd, config.skillsDir), config.globalSkillsDir]) {
      const key = resolve(dir);
      if (seenDirs.has(key)) continue;
      seenDirs.add(key);
      if (!existsSync(dir)) continue;

      for (const dirent of readdirSync(dir, { withFileTypes: true })) {
        if (!dirent.isSymbolicLink()) continue;
        if (name && dirent.name !== name) continue;
        const linkPath = join(dir, dirent.name);
        // existsSync 跟随软链:目标存在就不是悬空链,不属于本次清理范围
        if (existsSync(linkPath)) continue;
        results.push({ agent, agentDir: dir, linkPath, target: readlinkSync(linkPath) });
      }
    }
  }

  return results;
}
