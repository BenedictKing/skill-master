import { describe, it, expect } from 'vitest';
import {
  parseSource,
  parseGitIdentity,
  isSameGitRepo,
  getLockSource,
} from '../../src/core/git-source.js';

describe('parseSource', () => {
  it('parses SCP-style SSH URL as git', () => {
    expect(parseSource('git@github.com:owner/repo.git')).toEqual({
      type: 'git',
      url: 'git@github.com:owner/repo.git',
      skillFilter: undefined,
    });
  });

  it('parses ssh:// URL as git without mangling', () => {
    const parsed = parseSource('ssh://git@github.com/owner/repo.git');
    expect(parsed.type).toBe('git');
    expect(parsed.url).toBe('ssh://git@github.com/owner/repo.git');
  });

  it('parses git:// URL as git', () => {
    expect(parseSource('git://github.com/owner/repo.git').url).toBe('git://github.com/owner/repo.git');
  });

  it('parses owner/repo shorthand to https', () => {
    expect(parseSource('owner/repo').url).toBe('https://github.com/owner/repo.git');
  });
});

describe('parseGitIdentity', () => {
  it('normalizes SCP-style SSH', () => {
    expect(parseGitIdentity('git@github.com:owner/repo.git')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('normalizes ssh:// URL', () => {
    expect(parseGitIdentity('ssh://git@github.com/owner/repo.git')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('normalizes https URL', () => {
    expect(parseGitIdentity('https://github.com/owner/repo.git')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('normalizes shorthand to github.com host', () => {
    expect(parseGitIdentity('owner/repo')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('handles gitlab host', () => {
    expect(parseGitIdentity('https://gitlab.com/group/proj')).toEqual({
      host: 'gitlab.com',
      ownerRepo: 'group/proj',
    });
  });

  it('is case-insensitive for host and path', () => {
    expect(parseGitIdentity('https://GitHub.com/Owner/Repo')).toEqual({
      host: 'github.com',
      ownerRepo: 'owner/repo',
    });
  });

  it('returns null for non-git strings', () => {
    expect(parseGitIdentity('not-a-repo')).toBeNull();
    expect(parseGitIdentity('')).toBeNull();
  });
});

describe('isSameGitRepo', () => {
  it('treats SSH and HTTPS as the same repo', () => {
    expect(isSameGitRepo('git@github.com:owner/repo.git', 'https://github.com/owner/repo.git')).toBe(true);
    expect(isSameGitRepo('ssh://git@github.com/owner/repo.git', 'https://github.com/owner/repo.git')).toBe(true);
  });

  it('treats shorthand and https as the same repo', () => {
    expect(isSameGitRepo('owner/repo', 'https://github.com/owner/repo.git')).toBe(true);
  });

  it('treats .git suffix as irrelevant', () => {
    expect(isSameGitRepo('https://github.com/owner/repo', 'https://github.com/owner/repo.git')).toBe(true);
  });

  it('returns false for different repos', () => {
    expect(isSameGitRepo('owner/repo', 'owner/other')).toBe(false);
    expect(isSameGitRepo('owner/repo', 'other/repo')).toBe(false);
  });

  it('returns false for different hosts', () => {
    expect(isSameGitRepo('https://github.com/o/r', 'https://gitlab.com/o/r')).toBe(false);
  });

  it('returns false when either side is unparseable', () => {
    expect(isSameGitRepo('garbage', 'https://github.com/o/r')).toBe(false);
  });
});

describe('getLockSource', () => {
  it('preserves SCP-style SSH URL', () => {
    expect(getLockSource('git@github.com:o/r.git', 'git@github.com:o/r.git')).toBe('git@github.com:o/r.git');
  });

  it('preserves ssh:// URL', () => {
    expect(getLockSource('ssh://git@github.com/o/r.git', 'ssh://git@github.com/o/r.git'))
      .toBe('ssh://git@github.com/o/r.git');
  });

  it('uses normalized shorthand for GitHub HTTPS', () => {
    expect(getLockSource('https://github.com/o/r.git', 'o/r')).toBe('o/r');
  });

  it('preserves non-GitHub HTTPS URL', () => {
    expect(getLockSource('https://gitlab.com/o/r.git', 'https://gitlab.com/o/r.git'))
      .toBe('https://gitlab.com/o/r.git');
    expect(getLockSource('https://git.example.com/o/r.git', 'https://git.example.com/o/r.git'))
      .toBe('https://git.example.com/o/r.git');
  });
});
