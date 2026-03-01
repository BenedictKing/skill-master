import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { getPluginGroupings, getPluginSkillPaths } from '../../src/core/plugin-manifest.js';

const TEST_DIR = join(process.cwd(), 'test-plugin-manifest');

describe('plugin-manifest', () => {
  describe('getPluginGroupings', () => {
    beforeAll(async () => {
      await mkdir(TEST_DIR, { recursive: true });
      await mkdir(join(TEST_DIR, '.claude-plugin'), { recursive: true });

      const manifest = {
        plugins: [
          {
            name: 'document-skills',
            source: './',
            skills: ['./skills/xlsx', './skills/docx'],
          },
          {
            name: 'example-skills',
            source: './',
            skills: ['./skills/art'],
          },
        ],
      };

      await writeFile(
        join(TEST_DIR, '.claude-plugin/marketplace.json'),
        JSON.stringify(manifest)
      );
    });

    afterAll(async () => {
      await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should map skill paths to plugin names', async () => {
      const groupings = await getPluginGroupings(TEST_DIR);

      const xlsxPath = resolve(TEST_DIR, 'skills/xlsx');
      const docxPath = resolve(TEST_DIR, 'skills/docx');
      const artPath = resolve(TEST_DIR, 'skills/art');

      expect(groupings.get(xlsxPath)).toBe('document-skills');
      expect(groupings.get(docxPath)).toBe('document-skills');
      expect(groupings.get(artPath)).toBe('example-skills');
    });

    it('should return empty map for missing manifest', async () => {
      const emptyDir = join(TEST_DIR, 'empty');
      await mkdir(emptyDir, { recursive: true });

      const groupings = await getPluginGroupings(emptyDir);
      expect(groupings.size).toBe(0);

      await rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe('getPluginSkillPaths', () => {
    beforeAll(async () => {
      await mkdir(TEST_DIR, { recursive: true });
      await mkdir(join(TEST_DIR, '.claude-plugin'), { recursive: true });

      const manifest = {
        plugins: [
          {
            name: 'my-plugin',
            source: './',
            skills: ['./skills/foo'],
          },
        ],
      };

      await writeFile(
        join(TEST_DIR, '.claude-plugin/marketplace.json'),
        JSON.stringify(manifest)
      );
    });

    afterAll(async () => {
      await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should return skill parent directories from manifest', async () => {
      const paths = await getPluginSkillPaths(TEST_DIR);

      // Should include the parent directory of the skill path
      expect(paths).toContain(join(TEST_DIR, 'skills'));
      // Should also include the conventional skills/ directory
      expect(paths.filter(p => p.includes('skills')).length).toBeGreaterThan(0);
    });

    it('should return empty array for missing manifest', async () => {
      const emptyDir = join(TEST_DIR, 'empty2');
      await mkdir(emptyDir, { recursive: true });

      const paths = await getPluginSkillPaths(emptyDir);
      expect(paths).toEqual([]);

      await rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe('path traversal prevention', () => {
    it('should reject paths with ../', async () => {
      const evilDir = join(TEST_DIR, 'evil');
      await mkdir(evilDir, { recursive: true });
      await mkdir(join(evilDir, '.claude-plugin'), { recursive: true });

      const manifest = {
        plugins: [
          {
            name: 'evil-plugin',
            source: './',
            skills: ['../../../etc/passwd'], // Path traversal attempt
          },
        ],
      };

      await writeFile(
        join(evilDir, '.claude-plugin/marketplace.json'),
        JSON.stringify(manifest)
      );

      const groupings = await getPluginGroupings(evilDir);
      // Should be empty because the path doesn't start with './'
      expect(groupings.size).toBe(0);

      await rm(evilDir, { recursive: true, force: true });
    });

    it('should reject invalid source paths', async () => {
      const invalidDir = join(TEST_DIR, 'invalid');
      await mkdir(invalidDir, { recursive: true });
      await mkdir(join(invalidDir, '.claude-plugin'), { recursive: true });

      const manifest = {
        plugins: [
          {
            name: 'invalid-plugin',
            source: '/absolute/path', // Invalid: must start with './'
            skills: ['./skills/foo'],
          },
        ],
      };

      await writeFile(
        join(invalidDir, '.claude-plugin/marketplace.json'),
        JSON.stringify(manifest)
      );

      const groupings = await getPluginGroupings(invalidDir);
      expect(groupings.size).toBe(0);

      await rm(invalidDir, { recursive: true, force: true });
    });
  });
});
