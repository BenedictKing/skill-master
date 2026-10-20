import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createTempDir, ensureDir } from '../utils/fs-helpers.js';
import { extractArchive } from './wellknown-source.js';
import { hasProxyEnv, downloadArchiveViaCurl } from './git-source.js';
import * as logger from '../utils/logger.js';

/**
 * 直接 URL 安装：`add https://example.com/skill.tgz` 无需 git 或 well-known。
 * 支持 .md（单 SKILL.md）与 .zip/.tgz/.tar.gz 归档；
 * 下载体积受 SKILL_MASTER_DOWNLOAD_MAX_BYTES 限制（默认 10 MiB），
 * 解压复用 well-known 的安全解压器（路径穿越/解压上限加固）。
 */

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024;

export type DirectDownloadKind = 'archive' | 'markdown';

/** URL 是否指向可直接下载的 skill 文件（按扩展名判断） */
export function directDownloadKind(url: string): DirectDownloadKind | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const pathname = parsed.pathname.toLowerCase();
  if (pathname.endsWith('.zip') || pathname.endsWith('.tgz') || pathname.endsWith('.tar.gz')) {
    return 'archive';
  }
  // codeload.github.com/{owner}/{repo}/tar.gz/{ref}：扩展名在路径中段，ref 是后缀
  if (parsed.hostname === 'codeload.github.com' && /^\/[^/]+\/[^/]+\/(tar\.gz|zip)\//.test(pathname)) {
    return 'archive';
  }
  if (pathname.endsWith('/skill.md') || pathname.endsWith('.md')) {
    return 'markdown';
  }
  return null;
}

function getDownloadMaxBytes(): number {
  const raw = process.env.SKILL_MASTER_DOWNLOAD_MAX_BYTES;
  if (!raw) return DEFAULT_DOWNLOAD_MAX_BYTES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DOWNLOAD_MAX_BYTES;
}

/**
 * 下载到字节缓冲。设置代理环境变量时走 curl（Node fetch 不读代理变量）。
 * 超过大小上限抛错（fetch 路径流式累计，不会先缓冲整个超大响应）。
 */
async function downloadBytes(url: string, timeoutMs: number, maxBytes: number): Promise<Uint8Array> {
  if (hasProxyEnv()) {
    const curlDir = createTempDir();
    await ensureDir(curlDir);
    const tempFile = join(curlDir, '.skill-master-download.bin');
    const ok = await downloadArchiveViaCurl(url, tempFile, timeoutMs);
    if (ok) {
      const bytes = await readFile(tempFile);
      if (bytes.byteLength > maxBytes) {
        throw new Error(`download exceeds SKILL_MASTER_DOWNLOAD_MAX_BYTES (${maxBytes} bytes): got ${bytes.byteLength}`);
      }
      return bytes;
    }
    logger.debug('curl download unavailable, falling back to built-in fetch');
  }

  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'skill-master' },
  });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status}`);
  }

  const declared = Number.parseInt(res.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`download exceeds SKILL_MASTER_DOWNLOAD_MAX_BYTES (${maxBytes} bytes): content-length ${declared}`);
  }

  const sink = createByteCappedSink(maxBytes);
  await pipeline(Readable.fromWeb(res.body), sink.stream);
  return sink.bytes();
}

function createByteCappedSink(maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  const transform = new Transform({
    transform(chunk: Buffer, _enc, cb: (err?: Error | null, data?: Buffer) => void) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        cb(new Error(`download exceeds SKILL_MASTER_DOWNLOAD_MAX_BYTES (${maxBytes} bytes)`));
        return;
      }
      chunks.push(chunk);
      cb(null, chunk);
    },
  });
  return {
    stream: transform,
    bytes: () => new Uint8Array(Buffer.concat(chunks)),
  };
}

/**
 * 物化直接下载的 skill 到临时目录，返回可作为安装源根的目录。
 * - markdown：临时目录下生成 SKILL.md
 * - archive：解压；若所有条目共享同一根目录且根目录无 SKILL.md，则剥去该根目录
 */
export async function materializeDirectDownload(
  url: string,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
): Promise<string> {
  const kind = directDownloadKind(url);
  if (!kind) {
    throw new Error(`not a direct download URL (expected .md/.zip/.tgz/.tar.gz): ${url}`);
  }

  const bytes = await downloadBytes(url, timeoutMs, getDownloadMaxBytes());
  const tempDir = createTempDir();
  await ensureDir(tempDir);

  if (kind === 'markdown') {
    await writeFile(join(tempDir, 'SKILL.md'), bytes);
    return tempDir;
  }

  const files = extractArchive(bytes, url, '', { requireRootSkillMd: false });
  if (files.size === 0) {
    throw new Error('archive is empty');
  }

  for (const [relPath, content] of files) {
    const dest = join(tempDir, ...relPath.split('/'));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, typeof content === 'string' ? content : Buffer.from(content));
  }

  // Flat layout (SKILL.md at the archive root) → use tempDir directly;
  // single-root layout (e.g. GitHub-style tarballs) → descend into that root.
  if (existsSync(join(tempDir, 'SKILL.md'))) {
    return tempDir;
  }
  const roots = new Set([...files.keys()].map((p) => p.split('/')[0]));
  if (roots.size === 1) {
    return join(tempDir, [...roots][0]);
  }
  return tempDir;
}
