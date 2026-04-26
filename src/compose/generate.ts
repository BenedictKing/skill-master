import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { readSkillMd, serializeSkillMd } from '../core/skill-parser.js';
import { writeText } from '../utils/fs-helpers.js';
import type { CompositionEnvVar, CompositionRequest, CompositionResult, ParsedSkill, SkillFrontmatter } from '../types/index.js';
import { buildAttributionLines } from './attribution.js';
import { mergeBodies, mergeFrontmatter, mergeStrategyDescription } from './merge.js';

type CompositionStrategy = 'openai-image-api';

const OPENAI_IMAGE_API_SCRIPT = `#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..');

function parseEnv(content) {
  const data = {};
  for (const line of content.split('\\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

async function loadSkillEnv() {
  const envPath = path.join(skillRoot, '.env');
  if (!existsSync(envPath)) return;
  const values = parseEnv(await readFile(envPath, 'utf-8'));
  for (const [key, value] of Object.entries(values)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index !== -1) {
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(\`\${name} requires a value\`);
    return value;
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const VALUE_ARGS = new Set([
  '--base-url',
  '--extra-json',
  '--model',
  '--output',
  '--prompt',
  '--protocol',
  '--quality',
  '--size',
]);

function collectPositionalPrompt() {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (VALUE_ARGS.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    values.push(arg);
  }
  return values.join(' ');
}

function normalizeProtocol(value) {
  const normalized = String(value || 'openai_images').trim().toLowerCase().replace(/-/g, '_');
  if (['image', 'images', 'openai_images'].includes(normalized)) return 'openai_images';
  if (['chat', 'chat_completions', 'openai_chat'].includes(normalized)) return 'openai_chat';
  throw new Error(\`Unsupported OPENAI_IMAGE_PROTOCOL: \${value}. Use openai_images or openai_chat.\`);
}

function parseJsonObject(value, source) {
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(\`\${source} must be a JSON object\`);
  }
  return parsed;
}

function endpointPath(protocol) {
  return protocol === 'openai_chat' ? '/chat/completions' : '/images/generations';
}

function buildRequestBody({ protocol, model, prompt, size, quality, extraParams }) {
  if (protocol === 'openai_chat') {
    return {
      model,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
      ...extraParams,
    };
  }

  const body = { model, prompt };
  if (size) body.size = size;
  if (quality) body.quality = quality;
  return { ...body, ...extraParams };
}

function decodeBase64Image(value, mimeType = 'image/png') {
  return { bytes: Buffer.from(value, 'base64'), mimeType };
}

function decodeDataUrl(value) {
  if (!value.startsWith('data:') || !value.includes(';base64,')) return undefined;
  const [header, data] = value.split(',', 2);
  const mimeType = header.replace(/^data:/, '').split(';', 1)[0] || 'image/png';
  return decodeBase64Image(data, mimeType);
}

function extractMarkdownImageUrl(text) {
  const match = text.match(/!\\[[^\\]]*\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)/);
  return match?.[1];
}

function addImageUrl(value, images) {
  if (typeof value !== 'string' || !value) return;
  const decoded = decodeDataUrl(value);
  images.push(decoded || { url: value });
}

function addImageObject(value, images) {
  if (!value || typeof value !== 'object') return;
  const imageBase64 = value.b64_json || value.image_base64;
  if (typeof imageBase64 === 'string' && imageBase64) {
    images.push(decodeBase64Image(imageBase64, value.mime_type || value.mimeType || 'image/png'));
  }
  if (typeof value.url === 'string') addImageUrl(value.url, images);
  if (value.image_url && typeof value.image_url.url === 'string') addImageUrl(value.image_url.url, images);
  if (typeof value.image_url === 'string') addImageUrl(value.image_url, images);
  if (value.image && typeof value.image === 'object') addImageObject(value.image, images);
}

function collectImages(protocol, payload) {
  if (protocol === 'openai_images') {
    return Array.isArray(payload.data)
      ? payload.data.flatMap((item) => {
          const images = [];
          addImageObject(item, images);
          return images;
        })
      : [];
  }

  const message = Array.isArray(payload.choices) ? payload.choices[0]?.message : undefined;
  const images = [];
  if (!message || typeof message !== 'object') return images;
  if (typeof message.content === 'string') addImageUrl(extractMarkdownImageUrl(message.content), images);
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      addImageObject(part, images);
      if (part && typeof part.text === 'string') addImageUrl(extractMarkdownImageUrl(part.text), images);
    }
  }
  if (Array.isArray(message.images)) {
    for (const image of message.images) addImageObject(image, images);
  }
  return images;
}

async function resolveImageBytes(image) {
  if (image.bytes) return image;
  if (!image.url) throw new Error('Image response item has neither bytes nor url');
  const response = await fetch(image.url);
  if (!response.ok) throw new Error(\`Failed to download image URL: HTTP \${response.status}\`);
  const contentType = response.headers?.get?.('content-type') || 'image/png';
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType.split(';', 1)[0].trim() || 'image/png',
  };
}

function extensionForMimeType(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('jpeg')) return '.jpg';
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('webp')) return '.webp';
  if (normalized.includes('gif')) return '.gif';
  return '.bin';
}

function printHelp() {
  console.log(\`Usage:
  node scripts/gpt-image-2-api.mjs --prompt "image prompt" [--output ./out] [--size 1024x1024] [--protocol openai_images|openai_chat]

Environment:
  OPENAI_API_KEY      API key for the OpenAI-compatible endpoint
  OPENAI_BASE_URL     Base URL, for example http://localhost:3688/v1
  OPENAI_IMAGE_MODEL  Image model, defaults to gpt-image-2
  OPENAI_IMAGE_PROTOCOL  openai_images or openai_chat, defaults to openai_images
  OPENAI_IMAGE_EXTRA_JSON  Optional JSON object merged into the request body
\`);
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp();
    return;
  }

  await loadSkillEnv();

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = readArg('--base-url', process.env.OPENAI_BASE_URL || 'http://localhost:3688/v1').replace(/\\/+$/, '');
  const model = readArg('--model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
  const protocol = normalizeProtocol(readArg('--protocol', process.env.OPENAI_IMAGE_PROTOCOL || 'openai_images'));
  const prompt = readArg('--prompt', collectPositionalPrompt()).trim();
  const size = readArg('--size', process.env.OPENAI_IMAGE_SIZE || '1024x1024');
  const quality = readArg('--quality', process.env.OPENAI_IMAGE_QUALITY);
  const extraParams = parseJsonObject(readArg('--extra-json', process.env.OPENAI_IMAGE_EXTRA_JSON), 'OPENAI_IMAGE_EXTRA_JSON');
  const outputDir = path.resolve(readArg('--output', process.cwd()));

  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  if (!prompt) throw new Error('Prompt is required. Use --prompt "..."');

  const body = buildRequestBody({ protocol, model, prompt, size, quality, extraParams });

  const response = await fetch(\`\${baseUrl}\${endpointPath(protocol)}\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(\`Image API failed with HTTP \${response.status}: \${text}\`);
  }

  const payload = JSON.parse(text);
  await mkdir(outputDir, { recursive: true });
  const saved = [];
  const images = collectImages(protocol, payload);

  for (const [index, image] of images.entries()) {
    const resolved = await resolveImageBytes(image);
    const filePath = path.join(outputDir, \`gpt-image-2-\${Date.now()}-\${index + 1}\${extensionForMimeType(resolved.mimeType)}\`);
    await writeFile(filePath, resolved.bytes);
    saved.push(filePath);
  }

  if (saved.length === 0) {
    const jsonPath = path.join(outputDir, \`gpt-image-2-\${Date.now()}.json\`);
    await writeFile(jsonPath, JSON.stringify(payload, null, 2));
    saved.push(jsonPath);
  }

  console.log(JSON.stringify({ files: saved }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;

function buildGeneratedDescription(task?: string): string {
  if (task) return normalizeSkillDescription(task);
  return 'Perform the requested workflow using the selected references and bundled resources. Use when the user asks for this generated skill by name or describes the target workflow.';
}

function normalizeSkillDescription(value: string): string {
  return value
    .replace(/^\s*(基于参考技能|基於參考技能|融合一个|融合一個|融合|创建一个|创建|建立一个|建立|生成一个|生成)[，,：:\s]*/u, '')
    .replace(/\bmerge\b|\bcompose\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildGeneratedBody(name: string, task?: string): string {
  return [
    `# ${name}`,
    '',
    '## Purpose',
    buildGeneratedDescription(task),
    '',
    '## Suggested Workflow',
    '1. Inspect the current repo or inputs',
    '2. Execute the task with the minimum necessary tools',
    '3. Report findings clearly and concisely',
  ].join('\n');
}

