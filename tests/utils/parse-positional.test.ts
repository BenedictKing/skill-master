import { describe, it, expect } from 'vitest';
import { parseSourceAndSkill } from '../../src/utils/parse-positional.js';

describe('parseSourceAndSkill', () => {
  it('should return empty source when no args', () => {
    const result = parseSourceAndSkill([]);
    expect(result).toEqual({ source: '' });
  });

  it('should parse single positional arg as source', () => {
    const result = parseSourceAndSkill(['owner/repo']);
    expect(result).toEqual({ source: 'owner/repo' });
  });

  it('should parse two positional args as source and skill', () => {
    const result = parseSourceAndSkill(['owner/repo', 'skill-name']);
    expect(result).toEqual({ source: 'owner/repo', skill: 'skill-name' });
  });

  it('should ignore flags when extracting positional args from raw input', () => {
    const result = parseSourceAndSkill(['owner/repo', '-g', 'skill-name', '--json']);
    // This helper only filters out flag tokens themselves; command-specific parsers
    // should avoid passing flag values when they are semantically bound to a flag.
    expect(result).toEqual({ source: 'owner/repo', skill: 'skill-name' });
  });

  it('should handle source@skill format as single arg', () => {
    const result = parseSourceAndSkill(['owner/repo@skill-name']);
    expect(result).toEqual({ source: 'owner/repo@skill-name' });
  });

  it('should take first two positional args when more than two', () => {
    const result = parseSourceAndSkill(['owner/repo', 'skill-a', 'skill-b']);
    expect(result).toEqual({ source: 'owner/repo', skill: 'skill-a' });
  });

  it('should handle local paths', () => {
    const result = parseSourceAndSkill(['./local-skill', 'my-skill']);
    expect(result).toEqual({ source: './local-skill', skill: 'my-skill' });
  });

  it('should handle flags before positional args', () => {
    const result = parseSourceAndSkill(['-g', '--yes', 'owner/repo', 'skill-name']);
    expect(result).toEqual({ source: 'owner/repo', skill: 'skill-name' });
  });
});
