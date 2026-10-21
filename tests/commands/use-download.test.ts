import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdirSync, rmSync } from 'node:fs';
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
  { path: 'use-dl-skill/SKILL.md', content: '---\nname: use-dl-skill\ndescription: from tgz url\n---\n# use-dl-skill\nDownloaded body.\n' },
]));
const mdBody = '---\nname: use-md-skill\ndescription: from md url\n---\n# use-md-skill\nMarkdown body.\n';

// 服务器必须独立进程：runCli 用 execFileSync 会阻塞本进程事件循环（见 add-download.test.ts）
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
    if (m) { clearTimeout(timer); resolvePort(Number(m[1])); }
  });
  serverProc.once('error', (err) => { clearTimeout(timer); reject(err); });
});

afterAll(() => { serverProc.kill(); });

describe('use via direct download URL', () => {
  it('materializes a tar.gz URL and prints its prompt', async () => {
    const port = await started;
    const testDir = join(tmpdir(), `skill-master-use-dl-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    try {
      const result = runCli(['use', `http://127.0.0.1:${port}/skill.tgz`], testDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('use-dl-skill');
      expect(result.stdout).toContain('Downloaded body.');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 45000);

  it('materializes a single SKILL.md URL', async () => {
    const port = await started;
    const testDir = join(tmpdir(), `skill-master-use-md-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    try {
      const result = runCli(['use', `http://127.0.0.1:${port}/SKILL.md`], testDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('use-md-skill');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 45000);
});
