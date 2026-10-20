import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, deflateRawSync } from 'node:zlib';
import {
  isWellKnownCandidate,
  fetchWellKnownIndex,
  fetchAllWellKnownSkills,
  materializeWellKnownSkill,
  materializeWellKnownSkills,
} from '../../src/core/wellknown-source.js';

const SCHEMA_V2 = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

function sha256(content: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** 构造最小合法 SKILL.md 文本。 */
function skillMd(name: string): string {
  return `---\nname: ${name}\ndescription: ${name} desc\n---\n# ${name}\n`;
}

/** 构造一个简单 tar 包（ustar，单/多文件）。 */
function buildTar(entries: Array<{ path: string; content: string }>): Uint8Array {
  const blocks: Buffer[] = [];
  for (const { path, content } of entries) {
    const data = Buffer.from(content, 'utf-8');
    const header = Buffer.alloc(512, 0);
    header.write(path, 0, Math.min(path.length, 100), 'utf-8');
    header.write('0000644\0', 100, 8);
    header.write('0000000\0', 108, 8);
    header.write('0000000\0', 116, 8);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12);
    header.write('00000000000\0', 136, 12);
    // checksum
    header.write('        ', 148, 8);
    header.writeUInt8(0x30, 156); // typeflag '0' regular file
    let sum = 0;
    for (const b of header) sum += b;
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    blocks.push(header);
    blocks.push(data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad, 0));
  }
  blocks.push(Buffer.alloc(1024, 0)); // end blocks
  return new Uint8Array(Buffer.concat(blocks));
}

/** 构造一个最小 zip（store 模式，无压缩）。 */
function buildZip(entries: Array<{ path: string; content: string }>): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const { path, content } of entries) {
    const nameBuf = Buffer.from(path, 'utf-8');
    const data = Buffer.from(content, 'utf-8');
    const crc = 0; // store 模式下校验从简（解压器不强制校验 CRC）

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); // utf-8 flag
    local.writeUInt16LE(0, 8); // method store
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x800, 8); // utf-8 flag
    central.writeUInt16LE(0, 10); // method
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return new Uint8Array(Buffer.concat([localBuf, centralBuf, eocd]));
}

/** 构造 deflate 压缩的 zip（method 8），支持空条目与压缩内容。 */
function buildZipDeflate(entries: Array<{ path: string; content: string }>): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const { path, content } of entries) {
    const nameBuf = Buffer.from(path, 'utf-8');
    const raw = Buffer.from(content, 'utf-8');
    const compressed = raw.length === 0 ? Buffer.alloc(0) : deflateRawSync(raw);
    const crc = 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8); // method deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += 30 + nameBuf.length + compressed.length;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return new Uint8Array(Buffer.concat([localBuf, centralBuf, eocd]));
}

describe('isWellKnownCandidate', () => {
  it('accepts non-github/gitlab https URLs', () => {
    expect(isWellKnownCandidate('https://skills.example.com')).toBe(true);
    expect(isWellKnownCandidate('https://example.com/docs')).toBe(true);
  });

  it('rejects github/gitlab hosts', () => {
    expect(isWellKnownCandidate('https://github.com/o/r')).toBe(false);
    expect(isWellKnownCandidate('https://gitlab.com/o/r')).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isWellKnownCandidate('git@github.com:o/r.git')).toBe(false);
    expect(isWellKnownCandidate('owner/repo')).toBe(false);
  });
});

describe('fetchWellKnownIndex', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes a v1 legacy index', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({ skills: [{ name: 'demo', description: 'd', files: ['SKILL.md', 'a.ts'] }] });
      }
      return jsonResponse({}, 404);
    }));
    const entries = await fetchWellKnownIndex('https://example.com');
    expect(entries).toHaveLength(1);
    expect(entries![0]).toMatchObject({ version: '0.1.0', name: 'demo', files: ['SKILL.md', 'a.ts'] });
  });

  it('normalizes a v2 index with resolved artifact URL', async () => {
    const digest = sha256('x');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'demo', description: 'd', type: 'skill-md', url: './demo/SKILL.md', digest }],
        });
      }
      return jsonResponse({}, 404);
    }));
    const entries = await fetchWellKnownIndex('https://example.com');
    expect(entries![0]).toMatchObject({ version: '0.2.0', name: 'demo', type: 'skill-md', digest });
    expect(entries![0]).toHaveProperty('artifactUrl');
  });

  it('returns null when no index found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 404)));
    expect(await fetchWellKnownIndex('https://example.com')).toBeNull();
  });

  it('rejects v2 entry with bad digest format', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'demo', description: 'd', type: 'skill-md', url: './d.md', digest: 'md5:bad' }],
        });
      }
      return jsonResponse({}, 404);
    }));
    expect(await fetchWellKnownIndex('https://example.com')).toBeNull();
  });
});

