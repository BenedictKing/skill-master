import { join, resolve } from 'node:path';
import { readTextSafe } from '../utils/fs-helpers.js';
import { inferCapabilities, extractEnvKeys } from '../core/skill-parser.js';
import type { CandidateProvider, Capability, ParsedSource, SkillCandidate, SkillFrontmatter } from '../types/index.js';

export interface NormalizeCandidateParams {
  provider: CandidateProvider;
  source: string;
  installHint: string;
  path?: string;
  pluginName?: string;
  frontmatter?: SkillFrontmatter;
  envKeys?: string[];
  parsedSource?: ParsedSource;
  warnings?: string[];
  installs?: number;
  description?: string;
  version?: string;
  author?: string;
  providerMeta?: Record<string, string | number | boolean | null>;
  installed?: boolean;
}

export function buildCandidateId(provider: CandidateProvider, source: string, name: string): string {
  return `${provider}:${source}:${name}`;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function inferCapabilitiesFromFrontmatter(frontmatter?: SkillFrontmatter): Capability[] {
  if (!frontmatter) return [];
  if (frontmatter.capabilities && frontmatter.capabilities.length > 0) {
    return [...frontmatter.capabilities];
  }
  return inferCapabilities(frontmatter['allowed-tools'] ?? []);
}

export async function envKeysFromDir(dir: string): Promise<string[]> {
  const envExample = await readTextSafe(join(dir, '.env.example'));
  return envExample ? extractEnvKeys(envExample) : [];
}

export function normalizeCandidate(params: NormalizeCandidateParams): SkillCandidate {
  const allowedTools = params.frontmatter?.['allowed-tools'] ?? [];
  const capabilities = inferCapabilitiesFromFrontmatter(params.frontmatter);
  const name = params.frontmatter?.name ?? params.installHint;
  return {
    id: buildCandidateId(params.provider, params.source, name),
    provider: params.provider,
    name,
    source: params.source,
    installHint: params.installHint,
    description: params.description ?? params.frontmatter?.description,
    version: params.version ?? params.frontmatter?.version,
    author: params.author ?? params.frontmatter?.author,
    path: params.path ? resolve(params.path) : undefined,
    pluginName: params.pluginName,
    frontmatter: params.frontmatter,
    parsedSource: params.parsedSource,
    capabilities,
    allowedTools,
    envKeys: params.envKeys ?? [],
    issues: [],
    warnings: params.warnings ?? [],
    installs: params.installs,
    providerMeta: params.providerMeta,
    installed: params.installed,
  };
}