function buildOpenAIImageDescription(): string {
  return 'Generate images with gpt-image-2 through a third-party OpenAI-compatible API using .env-configured OPENAI_API_KEY and OPENAI_BASE_URL values. Use when the user asks to create images, visual assets, illustrations, or image variations with a configurable API endpoint.';
}

function buildOpenAIImageApiBody(name: string): string {
  return [
    `# ${name}`,
    '',
    '## Purpose',
    buildOpenAIImageDescription(),
    '',
    '## Configuration',
    'Require `.env` values managed by `skill-master env set`:',
    '',
    '- `OPENAI_API_KEY`: API key for the third-party endpoint',
    '- `OPENAI_BASE_URL`: OpenAI-compatible base URL, for example `http://localhost:3688/v1`',
    '- `OPENAI_IMAGE_MODEL`: image model name, defaults to `gpt-image-2`',
    '- `OPENAI_IMAGE_PROTOCOL`: `openai_images` or `openai_chat`, defaults to `openai_images`',
    '- `OPENAI_IMAGE_SIZE`: image size for `openai_images`, defaults to `1024x1024`',
    '- `OPENAI_IMAGE_QUALITY`: optional image quality for `openai_images`',
    '- `OPENAI_IMAGE_EXTRA_JSON`: optional JSON object merged into the request body',
    '',
    '## Workflow',
    '1. Confirm `.env` is configured before making API calls.',
    '2. Use `scripts/gpt-image-2-api.mjs` for text-to-image requests.',
    '3. Use `OPENAI_IMAGE_PROTOCOL=openai_images` for `/images/generations`; use `OPENAI_IMAGE_PROTOCOL=openai_chat` for `/chat/completions`.',
    '4. Save generated files under the user requested output directory, or the current working directory when unspecified.',
    '5. Report saved file paths and any API errors exactly.',
    '',
    '## Available Scripts',
    '',
    '- `scripts/gpt-image-2-api.mjs` — Sends a text prompt to the configured OpenAI-compatible image generation endpoint and saves returned images.',
    '',
    '## Generate Image',
    '',
    '```bash',
    'node scripts/gpt-image-2-api.mjs --prompt "a concise image prompt" --output ./generated-images --size 1024x1024',
    '```',
    '',
    'Use `--base-url`, `--model`, `--protocol`, `--size`, `--quality`, and `--extra-json` only when the user or endpoint requires overrides.',
    '',
    '```bash',
    'OPENAI_IMAGE_PROTOCOL=openai_chat node scripts/gpt-image-2-api.mjs --prompt "a concise image prompt" --output ./generated-images',
    '```',
  ].join('\n');
}