describe('fetchAllWellKnownSkills', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches v1 skills with supporting files', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({ skills: [{ name: 'demo', description: 'd', files: ['SKILL.md', 'helper.ts'] }] });
      }
      if (url.endsWith('/demo/SKILL.md')) return new Response(skillMd('demo'), { status: 200 });
      if (url.endsWith('/demo/helper.ts')) return new Response('export {}', { status: 200 });
      return jsonResponse({}, 404);
    }));
    const skills = await fetchAllWellKnownSkills('https://example.com');
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('demo');
    expect(skills[0]!.files.has('SKILL.md')).toBe(true);
    expect(skills[0]!.files.has('helper.ts')).toBe(true);
  });

  it('fetches v2 skill-md artifact with digest verification', async () => {
    const content = skillMd('artifact-skill');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'artifact-skill', description: 'd', type: 'skill-md', url: './a/SKILL.md', digest: sha256(content) }],
        });
      }
      if (url.endsWith('/a/SKILL.md')) return new Response(content, { status: 200 });
      return jsonResponse({}, 404);
    }));
    const skills = await fetchAllWellKnownSkills('https://example.com');
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('artifact-skill');
  });

  it('rejects v2 artifact on digest mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'demo', description: 'd', type: 'skill-md', url: './a/SKILL.md', digest: sha256('tampered') }],
        });
      }
      if (url.endsWith('/a/SKILL.md')) return new Response(skillMd('demo'), { status: 200 });
      return jsonResponse({}, 404);
    }));
    expect(await fetchAllWellKnownSkills('https://example.com')).toHaveLength(0);
  });

  it('fetches and extracts a tar.gz archive', async () => {
    const tar = buildTar([
      { path: 'SKILL.md', content: skillMd('tar-skill') },
      { path: 'lib/tool.ts', content: 'export const x=1' },
    ]);
    const tgz = gzipSync(Buffer.from(tar));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'tar-skill', description: 'd', type: 'archive', url: './skill.tar.gz', digest: sha256(new Uint8Array(tgz)) }],
        });
      }
      if (url.endsWith('/skill.tar.gz')) {
        return new Response(new Uint8Array(tgz), { status: 200, headers: { 'content-type': 'application/gzip' } });
      }
      return jsonResponse({}, 404);
    }));
    const skills = await fetchAllWellKnownSkills('https://example.com');
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('tar-skill');
    expect(skills[0]!.files.has('lib/tool.ts')).toBe(true);
  });

  it('fetches and extracts a zip archive', async () => {
    const zip = buildZip([
      { path: 'SKILL.md', content: skillMd('zip-skill') },
      { path: 'src/main.ts', content: 'export {}' },
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'zip-skill', description: 'd', type: 'archive', url: './skill.zip', digest: sha256(zip) }],
        });
      }
      if (url.endsWith('/skill.zip')) {
        return new Response(zip, { status: 200, headers: { 'content-type': 'application/zip' } });
      }
      return jsonResponse({}, 404);
    }));
    const skills = await fetchAllWellKnownSkills('https://example.com');
    expect(skills).toHaveLength(1);
    expect(skills[0]!.files.has('src/main.ts')).toBe(true);
  });

  it('rejects archive with path traversal', async () => {
    const tar = buildTar([
      { path: 'SKILL.md', content: skillMd('evil') },
      { path: '../escape.txt', content: 'x' },
    ]);
    const tgz = gzipSync(Buffer.from(tar));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'evil', description: 'd', type: 'archive', url: './e.tar.gz', digest: sha256(new Uint8Array(tgz)) }],
        });
      }
      if (url.endsWith('/e.tar.gz')) return new Response(new Uint8Array(tgz), { status: 200 });
      return jsonResponse({}, 404);
    }));
    // 路径穿越导致解压抛错 → 该 skill 被过滤
    expect(await fetchAllWellKnownSkills('https://example.com')).toHaveLength(0);
  });

  it('rejects oversized artifact via streaming limit', async () => {
    // 构造一个超过 MAX_ARTIFACT_BYTES(100MB) 的分块流式响应，无 Content-Length
    const chunk = new Uint8Array(1024 * 1024); // 1MB/块
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 200; i++) controller.enqueue(chunk); // 200MB
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'big', description: 'd', type: 'skill-md', url: './big.md', digest: sha256('x') }],
        });
      }
      if (url.endsWith('/big.md')) {
        return new Response(stream, { status: 200 }); // 无 content-length
      }
      return jsonResponse({}, 404);
    }));
    // 超限被中断 → 该 skill 被过滤
    expect(await fetchAllWellKnownSkills('https://example.com')).toHaveLength(0);
  });

  it('rejects oversized artifact via Content-Length precheck', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'big2', description: 'd', type: 'skill-md', url: './big.md', digest: sha256('x') }],
        });
      }
      if (url.endsWith('/big.md')) {
        return new Response('small', {
          status: 200,
          headers: { 'content-length': String(200 * 1024 * 1024) },
        });
      }
      return jsonResponse({}, 404);
    }));
    expect(await fetchAllWellKnownSkills('https://example.com')).toHaveLength(0);
  });

  it('rejects a tar.gz decompression bomb (output exceeds limit)', async () => {
    // 构造高压缩比 tar.gz：解压后远超 MAX_ARCHIVE_UNPACKED_BYTES(50MB)
    // 用大量重复内容，压缩后很小但解压巨大
    const bigContent = 'A'.repeat(60 * 1024 * 1024); // 60MB 重复内容
    const tar = buildTar([{ path: 'SKILL.md', content: skillMd('bomb') }, { path: 'big.txt', content: bigContent }]);
    const tgz = gzipSync(Buffer.from(tar));
    // 压缩后应远小于 60MB
    expect(tgz.length).toBeLessThan(60 * 1024 * 1024);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'bomb', description: 'd', type: 'archive', url: './b.tar.gz', digest: sha256(new Uint8Array(tgz)) }],
        });
      }
      if (url.endsWith('/b.tar.gz')) {
        return new Response(new Uint8Array(tgz), { status: 200, headers: { 'content-type': 'application/gzip' } });
      }
      return jsonResponse({}, 404);
    }));
    // 解压超 maxOutputLength 抛错 → skill 被过滤，且不 OOM
    expect(await fetchAllWellKnownSkills('https://example.com')).toHaveLength(0);
  });

  it('handles deflate-compressed empty zip entries without crashing', async () => {
    const zip = buildZipDeflate([
      { path: 'SKILL.md', content: skillMd('empty-zip') },
      { path: 'empty.txt', content: '' }, // deflate 压缩的空文件
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'empty-zip', description: 'd', type: 'archive', url: './s.zip', digest: sha256(zip) }],
        });
      }
      if (url.endsWith('/s.zip')) {
        return new Response(zip, { status: 200, headers: { 'content-type': 'application/zip' } });
      }
      return jsonResponse({}, 404);
    }));
    const skills = await fetchAllWellKnownSkills('https://example.com');
    expect(skills).toHaveLength(1);
    expect(skills[0]!.files.has('empty.txt')).toBe(true);
  });

  it('extracts a deflate zip with a moderately large file without false rejection', async () => {
    // 合法中等大小 deflate zip：不应被预检+累计双重计数误杀
    const bigText = 'x'.repeat(2 * 1024 * 1024); // 2MB
    const zip = buildZipDeflate([
      { path: 'SKILL.md', content: skillMd('mid-zip') },
      { path: 'data.txt', content: bigText },
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: [{ name: 'mid-zip', description: 'd', type: 'archive', url: './s.zip', digest: sha256(zip) }],
        });
      }
      if (url.endsWith('/s.zip')) {
        return new Response(zip, { status: 200, headers: { 'content-type': 'application/zip' } });
      }
      return jsonResponse({}, 404);
    }));
    const skills = await fetchAllWellKnownSkills('https://example.com');
    expect(skills).toHaveLength(1);
    expect(skills[0]!.files.get('data.txt')).toBeDefined();
  });
});

