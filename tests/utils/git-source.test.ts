import { describe, it, expect, vi, afterEach } from 'vitest';

const existsSyncMock = vi.fn();
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: existsSyncMock,
  };
});

const { parseSource } = await import('../../src/core/git-source.js');

describe('git source parser', () => {
  afterEach(() => {
    existsSyncMock.mockReset();
  });

  it('preserves skill filter on GitHub tree URLs', () => {
    existsSyncMock.mockReturnValue(false);
    const parsed = parseSource('https://github.com/owner/repo/tree/feature/skills/exa@exa-search');
    expect(parsed).toEqual({
      type: 'git',
      url: 'https://github.com/owner/repo.git',
      ref: 'feature',
      subpath: 'skills/exa',
      skillFilter: 'exa-search',
    });
  });

  it('preserves skill filter on plain GitHub URLs', () => {
    existsSyncMock.mockReturnValue(false);
    const parsed = parseSource('https://github.com/owner/repo@exa-search');
    expect(parsed).toEqual({
      type: 'git',
      url: 'https://github.com/owner/repo',
      skillFilter: 'exa-search',
    });
  });

  it('treats existing single-segment paths as local', () => {
    existsSyncMock.mockImplementation((path: string) => path === 'src');
    const parsed = parseSource('src');
    expect(parsed).toEqual({
      type: 'local',
      path: 'src',
    });
  });

});