function buildReadme(name: string, sources: string[], task?: string): string {
  return [
    `# ${name}`,
    '',
    'Generated by `skill-master compose`.',
    '',
    '## Task',
    task ?? 'Not provided',
    '',
    '## Sources',
    ...(sources.length > 0 ? sources.map((source) => `- ${source}`) : ['- Generated from task only']),
    '',
    '## Notes',
    '- Review `SKILL.md` before installation',
    '- Review `ATTRIBUTION.md` for provenance',
    '- Add supporting files if the merged skill requires scripts or templates',
    '',
  ].join('\n');
}

function buildSuggestedConfig(frontmatterAllowedTools: string[], envKeys: string[]): string {
  return [
    '# Suggested Configuration',
    '',
    `Allowed tools: ${frontmatterAllowedTools.length > 0 ? frontmatterAllowedTools.join(', ') : 'none declared'}`,
    `Environment keys: ${envKeys.length > 0 ? envKeys.join(', ') : 'none'}`,
    '',
    'Review and adapt these settings for your target agent runtime.',
    '',
  ].join('\n');
}

function defaultEnvForStrategy(strategy?: CompositionStrategy): CompositionEnvVar[] {
  if (strategy !== 'openai-image-api') return [];
  return [
    { key: 'OPENAI_API_KEY' },
    { key: 'OPENAI_BASE_URL', value: 'http://localhost:3688/v1' },
    { key: 'OPENAI_IMAGE_MODEL', value: 'gpt-image-2' },
    { key: 'OPENAI_IMAGE_PROTOCOL', value: 'openai_images' },
    { key: 'OPENAI_IMAGE_SIZE', value: '1024x1024' },
    { key: 'OPENAI_IMAGE_QUALITY' },
    { key: 'OPENAI_IMAGE_EXTRA_JSON' },
  ];
}

function inferStrategyFromTask(task?: string): CompositionStrategy | undefined {
  if (!task) return undefined;
  const normalized = task.toLowerCase();
  const mentionsImageModel = normalized.includes('gpt-image-2') || normalized.includes('gpt image 2');
  const mentionsImage = normalized.includes('image') || normalized.includes('图片') || normalized.includes('图像');
  const mentionsApi = normalized.includes('api') || normalized.includes('base url') || normalized.includes('baseurl') || normalized.includes('第三方');

  return mentionsImageModel && mentionsImage && mentionsApi ? 'openai-image-api' : undefined;
}

