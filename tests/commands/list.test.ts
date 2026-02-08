import { describe, it, expect } from 'vitest';
import { parseListFlags } from '../../src/commands/list.js';

describe('list command', () => {
  describe('parseListFlags', () => {
    it('should parse empty args', () => {
      const result = parseListFlags([]);
      expect(result.global).toBe(false);
      expect(result.agent).toEqual([]);
    });

    it('should parse -g flag', () => {
      const result = parseListFlags(['-g']);
      expect(result.global).toBe(true);
    });

    it('should parse --global flag', () => {
      const result = parseListFlags(['--global']);
      expect(result.global).toBe(true);
    });

    it('should parse -a flag with single agent', () => {
      const result = parseListFlags(['-a', 'claude-code']);
      expect(result.agent).toEqual(['claude-code']);
    });

    it('should parse --agent flag with single agent', () => {
      const result = parseListFlags(['--agent', 'cursor']);
      expect(result.agent).toEqual(['cursor']);
    });

    it('should parse -a flag with multiple agents', () => {
      const result = parseListFlags(['-a', 'claude-code', 'cursor', 'cline']);
      expect(result.agent).toEqual(['claude-code', 'cursor', 'cline']);
    });

    it('should parse --agent=value syntax (backward compat)', () => {
      const result = parseListFlags(['--agent=cursor']);
      expect(result.agent).toEqual(['cursor']);
    });

    it('should parse combined flags', () => {
      const result = parseListFlags(['-g', '-a', 'claude-code', 'cursor']);
      expect(result.global).toBe(true);
      expect(result.agent).toEqual(['claude-code', 'cursor']);
    });

    it('should stop collecting agents at next flag', () => {
      const result = parseListFlags(['-a', 'claude-code', '-g']);
      expect(result.agent).toEqual(['claude-code']);
      expect(result.global).toBe(true);
    });

    it('should handle multiple --agent flags', () => {
      const result = parseListFlags(['-a', 'claude-code', '-a', 'cursor']);
      expect(result.agent).toEqual(['claude-code', 'cursor']);
    });

    it('should ignore unknown flags gracefully', () => {
      const result = parseListFlags(['-g', '--unknown', '-a', 'cursor']);
      expect(result.global).toBe(true);
      expect(result.agent).toEqual(['cursor']);
    });
  });
});
