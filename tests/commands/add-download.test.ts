import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../test-utils.js';

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

const tgzBody = gzipSync(buildTar([
  { path: 'downloaded-skill/SKILL.md', content: '---\nname: downloaded-skill\ndescription: from tgz url\n---\n# downloaded-skill\n' },
]));
const mdBody = '---\nname: md-url-skill\ndescription: from md url\n---\n# md-url-skill\n';

// The HTTP server must live in its own process: runCli uses execFileSync, which
// blocks this worker's event loop and would deadlock a same-process server.
const serverScript = `
const http = require('node:http');
const tgz = Buffer.from(process.env.TGZ_B64 ?? '', 'base64');
const md = Buffer.from(process.env.MD_B64 ?? '', 'base64');
const server = http.createServer((req, res) => {
  if (req.url === '/skill.tgz') { res.writeHead(200, { 'content-type': 'application/gzip' }); res.end(tgz); return; }
  if (req.url === '/SKILL.md') { res.writeHead(200, { 'content-type': 'text/markdown' }); res.end(md); return; }
  res.writeHead(404); res.end('not found');
});
server.listen(0, '127.0.0.1', () => console.log('PORT=' + server.address().port));
`;

const serverProc: ChildProcess = spawn(process.execPath, ['-e', serverScript], {
  env: { ...process.env, TGZ_B64: tgzBody.toString('base64'), MD_B64: Buffer.from(mdBody).toString('base64') },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const started = new Promise<number>((resolvePort, reject) => {
  const timer = setTimeout(() => reject(new Error('test server did not start')), 10_000);
  serverProc.stdout!.once('data', (d: Buffer) => {
    const m = String(d).match(/PORT=(\d+)/);
    if (m) {
      clearTimeout(timer);
      resolvePort(Number(m[1]));
    }
  });
  serverProc.once('error', (err) => {
    clearTimeout(timer);
    reject(err);
  });
});

afterAll(() => {
  serverProc.kill();
});

describe('add via direct download URL', () => {
  it('installs a skill from a tar.gz URL', async () => {
    const port = await started;
    const testDir = join(tmpdir(), `skill-master-add-dl-${Date.now()}`);
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    try {
      const result = runCli(['add', `http://127.0.0.1:${port}/skill.tgz`, '--yes'], testDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Using direct download');
      expect(existsSync(join(testDir, '.claude', 'skills', 'downloaded-skill'))).toBe(true);

      const lock = JSON.parse(readFileSync(join(testDir, 'skills-lock.json'), 'utf-8'));
      expect(lock.skills['downloaded-skill'].source).toBe(`http://127.0.0.1:${port}/skill.tgz`);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 45000);

  it('installs a skill from a single SKILL.md URL', async () => {
    const port = await started;
    const testDir = join(tmpdir(), `skill-master-add-md-${Date.now()}`);
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    try {
      const result = runCli(['add', `http://127.0.0.1:${port}/SKILL.md`, '--yes'], testDir);
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(testDir, '.claude', 'skills', 'md-url-skill'))).toBe(true);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 45000);
});