describe('materialize', () => {
  let tempDirs: string[] = [];
  afterEach(() => {
    for (const d of tempDirs) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    tempDirs = [];
  });

  it('materializeWellKnownSkill writes files to temp dir', async () => {
    const dir = await materializeWellKnownSkill({
      name: 'demo',
      installName: 'demo',
      content: skillMd('demo'),
      files: new Map([['SKILL.md', skillMd('demo')], ['a/b.ts', new Uint8Array([1, 2, 3])]]),
    });
    tempDirs.push(dir);
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toContain('name: demo');
    expect(existsSync(join(dir, 'a/b.ts'))).toBe(true);
  });

  it('materializeWellKnownSkills places each skill in its own subdir', async () => {
    const dir = await materializeWellKnownSkills([
      { name: 'one', installName: 'one', content: skillMd('one'), files: new Map([['SKILL.md', skillMd('one')]]) },
      { name: 'two', installName: 'two', content: skillMd('two'), files: new Map([['SKILL.md', skillMd('two')]]) },
    ]);
    tempDirs.push(dir);
    expect(existsSync(join(dir, 'one', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, 'two', 'SKILL.md'))).toBe(true);
  });
});

describe('well-known scoped URL semantics', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubScopedRootIndex(options?: { rootEntries?: Array<{ name: string; content?: string }>; scopedIndexOk?: boolean }) {
    const rootEntries = options?.rootEntries ?? [
      { name: 'alpha', content: skillMd('alpha') },
      { name: 'beta', content: skillMd('beta') },
    ];
    const ROOT_INDEX = 'https://example.com/.well-known/agent-skills/index.json';
    return vi.fn(async (url: string) => {
      // 根 index 必须精确匹配：作用域 index 请求同样以 /.well-known/.../index.json 结尾
      if (url === ROOT_INDEX) {
        return jsonResponse({
          $schema: SCHEMA_V2,
          skills: rootEntries.map((e) => ({
            name: e.name,
            description: 'd',
            type: 'skill-md',
            url: `./${e.name}/SKILL.md`,
            digest: sha256(e.content ?? skillMd(e.name)),
          })),
        });
      }
      if (url.includes('/.well-known/') && url.endsWith('/index.json')) {
        // 作用域 index 尝试：仅在明确提供时成功，否则 404（触发根回落）。
        // 注意 artifact 相对路径也会解析进 .well-known/ 目录，不能在此拦截。
        if (options?.scopedIndexOk && url.startsWith('https://example.com/my-skill/')) {
          return jsonResponse({
            $schema: SCHEMA_V2,
            skills: [{ name: 'my-skill', description: 'd', type: 'skill-md', url: './m/SKILL.md', digest: sha256(skillMd('my-skill')) }],
          });
        }
        return jsonResponse({}, 404);
      }
      for (const e of rootEntries) {
        if (url.endsWith(`/${e.name}/SKILL.md`)) {
          return new Response(e.content ?? skillMd(e.name), { status: 200 });
        }
      }
      if (url.endsWith('/m/SKILL.md')) {
        return new Response(skillMd('my-skill'), { status: 200 });
      }
      return jsonResponse({}, 404);
    });
  }

  it('installs only the scoped skill when the root index is used', async () => {
    const fetchSpy = stubScopedRootIndex();
    vi.stubGlobal('fetch', fetchSpy);
    const skills = await fetchAllWellKnownSkills('https://example.com/alpha');
    expect(skills.map((s) => s.name)).toEqual(['alpha']);
    // beta 的 artifact 不应被请求
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/beta/'))).toBe(false);
  });

  it('throws WellKnownScopeNotFoundError when the scope matches no skill', async () => {
    vi.stubGlobal('fetch', stubScopedRootIndex());
    await expect(fetchAllWellKnownSkills('https://example.com/ghost'))
      .rejects.toThrow(/no skill "ghost"/);
  });

  it('hard-errors when the scoped skill fails digest verification', async () => {
    const bad = skillMd('alpha');
    vi.stubGlobal('fetch', stubScopedRootIndex({
      rootEntries: [{ name: 'alpha', content: 'tampered content' }],
    }));
    await expect(fetchAllWellKnownSkills('https://example.com/alpha'))
      .rejects.toThrow(/failed to download or failed digest verification/);
  });

  it('uses the scoped index directly when available (no root fallback)', async () => {
    vi.stubGlobal('fetch', stubScopedRootIndex({ scopedIndexOk: true }));
    const skills = await fetchAllWellKnownSkills('https://example.com/my-skill');
    expect(skills.map((s) => s.name)).toEqual(['my-skill']);
  });

  it('does not scope URLs whose last segment is a well-known path itself', async () => {
    vi.stubGlobal('fetch', stubScopedRootIndex());
    const skills = await fetchAllWellKnownSkills('https://example.com/skills');
    expect(skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
  });
});
