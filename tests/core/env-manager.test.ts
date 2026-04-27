import { describe, it, expect } from 'vitest';
import { mergeEnv, mergeEnvRecords } from '../../src/core/env-manager.js';

describe('env-manager', () => {
  it('fills empty higher-priority values from lower-priority non-empty values', () => {
    const merged = mergeEnvRecords([
      {
        data: {
          OPENAI_API_KEY: 'key',
          OPENAI_IMAGE_QUALITY: '',
        },
        mtimeMs: 2,
        priority: 0,
      },
      {
        data: {
          OPENAI_IMAGE_QUALITY: 'high',
          OPENAI_IMAGE_STYLE: 'vivid',
        },
        mtimeMs: 1,
        priority: 1,
      },
    ]);

    expect(merged).toEqual({
      OPENAI_API_KEY: 'key',
      OPENAI_IMAGE_QUALITY: 'high',
      OPENAI_IMAGE_STYLE: 'vivid',
    });
  });

  it('prefers newer non-empty values when different sources disagree', () => {
    const merged = mergeEnvRecords([
      {
        data: {
          OPENAI_IMAGE_SIZE: '1024x1024',
        },
        mtimeMs: 1,
        priority: 0,
      },
      {
        data: {
          OPENAI_IMAGE_SIZE: '2048x2048',
        },
        mtimeMs: 2,
        priority: 1,
      },
    ]);

    expect(merged.OPENAI_IMAGE_SIZE).toBe('2048x2048');
  });

  it('uses source order as the tie-breaker when mtimes are equal', () => {
    const merged = mergeEnvRecords([
      {
        data: {
          OPENAI_IMAGE_QUALITY: 'hd',
        },
        mtimeMs: 1,
        priority: 0,
      },
      {
        data: {
          OPENAI_IMAGE_QUALITY: 'high',
        },
        mtimeMs: 1,
        priority: 1,
      },
    ]);

    expect(merged.OPENAI_IMAGE_QUALITY).toBe('hd');
  });

  it('renders from the skill template and overlays custom values', () => {
    const content = mergeEnv(
      {
        OPENAI_API_KEY: 'key',
        OPENAI_IMAGE_QUALITY: 'high',
      },
      [
        '# Example comment',
        'OPENAI_API_KEY=',
        'OPENAI_IMAGE_SIZE=1024x1024',
        'OPENAI_IMAGE_QUALITY=',
        'OPENAI_IMAGE_N=1',
        '',
      ].join('\n'),
    );

    expect(content).toContain('# Example comment');
    expect(content).toContain('OPENAI_IMAGE_SIZE=1024x1024');
    expect(content).toContain('OPENAI_IMAGE_QUALITY=high');
    expect(content).toContain('OPENAI_IMAGE_N=1');
    expect(content).not.toContain('New keys added by skill update');
  });

  it('does not treat explanatory comments as real template assignments', () => {
    const content = mergeEnv(
      {
        OPENAI_IMAGE_PROTOCOL: 'openai_chat',
      },
      [
        '# gpt-image-2 OpenAI-compatible API configuration.',
        '# OPENAI_IMAGE_PROTOCOL=openai_chat is the verified local proxy path; openai_images calls /images/* endpoints.',
        '',
        'OPENAI_IMAGE_PROTOCOL=openai_images',
        '',
      ].join('\n'),
    );

    const protocolLines = content
      .split('\n')
      .filter((line) => line.trim() === 'OPENAI_IMAGE_PROTOCOL=openai_chat');

    expect(content).toContain('# OPENAI_IMAGE_PROTOCOL=openai_chat is the verified local proxy path; openai_images calls /images/* endpoints.');
    expect(protocolLines).toHaveLength(1);
    expect(content).not.toContain('\nOPENAI_IMAGE_PROTOCOL=openai_chat\n\nOPENAI_IMAGE_PROTOCOL=openai_chat');
  });
});