function inferEnvFromTask(task?: string): CompositionEnvVar[] {
  if (!task) return [];
  const env: CompositionEnvVar[] = [];
  const baseUrlMatch = task.match(/https?:\/\/[^\s，,。"'`]+/i);
  if (baseUrlMatch) {
    env.push({ key: 'OPENAI_BASE_URL', value: baseUrlMatch[0] });
  }
  return env;
}

function mergeEnvVars(defaults: CompositionEnvVar[], overrides: CompositionEnvVar[]): CompositionEnvVar[] {
  const merged = new Map<string, CompositionEnvVar>();
  for (const item of defaults) merged.set(item.key, item);
  for (const item of overrides) merged.set(item.key, item);
  return [...merged.values()];
}

function buildEnvExample(env: CompositionEnvVar[]): string {
  return env.map((item) => `${item.key}=${item.value ?? ''}`).join('\n') + '\n';
}

function applyStrategyFrontmatter(
  frontmatter: SkillFrontmatter,
  strategy: CompositionStrategy | undefined,
  task?: string,
): SkillFrontmatter {
  if (strategy !== 'openai-image-api') {
    return {
      name: frontmatter.name,
      description: buildGeneratedDescription(frontmatter.description ?? task),
      ...(frontmatter['allowed-tools'] && frontmatter['allowed-tools'].length > 0 ? { 'allowed-tools': frontmatter['allowed-tools'] } : {}),
    };
  }

  const allowedTools = [...new Set([...(frontmatter['allowed-tools'] ?? []), 'Bash', 'Read', 'Write'])];
  return {
    name: frontmatter.name,
    description: buildOpenAIImageDescription(),
    'allowed-tools': allowedTools,
  };
}

export async function composeSkills(request: CompositionRequest): Promise<CompositionResult> {
  await mkdir(request.outputDir, { recursive: true });
  const sourceDirs = request.sources ?? [];
  const sourceLabels = request.sourceLabels ?? sourceDirs;
  const parsed: ParsedSkill[] = [];
  const strategy = inferStrategyFromTask(request.task);

  for (const source of sourceDirs) {
    const skill = await readSkillMd(source);
    if (skill) parsed.push(skill);
  }

  const skillName = basename(request.outputDir);
  const baseFrontmatter = parsed.length > 0
    ? mergeFrontmatter(parsed, skillName)
    : {
        name: skillName,
        description: buildGeneratedDescription(request.task),
        'allowed-tools': [],
      };
  const frontmatter = applyStrategyFrontmatter(baseFrontmatter, strategy, request.task);

  const body = strategy === 'openai-image-api'
    ? buildOpenAIImageApiBody(frontmatter.name)
    : parsed.length > 0
    ? mergeBodies(parsed)
    : buildGeneratedBody(frontmatter.name, request.task);

  const skillMd = serializeSkillMd({
    frontmatter,
    body,
    rawFrontmatter: '',
  });

  const readmePath = join(request.outputDir, 'README.md');
  const attributionPath = join(request.outputDir, 'ATTRIBUTION.md');
  const configPath = join(request.outputDir, 'SUGGESTED_CONFIG.md');
  const sourcesPath = join(request.outputDir, 'SOURCES.md');
  const skillPath = join(request.outputDir, 'SKILL.md');
  const scriptPath = join(request.outputDir, 'scripts', 'gpt-image-2-api.mjs');
  const env = mergeEnvVars(
    defaultEnvForStrategy(strategy),
    [...inferEnvFromTask(request.task), ...(request.env ?? [])],
  );
  const envPath = join(request.outputDir, '.env.example');

  await writeText(skillPath, skillMd);
  await writeText(readmePath, buildReadme(frontmatter.name, sourceLabels, request.task));
  await writeText(attributionPath, ['# Attribution', '', ...buildAttributionLines(sourceLabels), ''].join('\n'));
  await writeText(
    configPath,
    buildSuggestedConfig(frontmatter['allowed-tools'] ?? [], env.map((item) => item.key)),
  );
  await writeText(
    sourcesPath,
    ['# Sources', '', ...(sourceLabels.length > 0 ? sourceLabels.map((source) => `- ${source}`) : ['- Generated from task only'])].join('\n') + '\n',
  );
  if (env.length > 0) {
    await writeText(envPath, buildEnvExample(env));
  }
  if (strategy === 'openai-image-api') {
    await mkdir(join(request.outputDir, 'scripts'), { recursive: true });
    await writeText(scriptPath, OPENAI_IMAGE_API_SCRIPT);
  }

  return {
    outputDir: request.outputDir,
    files: [
      skillPath,
      readmePath,
      attributionPath,
      configPath,
      sourcesPath,
      ...(env.length > 0 ? [envPath] : []),
      ...(strategy === 'openai-image-api' ? [scriptPath] : []),
    ],
    summary: [
      `Mode: ${request.mode}`,
      `Sources: ${sourceDirs.length}`,
      ...(strategy ? [`Detected strategy: ${strategy}`] : []),
      ...(env.length > 0 ? [`Env keys: ${env.map((item) => item.key).join(', ')}`] : []),
      ...mergeStrategyDescription(sourceDirs.map((source) => basename(source))),
      `Output: ${request.outputDir}`,
    ],
    sources: sourceLabels,
  };
}
