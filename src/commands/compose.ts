import { join } from 'node:path';
import { composeSkills } from '../compose/generate.js';
import type { ComposeJsonV1 } from '../types/contracts.js';
import { mergeStrategyDescription } from '../compose/merge.js';
import { resolveComposeSource } from '../compose/resolve.js';
import * as logger from '../utils/logger.js';
import type { CompositionEnvVar } from '../types/index.js';

interface ComposeFlags {
  outputDir: string;
  task?: string;
  json: boolean;
  env: CompositionEnvVar[];
}

function parseEnvSpec(spec: string): CompositionEnvVar {
  const eqIndex = spec.indexOf('=');
  const key = (eqIndex === -1 ? spec : spec.slice(0, eqIndex)).trim();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env key: ${key}`);
  }

  return eqIndex === -1
    ? { key }
    : { key, value: spec.slice(eqIndex + 1) };
}

function parseComposeArgs(args: string[]): { sources: string[]; flags: ComposeFlags } {
  const flags: ComposeFlags = {
    outputDir: join(process.cwd(), 'generated-skill'),
    json: false,
    env: [],
  };
  const sources: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '-o' || arg === '--output') && args[i + 1]) {
      flags.outputDir = args[i + 1];
      i++;
      continue;
    }
    if (arg === '--task' && args[i + 1]) {
      flags.task = args[i + 1];
      i++;
      continue;
    }
    if (arg === '--env' && args[i + 1]) {
      flags.env.push(parseEnvSpec(args[i + 1]));
      i++;
      continue;
    }
    if (arg.startsWith('--env=')) {
      flags.env.push(parseEnvSpec(arg.slice('--env='.length)));
      continue;
    }
    if (arg === '--json') {
      flags.json = true;
      continue;
    }
    if (!arg.startsWith('-')) {
      sources.push(arg);
    }
  }

  return { sources, flags };
}

export async function compose(args: string[]): Promise<void> {
  const { sources, flags } = parseComposeArgs(args);
  if (sources.length === 0 && !flags.task) {
    console.log('Usage: skill-master compose <source...> [-o <dir>] [--task <task>] [--env KEY[=VALUE]] [--json]');
    console.log('');
    console.log('Compose or generate a new skill output directory.');
    process.exit(0);
  }

  const resolvedSources = [] as string[];
  for (const source of sources) {
    resolvedSources.push(await resolveComposeSource(source));
  }

  const result = await composeSkills({
    mode: resolvedSources.length > 1 ? 'merge' : resolvedSources.length === 1 ? 'adapt' : 'generate',
    task: flags.task,
    outputDir: flags.outputDir,
    sources: resolvedSources,
    sourceLabels: sources,
    env: flags.env,
  });

  if (flags.json) {
    const output: ComposeJsonV1 = {
      inputSources: sources,
      resolvedSources,
      result,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  logger.blank();
  logger.info(`Composed skill into ${result.outputDir}`);
  logger.kv('Files', result.files.join(', '));
  logger.kv('Sources', result.sources.join(', ') || 'task only');
  logger.kv('Strategy', mergeStrategyDescription(resolvedSources).join(' | '));
  logger.blank();
}
