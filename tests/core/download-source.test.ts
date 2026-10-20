import { describe, it, expect, vi, afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../src/utils/fs-helpers.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/fs-helpers.js')>(
    '../../src/utils/fs-helpers.js',
  );
  return actual;
});

const { directDownloadKind, materializeDirectDownload } = await import('../../src/core/download-source.js');

function buildTar(entries: Array<{ path: string; content: string }>): Buffer {
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
    header.write('        ', 148, 8);
    header.writeUInt8(0x30, 156);
    let sum = 0;
    for (const b of header) sum += b;
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    blocks.push(header, data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

function buildZip(entries: Array<{ path: string; content: string }>): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const { path, content } of entries) {
    const nameBuf = Buffer.from(path, 'utf-8');
    const data = Buffer.from(content, 'utf-8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  const parts = [...localParts, ...centralParts, eocd];
  const total = parts.reduce((n, b) => n + b.length, 0);
  const out = Buffer.alloc(total);
  let pos = 0;
  for (const part of parts) {
    part.copy(out, pos);
    pos += part.length;
  }
  return new Uint8Array(out);
}

describe('directDownloadKind', () => {
  it('classifies archive and markdown URLs', () => {
    expect(directDownloadKind('https://example.com/skill.tgz')).toBe('archive');
    expect(directDownloadKind('https://example.com/a/skill.tar.gz')).toBe('archive');
    expect(directDownloadKind('https://example.com/a/skill.zip')).toBe('archive');
    expect(directDownloadKind('https://example.com/SKILL.md')).toBe('markdown');
    expect(directDownloadKind('https://example.com/docs/intro.md')).toBe('markdown');
    expect(directDownloadKind('https://example.com/skills')).toBeNull();
    expect(directDownloadKind('https://example.com/a.html')).toBeNull();
    expect(directDownloadKind('not a url')).toBeNull();
  });

  it('classifies codeload tarball URLs where the ref is the suffix', () => {
    expect(directDownloadKind('https://codeload.github.com/owner/repo/tar.gz/HEAD')).toBe('archive');
    expect(directDownloadKind('https://codeload.github.com/owner/repo/tar.gz/v1.2.0')).toBe('archive');
    expect(directDownloadKind('https://codeload.github.com/owner/repo/zip/main')).toBe('archive');
    expect(directDownloadKind('https://github.com/owner/repo/releases/download/v1/skill.zip')).toBe('archive');
  });
});

describe('materializeDirectDownload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('materializes a single SKILL.md from a markdown URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('---\nname: md-skill\n---\n# md-skill\n', { status: 200 }),
    ));

    const dir = await materializeDirectDownload('https://example.com/SKILL.md');
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toContain('name: md-skill');
  });

  it('extracts a tar.gz with a single root directory', async () => {
    const tgz = gzipSync(buildTar([
      { path: 'skill-root/SKILL.md', content: '---\nname: tgz-skill\n---\n# tgz\n' },
      { path: 'skill-root/scripts/run.sh', content: 'echo hi\n' },
    ]));
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(new Uint8Array(tgz), { status: 200, headers: { 'content-type': 'application/gzip' } }),
    ));

    const dir = await materializeDirectDownload('https://example.com/skill.tgz');
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toContain('name: tgz-skill');
    expect(existsSync(join(dir, 'scripts/run.sh'))).toBe(true);
  });

  it('extracts a flat zip archive', async () => {
    const zip = buildZip([
      { path: 'SKILL.md', content: '---\nname: zip-skill\n---\n# zip\n' },
      { path: 'refs/notes.md', content: 'notes\n' },
    ]);
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(zip, { status: 200, headers: { 'content-type': 'application/zip' } }),
    ));

    const dir = await materializeDirectDownload('https://example.com/skill.zip');
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toContain('name: zip-skill');
    expect(readFileSync(join(dir, 'refs/notes.md'), 'utf-8')).toContain('notes');
  });

  it('rejects downloads above SKILL_MASTER_DOWNLOAD_MAX_BYTES', async () => {
    vi.stubEnv('SKILL_MASTER_DOWNLOAD_MAX_BYTES', '10');
    const big = 'x'.repeat(200);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(big, { status: 200 })));

    await expect(materializeDirectDownload('https://example.com/SKILL.md'))
      .rejects.toThrow(/SKILL_MASTER_DOWNLOAD_MAX_BYTES/);
  });

  it('rejects non-2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));

    await expect(materializeDirectDownload('https://example.com/skill.tgz'))
      .rejects.toThrow(/HTTP 404/);
  });

  it('rejects URLs that are not direct downloads', async () => {
    await expect(materializeDirectDownload('https://example.com/unknown'))
      .rejects.toThrow(/not a direct download URL/);
  });
});
