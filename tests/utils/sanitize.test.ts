import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stripTerminalEscapes } from '../../src/utils/sanitize.js';
import * as logger from '../../src/utils/logger.js';
import { runCli } from '../test-utils.js';

describe('stripTerminalEscapes', () => {
  it('strips CSI sequences (SGR colors, cursor movement, clear screen)', () => {
    expect(stripTerminalEscapes('\x1b[31mred\x1b[0m')).toBe('red');
    expect(stripTerminalEscapes('a\x1b[2Jb\x1b[1;1Hc')).toBe('abc');
  });

  it('strips OSC sequences (terminal title, hyperlinks) with BEL or ST terminators', () => {
    expect(stripTerminalEscapes('x\x1b]0;pwned\x07y')).toBe('xy');
    expect(stripTerminalEscapes('\x1b]8;;http://evil.example\x1b\\click\x1b]8;;\x1b\\')).toBe('click');
  });

  it('strips C0/C1 control characters, DEL and bare ESC', () => {
    expect(stripTerminalEscapes('a\x00b\x07c\x7fd\x9be\x1bf')).toBe('abcdef');
    expect(stripTerminalEscapes('line1\rline2')).toBe('line1line2');
  });

  it('keeps newlines, tabs and unicode text intact', () => {
    expect(stripTerminalEscapes('第一行\n\t缩进 🚀 café')).toBe('第一行\n\t缩进 🚀 café');
  });

  it('is a no-op for plain text', () => {
    expect(stripTerminalEscapes('skill-master add owner/repo')).toBe('skill-master add owner/repo');
  });
});

describe('logger sanitization', () => {
  afterEach(() => vi.restoreAllMocks());

  it('strips injected escapes from messages while keeping its own coloring', () => {
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => { out.push(line); });

    logger.info('Found skill: evil\x1b]0;PWNED\x07name');
    logger.tableRow('a\x1b[2Jb', 'c\rd');
    logger.kv('key\x1b[31m', 'value\x1b]8;;http://x\x07');

    const joined = out.join('\n');
    expect(joined).not.toContain('\x1b]');          // 无 OSC
    expect(joined).not.toContain('PWNED');
    expect(joined).not.toContain('\x1b[2J');        // 无注入的 CSI
    expect(joined).toContain('evilname');
    expect(joined).toContain('ab');
    expect(joined).toContain('cd');
  });
});

describe('end-to-end: untrusted SKILL.md fields never reach the terminal raw', () => {
  it('add --list output contains no OSC/injected CSI from a malicious description', () => {
    const testDir = join(tmpdir(), `skill-master-sanitize-${Date.now()}`);
    mkdirSync(join(testDir, 'skill-src'), { recursive: true });
    writeFileSync(
      join(testDir, 'skill-src', 'SKILL.md'),
      `---\nname: evil-skill\ndescription: "harmless\\u001b]0;PWNED\\u0007 text \\u001b[2J"\n---\n# evil\n`,
      'utf-8',
    );
    try {
      // --list 会把 description 打进表格（经 logger.tableRow 清洗）
      const result = runCli(['add', './skill-src', '--list'], testDir);
      const output = result.stdout + result.stderr;
      expect(result.exitCode).toBe(0);
      expect(output).toContain('harmless');            // description 确实被打印（用例非空转）
      expect(output).not.toContain('\x1b]');
      expect(output).not.toContain('\x1b[2J');
      expect(output).not.toContain('PWNED');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, 30000);
});
