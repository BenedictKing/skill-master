import { describe, it, expect } from 'vitest';
import { parseSkillMd, serializeSkillMd } from '../../src/core/skill-parser.js';

describe('skill parser', () => {
  it('parses allowed-tools from a space-separated string', () => {
    const parsed = parseSkillMd(`---\nname: test-skill\ndescription: test skill\nallowed-tools: Bash Read Glob Write Edit\n---\n# test\n`);

    expect(parsed.frontmatter['allowed-tools']).toEqual(['Bash', 'Read', 'Glob', 'Write', 'Edit']);
  });

  it('keeps array-based allowed-tools compatible', () => {
    const parsed = parseSkillMd(`---\nname: test-skill\ndescription: test skill\nallowed-tools:\n  - Read\n  - Edit\n---\n# test\n`);

    expect(parsed.frontmatter['allowed-tools']).toEqual(['Read', 'Edit']);
  });

  it('normalizes comma-separated and duplicate allowed-tools', () => {
    const parsed = parseSkillMd(`---\nname: test-skill\ndescription: test skill\nallowed-tools: Bash, Read   Read, Edit\n---\n# test\n`);

    expect(parsed.frontmatter['allowed-tools']).toEqual(['Bash', 'Read', 'Edit']);
  });

  it('rejects non-string items in allowed-tools arrays', () => {
    expect(() => parseSkillMd(`---\nname: test-skill\ndescription: test skill\nallowed-tools:\n  - Read\n  - 123\n---\n# test\n`)).toThrow('array items must be strings');
  });

  it('serializes allowed-tools back to the official string format', () => {
    const content = serializeSkillMd({
      frontmatter: {
        name: 'test-skill',
        description: 'test skill',
        'allowed-tools': ['Read', 'Edit'],
      },
      body: '# test\n',
      rawFrontmatter: '',
    });

    expect(content).toContain('allowed-tools: Read Edit');
    expect(content).not.toContain('allowed-tools:\n  - Read');
  });
});
