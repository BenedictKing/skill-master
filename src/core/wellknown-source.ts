/**
 * Well-known skills 发现（RFC 8615）。
 *
 * 支持两种 index 格式：
 * - v0.2.0：$schema + type/url/digest 单 artifact 模型（skill-md 或 zip/tar.gz 归档）
 * - v0.1.0（legacy）：name/description/files[] 目录模型
 *
 * 产物统一物化到临时目录，复用现有磁盘发现逻辑（findAllSkillDirectoriesWithPlugins），
 * 与 blob-source 保持同一范式。归档解压做路径穿越/symlink/大小多重防护。
 */
import { createHash } from 'node:crypto';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createTempDir } from '../utils/fs-helpers.js';
import { parseSkillMd } from './skill-parser.js';
import * as logger from '../utils/logger.js';

const DISCOVERY_SCHEMA_V2 = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const MAX_ARCHIVE_UNPACKED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 1000;
/** artifact 下载字节上限：略大于解压上限，给压缩包留余量，同时阻断超大响应 OOM。 */
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
/** legacy v1 单文件大小上限 */
const MAX_LEGACY_FILE_BYTES = 10 * 1024 * 1024;
/** legacy v1 支撑文件最大数量 */
const MAX_LEGACY_FILES = 50;
/** legacy v1 并发下载上限 */
const LEGACY_CONCURRENCY = 5;
const FETCH_TIMEOUT = 10_000;

const WELL_KNOWN_PATHS = ['.well-known/agent-skills', '.well-known/skills'] as const;
const INDEX_FILE = 'index.json';

export type WellKnownFileContent = string | Uint8Array;

/** 归一化后的 index 条目（v1/v2 统一视图）。 */
export type NormalizedWellKnownEntry =
  | { version: '0.1.0'; name: string; description: string; files: string[]; skillBaseUrl: string }
  | { version: '0.2.0'; name: string; description: string; type: 'skill-md' | 'archive'; artifactUrl: string; digest: string };

/** 抓取并物化后的单个 skill。 */
export interface WellKnownSkillPayload {
  name: string;
  installName: string;
  content: string;
  files: Map<string, WellKnownFileContent>;
}

/** 判断 URL 是否可能是 well-known 端点（http(s) 且非 github/gitlab）。 */
export function isWellKnownCandidate(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  try {
    const host = new URL(url).hostname;
    return !['github.com', 'gitlab.com', 'huggingface.co'].includes(host);
  } catch {
    return false;
  }
}

// ─── index 抓取与归一化 ───

interface IndexCandidate {
  entries: NormalizedWellKnownEntry[];
  indexUrl: string;
}

/** 抓取并归一化 index，返回首个有效候选。 */
export async function fetchWellKnownIndex(url: string): Promise<NormalizedWellKnownEntry[] | null> {
  const candidate = await fetchIndexCandidate(url);
  return candidate?.entries ?? null;
}

