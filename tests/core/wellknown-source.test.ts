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
