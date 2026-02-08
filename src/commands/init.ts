import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ensureDir, writeText } from '../utils/fs-helpers.js';
import * as logger from '../utils/logger.js';

const SKILL_MD_TEMPLATE = `---
name: {{NAME}}
version: 0.1.0
author: ""
description: ""
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - Glob
  - Grep
user-invocable: true
---

# {{NAME}}

<!-- Describe what this skill does -->
`;

/** init command — create a new skill template */
export async function init(args: string[]): Promise<void> {
  const nameArg = args.filter(a => !a.startsWith('-'))[0];
  const cwd = process.cwd();

  let targetDir: string;
  let skillName: string;

  if (nameArg) {
    targetDir = join(cwd, nameArg);
    skillName = nameArg;
  } else {
    targetDir = cwd;
    skillName = basename(cwd);
  }

  const skillMdPath = join(targetDir, 'SKILL.md');

  if (existsSync(skillMdPath)) {
    logger.error(`SKILL.md already exists at ${skillMdPath}`);
    process.exit(1);
  }

  await ensureDir(targetDir);

  const content = SKILL_MD_TEMPLATE
    .replace(/\{\{NAME\}\}/g, skillName);

  await writeText(skillMdPath, content);
  logger.success(`Created ${skillMdPath}`);
  logger.info(`Edit the file to configure your skill.`);
}
