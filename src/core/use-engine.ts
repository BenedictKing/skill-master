/**
 * `skills use` 核心引擎：不安装直接使用 skill。
 *
 * 把来源（git/well-known/local）物化到临时目录，读取 SKILL.md 构建注入 prompt，
 * 然后输出到 stdout 或启动目标 agent。绝不触碰 registry/lock/canonical path。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cloneRepo, parseSource } from './git-source.js';
import { tryBlobMaterialize } from './blob-source.js';
import { fetchAllWellKnownSkills, materializeWellKnownSkills } from './wellknown-source.js';
import { findAllSkillDirectoriesWithPlugins, readSkillMd } from './skill-parser.js';
import { removePath } from '../utils/fs-helpers.js';
import type { AgentPlatform } from '../platform/agents.js';

export interface UseOptions {
  /** --skill/-s：当来源含多个 skill 时单选 */
  skill?: string;
  /** --agent/-a：启动目标 agent（仅 claude-code/codex 有命令映射） */
  agent?: AgentPlatform;
  /** --full-depth：搜索所有子目录 */
  fullDepth?: boolean;
}

/** agent → 启动命令映射。仅支持可直接以 prompt 作为参数启动的 agent。 */
const USE_AGENT_COMMANDS: Partial<Record<AgentPlatform, { command: string; args?: string[] }>> = {
  'claude-code': { command: 'claude' },
  codex: { command: 'codex' },
};

/** 可被 use 启动的 agent 列表。 */
export function getLaunchableAgents(): AgentPlatform[] {
  return Object.keys(USE_AGENT_COMMANDS) as AgentPlatform[];
}

/**
 * 构建注入给 agent 的 prompt 文本。
 * 包含 SKILL.md 全文；若有支撑文件，附上支撑目录路径与相对路径读取说明。
 */
export function buildUsePrompt(input: {
  skillMd: string;
  supportDir?: string;
  hasSupportingFiles: boolean;
}): string {
  const parts = [
    'You are now operating with the following skill. Follow its instructions carefully.',
    '',
    '<skill>',
    input.skillMd.trim(),
    '</skill>',
  ];

  if (input.hasSupportingFiles && input.supportDir) {
    parts.push(
      '',
      `The skill ships supporting files under: ${input.supportDir}`,
      'When the skill references relative paths, resolve them against that directory and read the files as needed.',
    );
  }

  return parts.join('\n');
}

export interface MaterializedUseSkill {
  tempRoot: string;
  skillDir: string;
  skillMd: string;
  hasSupportingFiles: boolean;
}

/**
 * 解析来源并物化到临时目录，返回 SKILL.md 内容与支撑文件标记。
 * 复用 blob 快路径 / well-known / clone / 本地路径。临时目录由调用方负责清理。
 */
export async function materializeUseSkill(source: string, options: UseOptions = {}): Promise<MaterializedUseSkill> {
  const parsed = parseSource(source);
  let sourceDir: string;

  if (parsed.type === 'git') {
    sourceDir = await fetchGitSource(parsed.url!, parsed.ref, parsed.subpath, parsed.skillFilter ?? options.skill);
  } else if (parsed.type === 'well-known') {
    sourceDir = await fetchWellKnownSource(parsed.url!);
  } else {
    sourceDir = resolve(parsed.path!);
    if (!existsSync(sourceDir)) {
      throw new Error(`Local skill path not found: ${sourceDir}`);
    }
  }

  // 在来源中定位目标 skill 目录
  const skillDir = await selectSkillDir(sourceDir, options.skill ?? parsed.skillFilter, options.fullDepth ?? false);
  const parsedSkill = await readSkillMd(skillDir);
  if (!parsedSkill) {
    throw new Error(`Failed to parse SKILL.md in ${skillDir}`);
  }

  const skillMd = await readFile(join(skillDir, 'SKILL.md'), 'utf-8');
  const hasSupportingFiles = countSupportFiles(skillDir) > 0;

  return {
    tempRoot: sourceDir,
    skillDir,
    skillMd,
    hasSupportingFiles,
  };
}

