import { describe, it, expect } from 'vitest';
import { parseRemoveFlags } from '../../src/commands/remove.js';

describe('remove command', () => {
  describe('parseRemoveFlags', () => {
    it('should parse skill names as positional arguments', () => {
      const result = parseRemoveFlags(['skill1', 'skill2']);
      expect(result.names).toEqual(['skill1', 'skill2']);
      expect(result.flags.yes).toBe(false);
    });

    it('should parse -g flag', () => {
      const result = parseRemoveFlags(['skill1', '-g']);
      expect(result.names).toEqual(['skill1']);
      expect(result.flags.global).toBe(true);
    });

    it('should parse --global flag', () => {
      const result = parseRemoveFlags(['skill1', '--global']);
      expect(result.flags.global).toBe(true);
    });

    it('should parse -a flag with single agent', () => {
      const result = parseRemoveFlags(['skill1', '-a', 'claude-code']);
      expect(result.flags.agent).toEqual(['claude-code']);
    });

    it('should parse --agent flag with multiple agents', () => {
      const result = parseRemoveFlags(['skill1', '--agent', 'claude-code', 'cursor']);
      expect(result.flags.agent).toEqual(['claude-code', 'cursor']);
    });

    it('should parse --agent=value syntax (backward compat)', () => {
      const result = parseRemoveFlags(['skill1', '--agent=cursor']);
      expect(result.flags.agent).toEqual(['cursor']);
    });

    it('should parse -s flag with skill names', () => {
      const result = parseRemoveFlags(['-s', 'skill1', 'skill2']);
      expect(result.flags.skill).toEqual(['skill1', 'skill2']);
    });

    it('should parse --skill flag', () => {
      const result = parseRemoveFlags(['--skill', 'my-skill']);
      expect(result.flags.skill).toEqual(['my-skill']);
    });

    it('should parse -y flag', () => {
      const result = parseRemoveFlags(['skill1', '-y']);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse --yes flag', () => {
      const result = parseRemoveFlags(['skill1', '--yes']);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse --all flag', () => {
      const result = parseRemoveFlags(['--all']);
      expect(result.flags.all).toBe(true);
    });

    it('should parse --purge flag', () => {
      const result = parseRemoveFlags(['skill1', '--purge']);
      expect(result.flags.purge).toBe(true);
    });

    it('should parse combined flags', () => {
      const result = parseRemoveFlags(['skill1', '-g', '-y', '--purge']);
      expect(result.names).toEqual(['skill1']);
      expect(result.flags.global).toBe(true);
      expect(result.flags.yes).toBe(true);
      expect(result.flags.purge).toBe(true);
    });

    it('should parse multiple skill names with flags', () => {
      const result = parseRemoveFlags(['skill1', 'skill2', '-y', '--purge']);
      expect(result.names).toEqual(['skill1', 'skill2']);
      expect(result.flags.yes).toBe(true);
      expect(result.flags.purge).toBe(true);
    });

    it('should stop collecting agents at next flag', () => {
      const result = parseRemoveFlags(['-a', 'claude-code', '-g']);
      expect(result.flags.agent).toEqual(['claude-code']);
      expect(result.flags.global).toBe(true);
    });

    it('should stop collecting skills at next flag', () => {
      const result = parseRemoveFlags(['-s', 'skill1', '-y']);
      expect(result.flags.skill).toEqual(['skill1']);
      expect(result.flags.yes).toBe(true);
    });

    it('should handle no skill names provided', () => {
      const result = parseRemoveFlags(['-g', '-y']);
      expect(result.names).toEqual([]);
      expect(result.flags.global).toBe(true);
      expect(result.flags.yes).toBe(true);
    });

    it('should parse complex combination', () => {
      const result = parseRemoveFlags([
        'skill1',
        'skill2',
        '-g',
        '-a',
        'claude-code',
        'cursor',
        '-y',
        '--purge',
      ]);
      expect(result.names).toEqual(['skill1', 'skill2']);
      expect(result.flags.global).toBe(true);
      expect(result.flags.agent).toEqual(['claude-code', 'cursor']);
      expect(result.flags.yes).toBe(true);
      expect(result.flags.purge).toBe(true);
    });

    it('should handle --all with -y', () => {
      const result = parseRemoveFlags(['--all', '-y']);
      expect(result.flags.all).toBe(true);
      expect(result.flags.yes).toBe(true);
    });

    it('should mix positional and --skill flag', () => {
      const result = parseRemoveFlags(['skill1', '--skill', 'skill2', 'skill3']);
      expect(result.names).toEqual(['skill1']);
      expect(result.flags.skill).toEqual(['skill2', 'skill3']);
    });
  });
});