async function fetchIndexCandidate(baseUrl: string): Promise<IndexCandidate | null> {
  try {
    const parsed = new URL(baseUrl);
    const basePath = parsed.pathname.replace(/\/$/, '');
    const origin = `${parsed.protocol}//${parsed.host}`;

    const urlsToTry: Array<{ indexUrl: string }> = [];
    for (const wellKnownPath of WELL_KNOWN_PATHS) {
      urlsToTry.push({ indexUrl: `${origin}${basePath}/${wellKnownPath}/${INDEX_FILE}` });
      if (basePath) {
        urlsToTry.push({ indexUrl: `${origin}/${wellKnownPath}/${INDEX_FILE}` });
      }
    }

    for (const { indexUrl } of urlsToTry) {
      try {
        const response = await fetch(indexUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        if (!response.ok) continue;
        const raw = (await response.json()) as unknown;
        const entries = normalizeIndex(raw, indexUrl);
        if (entries && entries.length > 0) {
          return { entries, indexUrl };
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeIndex(raw: unknown, indexUrl: string): NormalizedWellKnownEntry[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.skills)) return null;

  const schema = record.$schema;
  if (schema === DISCOVERY_SCHEMA_V2) {
    const entries: NormalizedWellKnownEntry[] = [];
    for (const entry of record.skills) {
      if (!isValidEntryV2(entry)) continue;
      entries.push({
        version: '0.2.0',
        name: entry.name,
        description: entry.description,
        type: entry.type,
        artifactUrl: new URL(entry.url, indexUrl).toString(),
        digest: entry.digest,
      });
    }
    return entries.length > 0 ? entries : null;
  }

  // 无 $schema 视为 legacy v0.1.0；未知 schema 不处理
  if (schema !== undefined) return null;

  const entries: NormalizedWellKnownEntry[] = [];
  for (const entry of record.skills) {
    if (!isValidEntryV1(entry)) return null; // legacy 全量校验，任一失败整体放弃
    entries.push({
      version: '0.1.0',
      name: entry.name,
      description: entry.description,
      files: entry.files,
      skillBaseUrl: legacySkillBaseUrl(indexUrl),
    });
  }
  return entries;
}

function legacySkillBaseUrl(indexUrl: string): string {
  const parsed = new URL(indexUrl);
  // 去掉 /<wellKnownPath>/index.json 后缀，得到 skill 根
  const marker = WELL_KNOWN_PATHS.map(p => `/${p}/${INDEX_FILE}`).find(m => parsed.pathname.endsWith(m));
  const basePath = marker ? parsed.pathname.slice(0, -marker.length) : parsed.pathname;
  return `${parsed.protocol}//${parsed.host}${basePath}`;
}

function isValidSkillName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length >= 1 && name.length <= 64 &&
    /^[a-z0-9-]+$/.test(name) &&
    !name.startsWith('-') && !name.endsWith('-') && !name.includes('--')
  );
}

function isValidEntryV1(entry: unknown): entry is { name: string; description: string; files: string[] } {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  if (!isValidSkillName(e.name)) return false;
  if (typeof e.description !== 'string' || !e.description) return false;
  if (!Array.isArray(e.files) || e.files.length === 0) return false;
  for (const f of e.files) {
    if (typeof f !== 'string' || !f || f.startsWith('/') || f.startsWith('\\') || f.includes('..') || f.includes('\0')) {
      return false;
    }
  }
  return e.files.some(f => typeof f === 'string' && f.toLowerCase() === 'skill.md');
}

function isValidEntryV2(entry: unknown): entry is { name: string; description: string; type: 'skill-md' | 'archive'; url: string; digest: string } {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  if (!isValidSkillName(e.name)) return false;
  if (typeof e.description !== 'string' || !e.description || e.description.length > 1024) return false;
  if (e.type !== 'skill-md' && e.type !== 'archive') return false;
  if (typeof e.url !== 'string' || !e.url) return false;
  if (typeof e.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(e.digest)) return false;
  try {
    new URL(e.url, 'https://example.com/.well-known/agent-skills/index.json');
  } catch {
    return false;
  }
  return true;
}

// ─── 单个 skill 拉取 ───

async function fetchSkillByEntry(entry: NormalizedWellKnownEntry): Promise<WellKnownSkillPayload | null> {
  if (entry.version === '0.1.0') return fetchLegacySkill(entry);
  return fetchArtifactSkill(entry);
}

async function fetchLegacySkill(entry: Extract<NormalizedWellKnownEntry, { version: '0.1.0' }>): Promise<WellKnownSkillPayload | null> {
  try {
    const skillBase = `${entry.skillBaseUrl.replace(/\/$/, '')}/${entry.name}`;
    const mdResponse = await fetch(`${skillBase}/SKILL.md`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!mdResponse.ok) return null;
    const content = await mdResponse.text();

    const parsed = safeParseSkill(content);
    if (!parsed) return null;

    const files = new Map<string, WellKnownFileContent>();
    files.set('SKILL.md', content);
    const others = entry.files.filter(f => f.toLowerCase() !== 'skill.md').slice(0, MAX_LEGACY_FILES);

    // 限制并发，防止大量文件同时下载
    let totalBytes = 0;
    for (let i = 0; i < others.length; i += LEGACY_CONCURRENCY) {
      const batch = others.slice(i, i + LEGACY_CONCURRENCY);
      await Promise.all(batch.map(async filePath => {
        try {
          const r = await fetch(`${skillBase}/${filePath}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
          if (!r.ok) return;
          const cl = Number(r.headers.get('content-length') ?? 0);
          if (cl > MAX_LEGACY_FILE_BYTES || totalBytes + cl > MAX_ARCHIVE_UNPACKED_BYTES) return;
          const buf = new Uint8Array(await r.arrayBuffer());
          if (buf.byteLength > MAX_LEGACY_FILE_BYTES || totalBytes + buf.byteLength > MAX_ARCHIVE_UNPACKED_BYTES) return;
          totalBytes += buf.byteLength;
          files.set(filePath, buf);
        } catch { /* 单文件失败容忍（legacy 行为） */ }
      }));
    }

    return { name: parsed.frontmatter.name, installName: entry.name, content, files };
  } catch {
    return null;
  }
}

async function fetchArtifactSkill(entry: Extract<NormalizedWellKnownEntry, { version: '0.2.0' }>): Promise<WellKnownSkillPayload | null> {
  try {
    const response = await fetch(entry.artifactUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!response.ok) return null;

    // 读取前用 Content-Length 预检，尽早拒绝超大响应。
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_ARTIFACT_BYTES) {
      logger.warn(`well-known artifact 超出大小上限 (${contentLength} bytes): ${entry.name}`);
      return null;
    }
    // 流式读取：累计字节超限时立即中断，避免先缓冲整个超大响应导致 OOM
    // （覆盖分块传输、缺失/伪造 Content-Length 的场景）。
    const bytes = await readBodyWithLimit(response);
    if (!bytes) {
      logger.warn(`well-known artifact 超出大小上限 (${MAX_ARTIFACT_BYTES} bytes): ${entry.name}`);
      return null;
    }

    if (computeDigest(bytes) !== entry.digest) {
      logger.warn(`well-known digest mismatch for ${entry.name}`);
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    let files: Map<string, WellKnownFileContent>;
    if (entry.type === 'skill-md') {
      files = new Map([['SKILL.md', new TextDecoder().decode(bytes)]]);
    } else {
      files = extractArchive(bytes, entry.artifactUrl, contentType);
    }

    const skillMd = files.get('SKILL.md');
    if (!skillMd) return null;
    const content = typeof skillMd === 'string' ? skillMd : new TextDecoder().decode(skillMd);
    files.set('SKILL.md', content);

    const parsed = safeParseSkill(content);
    if (!parsed) return null;

    return { name: parsed.frontmatter.name, installName: entry.name, content, files };
  } catch {
    return null;
  }
}

function safeParseSkill(content: string) {
  try {
    const parsed = parseSkillMd(content);
    if (!parsed.frontmatter.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 拉取全部 skill（供 add/use 枚举）。 */
export async function fetchAllWellKnownSkills(url: string): Promise<WellKnownSkillPayload[]> {
  const candidate = await fetchIndexCandidate(url);
  if (!candidate) return [];

  // 限制总条目数，防止恶意 index 耗尽内存
  const entries = candidate.entries.slice(0, MAX_LEGACY_FILES);
  const results: (WellKnownSkillPayload | null)[] = [];

  // 限制并发下载
  for (let i = 0; i < entries.length; i += LEGACY_CONCURRENCY) {
    const batch = entries.slice(i, i + LEGACY_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fetchSkillByEntry));
    results.push(...batchResults);
  }

  return results.filter((s): s is WellKnownSkillPayload => s !== null);
}

// ─── 物化到临时目录 ───

/** 把单个 skill 的 files 写入临时目录，返回 sourceDir（供磁盘发现使用）。 */
export async function materializeWellKnownSkill(payload: WellKnownSkillPayload): Promise<string> {
  const tempDir = createTempDir();
  await writePayloadToDir(payload, tempDir);
  return tempDir;
}

/** 把多个 skill 物化到同一临时根下（每个一个子目录），返回临时根。 */
export async function materializeWellKnownSkills(payloads: WellKnownSkillPayload[]): Promise<string> {
  const tempDir = createTempDir();
  for (const payload of payloads) {
    await writePayloadToDir(payload, join(tempDir, payload.installName));
  }
  return tempDir;
}

async function writePayloadToDir(payload: WellKnownSkillPayload, dir: string): Promise<void> {
  for (const [relPath, content] of payload.files) {
    const dest = join(dir, relPath);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, typeof content === 'string' ? content : Buffer.from(content));
  }
}

// ─── 归档解压（安全加固）───

function computeDigest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * 流式读取 response body，累计字节超过 MAX_ARTIFACT_BYTES 时立即中断并返回 null。
 * 避免先缓冲整个超大响应导致 OOM（分块传输、缺失/伪造 Content-Length 均安全）。
 */
async function readBodyWithLimit(response: Response): Promise<Uint8Array | null> {
  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.byteLength > MAX_ARTIFACT_BYTES ? null : buf;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ARTIFACT_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  // Buffer.concat 内部做一次性分配+拷贝，避免手动 out.set 的二次峰值
  return new Uint8Array(Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength))));
}

function extractArchive(bytes: Uint8Array, artifactUrl: string, contentType: string): Map<string, WellKnownFileContent> {
  const lower = artifactUrl.toLowerCase();
  const isZip = contentType.includes('application/zip') || lower.endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  const isTarGz =
    contentType.includes('application/gzip') || contentType.includes('application/x-gzip') ||
    lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  if (isZip) return extractZip(bytes);
  if (isTarGz) return extractTarGz(bytes);
  throw new Error('Unsupported archive format');
}

function normalizeArchivePath(rawPath: string): string | null {
  if (!rawPath || rawPath.includes('\0')) return null;
  if (rawPath.startsWith('/') || rawPath.startsWith('\\')) return null;
  if (/^[A-Za-z]:/.test(rawPath)) return null;
  if (rawPath.includes('\\')) return null;
  const parts = rawPath.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some(p => p === '.' || p === '..')) return null;
  return parts.join('/');
}

function addArchiveFile(files: Map<string, WellKnownFileContent>, path: string, content: Uint8Array, total: { bytes: number }): void {
  const normalized = normalizeArchivePath(path);
  if (!normalized) throw new Error(`Unsafe archive path: ${path}`);
  total.bytes += content.byteLength;
  if (total.bytes > MAX_ARCHIVE_UNPACKED_BYTES) throw new Error('Archive exceeds maximum unpacked size');
  if (files.size >= MAX_ARCHIVE_FILES) throw new Error('Archive contains too many files');
  files.set(normalized, content);
}

function extractTarGz(bytes: Uint8Array): Map<string, WellKnownFileContent> {
  // maxOutputLength 限制解压输出，防止高压缩比归档（压缩炸弹）OOM
  const tar = gunzipSync(Buffer.from(bytes), { maxOutputLength: MAX_ARCHIVE_UNPACKED_BYTES });
  const files = new Map<string, WellKnownFileContent>();
  const total = { bytes: 0 };
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) break;
    const name = readTarString(header, 0, 100);
    const sizeText = readTarString(header, 124, 12).trim();
    const typeFlag = header[156];
    const prefix = readTarString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isFinite(size) || size < 0) throw new Error('Invalid tar entry size');
    offset += 512;

    if (typeFlag === 0x32 || typeFlag === 0x31) throw new Error('Archive links are not supported');
    if (typeFlag === 0 || typeFlag === 0x30) {
      addArchiveFile(files, path, new Uint8Array(tar.subarray(offset, offset + size)), total);
    }
    offset += Math.ceil(size / 512) * 512;
  }

  if (!files.has('SKILL.md')) throw new Error('Archive missing root SKILL.md');
  return files;
}

function readTarString(buffer: Uint8Array, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length);
  const nul = slice.indexOf(0);
  return new TextDecoder().decode(nul >= 0 ? slice.subarray(0, nul) : slice);
}

function extractZip(bytes: Uint8Array): Map<string, WellKnownFileContent> {
  const buffer = Buffer.from(bytes);
  const eocd = findZipEOCD(buffer);
  if (eocd < 0) throw new Error('Invalid zip archive');

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, WellKnownFileContent>();
  const total = { bytes: 0 };

  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid zip directory');
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const fileName = new TextDecoder(flags & 0x800 ? 'utf-8' : undefined).decode(buffer.subarray(nameStart, nameStart + fileNameLength));
    offset = nameStart + fileNameLength + extraLength + commentLength;

    if (fileName.endsWith('/')) continue;
    if (flags & 0x1) throw new Error('Encrypted zip entries are not supported');
    const fileType = (externalAttributes >>> 16) & 0o170000;
    if (fileType === 0o120000 || fileType === 0o10000) throw new Error('Archive links are not supported');

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error('Invalid zip local header');
    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    // 解压前预检累计大小，避免高压缩比条目在 addArchiveFile 计数前分配超限内存。
    // 只校验不累计；实际计数仍由 addArchiveFile 统一完成（避免重复累计）。
    if (uncompressedSize > 0 && total.bytes + uncompressedSize > MAX_ARCHIVE_UNPACKED_BYTES) {
      throw new Error('Archive exceeds maximum unpacked size');
    }

    // 空文件（含 deflate 压缩的空条目）直接给空内容；
    // 避免 inflateRawSync 对 maxOutputLength:0 抛 ERR_OUT_OF_RANGE
    let content: Buffer;
    if (uncompressedSize === 0) {
      content = Buffer.alloc(0);
    } else if (method === 0) {
      content = compressed;
    } else if (method === 8) {
      // 解压上限 = 声明的解压大小，超限（压缩炸弹）即抛错
      content = inflateRawSync(compressed, { maxOutputLength: uncompressedSize });
    } else {
      throw new Error(`Unsupported zip compression method: ${method}`);
    }
    if (content.byteLength !== uncompressedSize) throw new Error('Zip entry size mismatch');

    addArchiveFile(files, fileName, new Uint8Array(content), total);
  }

  if (!files.has('SKILL.md')) throw new Error('Archive missing root SKILL.md');
  return files;
}

function findZipEOCD(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}