/** git 来源：白名单先试 blob 快路径，失败回退 clone，再应用 subpath。 */
async function fetchGitSource(url: string, ref?: string, subpath?: string, skillFilter?: string): Promise<string> {
  const ownerRepo = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (ownerRepo) {
    const blob = await tryBlobMaterialize(`${ownerRepo[1]}/${ownerRepo[2]}`, { subpath, skillFilter, ref });
    if (blob) return blob.tempDir;
  }
  let dir = await cloneRepo(url, ref);
  if (subpath) {
    const sub = join(dir, subpath);
    if (existsSync(sub)) dir = sub;
  }
  return dir;
}

/** well-known 来源：抓取全部并物化到临时根；发现不到 skill 时回退 git clone（自托管 git 服务场景）。 */
async function fetchWellKnownSource(url: string): Promise<string> {
  const payloads = await fetchAllWellKnownSkills(url);
  if (payloads.length === 0) {
    // 自托管 HTTPS git 仓库可能被标记为 well-known，回退 clone
    return cloneRepo(url);
  }
  return materializeWellKnownSkills(payloads);
}

/** 在 sourceDir 中选择目标 skill 目录。 */
async function selectSkillDir(sourceDir: string, skill: string | undefined, fullDepth: boolean): Promise<string> {
  const discovered = await findAllSkillDirectoriesWithPlugins(sourceDir, fullDepth, false);
  if (discovered.length === 0) {
    throw new Error(`No SKILL.md found in ${sourceDir}`);
  }

  if (!skill) {
    if (discovered.length > 1) {
      const names = [];
      for (const { path } of discovered) {
        const p = await readSkillMd(path);
        if (p) names.push(p.frontmatter.name);
      }
      throw new Error(
        `Source contains ${discovered.length} skills. Select one with --skill. Available: ${names.join(', ')}`,
      );
    }
    return discovered[0]!.path;
  }

  const needle = skill.toLowerCase();
  for (const { path } of discovered) {
    const p = await readSkillMd(path);
    if (p && p.frontmatter.name.toLowerCase() === needle) return path;
  }
  const available = [];
  for (const { path } of discovered) {
    const p = await readSkillMd(path);
    if (p) available.push(p.frontmatter.name);
  }
  throw new Error(`Skill "${skill}" not found. Available: ${available.join(', ')}`);
}

/** 统计 skill 目录下除 SKILL.md 外的支撑文件数量。 */
function countSupportFiles(skillDir: string): number {
  try {
    return readdirSync(skillDir, { withFileTypes: true })
      .filter(e => e.name.toLowerCase() !== 'skill.md')
      .length;
  } catch {
    return 0;
  }
}

/** 交互式启动 agent，把 prompt 作为参数传入，继承 stdio。返回退出码。 */
export async function launchAgent(agent: AgentPlatform, prompt: string): Promise<number> {
  const config = USE_AGENT_COMMANDS[agent];
  if (!config) {
    throw new Error(
      `Agent "${agent}" cannot be launched by use. Supported: ${getLaunchableAgents().join(', ')}`,
    );
  }

  return new Promise((resolvePromise, reject) => {
    const child: ChildProcess = spawn(config.command, [...(config.args ?? []), prompt], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', code => resolvePromise(code ?? 0));
  });
}

/** 主编排：物化 → 构建 prompt → 输出或启动 agent。返回进程退出码。 */
export async function runUse(source: string, options: UseOptions = {}): Promise<number> {
  const isTempSource = parseSource(source).type !== 'local';
  let materialized: MaterializedUseSkill | undefined;

  try {
    materialized = await materializeUseSkill(source, options);

    const prompt = buildUsePrompt({
      skillMd: materialized.skillMd,
      supportDir: materialized.skillDir,
      hasSupportingFiles: materialized.hasSupportingFiles,
    });

    if (options.agent) {
      return await launchAgent(options.agent, prompt);
    }
    process.stdout.write(prompt + '\n');
    return 0;
  } finally {
    // 仅清理物化产生的临时目录（git/well-known 来源）；本地路径不删除
    if (isTempSource && materialized) {
      await removePath(materialized.tempRoot).catch(() => {});
    }
  }
}
