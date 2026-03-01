import { installSkill, sanitizeName } from '../core/installer.js';
import { cloneRepo, parseSource } from '../core/git-source.js';
import { readLocalLock, addSkillToLocalLock, computeSkillFolderHash } from '../core/local-lock.js';
import { discoverNodeModulesSkills, readSkillMd } from '../core/skill-parser.js';
import * as logger from '../utils/logger.js';
import { existsSync } from 'node:fs';

export interface RestoreFlags {
  help: boolean;
}

/** Parse flags for the restore command */
export function parseRestoreFlags(args: string[]): { flags: RestoreFlags } {
  const flags: RestoreFlags = { help: false };
  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      flags.help = true;
    }
  }
  return { flags };
}

function printRestoreHelp(): void {
  console.log('Usage: skill-master restore [options]');
  console.log('');
  console.log('Restore skills from skills-lock.json.');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help  Show this help message');
}


/** restore command — reinstall skills from skills-lock.json */
export async function restore(args: string[]): Promise<void> {
  const { flags } = parseRestoreFlags(args);

  if (flags.help) {
    printRestoreHelp();
    process.exit(0);
  }

  const cwd = process.cwd();
  const lock = await readLocalLock(cwd);
  const entries = Object.entries(lock.skills);

  if (entries.length === 0) {
    logger.info('No skills found in skills-lock.json. Nothing to restore.');
    return;
  }

  logger.info(`Restoring ${entries.length} skill(s) from skills-lock.json...`);
  logger.blank();

  // Group by sourceType
  const github: Array<[string, typeof lock.skills[string]]> = [];
  const nodeModules: Array<[string, typeof lock.skills[string]]> = [];
  const local: Array<[string, typeof lock.skills[string]]> = [];

  for (const [name, entry] of entries) {
    switch (entry.sourceType) {
      case 'github': github.push([name, entry]); break;
      case 'node_modules': nodeModules.push([name, entry]); break;
      case 'local': local.push([name, entry]); break;
    }
  }

  let installed = 0;
  let failed = 0;

  // Restore node_modules skills via discovery
  if (nodeModules.length > 0) {
    logger.info(`Syncing ${nodeModules.length} node_modules skill(s)...`);
    const nmSkillDirs = await discoverNodeModulesSkills(cwd);
    const nmMap = new Map<string, string>();
    for (const dir of nmSkillDirs) {
      const parsed = await readSkillMd(dir);
      if (parsed) nmMap.set(sanitizeName(parsed.frontmatter.name), dir);
    }


    for (const [name] of nodeModules) {
      const dir = nmMap.get(name);
      if (!dir) {
        logger.warn(`Skill "${name}" not found in node_modules — run npm install first`);
        failed++;
        continue;
      }
      try {
        const result = await installSkill({
          source: { type: 'local', path: dir },
          cwd,
          global: false,
          yes: true,
        });
        await addSkillToLocalLock(result.skillName, {
          source: dir,
          sourceType: 'node_modules',
          computedHash: await computeSkillFolderHash(result.canonicalPath),
        }, cwd);
        installed++;
      } catch (err) {
        logger.error(`Failed to restore "${name}": ${(err as Error).message}`);
        failed++;
      }
    }
  }

  // Restore github skills via clone
  for (const [name, entry] of github) {
    try {
      const parsed = parseSource(entry.source);
      if (parsed.type !== 'git' || !parsed.url) {
        logger.warn(`Invalid source for "${name}": ${entry.source}`);
        failed++;
        continue;
      }
      const sourceDir = await cloneRepo(parsed.url, parsed.ref);
      // Build skill path: start from repo root, apply subpath, then skillDir
      let skillPath = sourceDir;
      if (parsed.subpath) {
        skillPath = `${skillPath}/${parsed.subpath}`;
      }
      if (entry.skillDir) {
        skillPath = `${skillPath}/${entry.skillDir}`;
      }
      const result = await installSkill({
        source: { type: 'local', path: skillPath },
        cwd,
        global: false,
        yes: true,
      });
      await addSkillToLocalLock(result.skillName, {
        source: entry.source,
        sourceType: 'github',
        computedHash: await computeSkillFolderHash(result.canonicalPath),
        ...(entry.skillDir ? { skillDir: entry.skillDir } : {}),
        ...(entry.pluginName ? { pluginName: entry.pluginName } : {}),
      }, cwd);
      installed++;
    } catch (err) {
      logger.error(`Failed to restore "${name}": ${(err as Error).message}`);
      failed++;
    }
  }

  // Restore local skills
  for (const [name, entry] of local) {
    if (!existsSync(entry.source)) {
      logger.warn(`Local source not found for "${name}": ${entry.source}`);
      failed++;
      continue;
    }
    try {
      // Use skillDir to locate specific skill within multi-skill source
      const localPath = entry.skillDir
        ? `${entry.source}/${entry.skillDir}`
        : entry.source;
      const result = await installSkill({
        source: { type: 'local', path: localPath },
        cwd,
        global: false,
        yes: true,
      });
      await addSkillToLocalLock(result.skillName, {
        source: entry.source,
        sourceType: 'local',
        computedHash: await computeSkillFolderHash(result.canonicalPath),
        ...(entry.skillDir ? { skillDir: entry.skillDir } : {}),
        ...(entry.pluginName ? { pluginName: entry.pluginName } : {}),
      }, cwd);
      installed++;
    } catch (err) {
      logger.error(`Failed to restore "${name}": ${(err as Error).message}`);
      failed++;
    }
  }

  logger.blank();
  if (failed > 0) {
    logger.warn(`Restored ${installed} skill(s), ${failed} failed.`);
  } else {
    logger.success(`Restored ${installed} skill(s) successfully.`);
  }
}
