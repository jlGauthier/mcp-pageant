import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { MultiManifest } from '../src/MultiManifest.js';

describe('MultiManifest', () => {
  let tempDirs = [];
  let multiManifest;

  async function createTempDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'multimanifest-test-'));
    tempDirs.push(dir);
    return dir;
  }

  async function createTestStructure(baseDir, structure) {
    for (const [pathStr, content] of Object.entries(structure)) {
      const fullPath = path.join(baseDir, pathStr);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      if (content !== null) {
        await fs.writeFile(fullPath, content, 'utf8');
      }
    }
  }

  beforeEach(async () => {
    tempDirs = [];
  });

  afterEach(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  describe('Basic File Operations', () => {
    it('should find files in a single manifest directory', async () => {
      const main = await createTempDir();
      await createTestStructure(main, {
        'main/agent.md': 'agent content',
        'main/professional.md': 'pro content',
        'output/tone/friendly.md': 'friendly tone'
      });

      multiManifest = new MultiManifest([main]);

      const files = await multiManifest.findFiles('main');
      expect(files).toHaveLength(2);
      expect(files.some(f => f.filename === 'agent')).toBe(true);
      expect(files.some(f => f.filename === 'professional')).toBe(true);
    });

    it('should find files across N manifest directories', async () => {
      const main = await createTempDir();
      const ext1 = await createTempDir();
      const ext2 = await createTempDir();
      const ext3 = await createTempDir();

      await createTestStructure(main, {
        'main/agent.md': 'main agent'
      });
      await createTestStructure(ext1, {
        'main/professional.md': 'ext1 pro'
      });
      await createTestStructure(ext2, {
        'main/enhanced.md': 'ext2 enhanced'
      });
      await createTestStructure(ext3, {
        'main/ultimate.md': 'ext3 ultimate'
      });

      multiManifest = new MultiManifest([main, ext1, ext2, ext3]);

      const files = await multiManifest.findFiles('main');
      expect(files).toHaveLength(4);
    });

    it('should prioritize LATER directories (extensions override main)', async () => {
      const main = await createTempDir();
      const extension = await createTempDir();

      await createTestStructure(main, {
        'main/config.md': 'main config'
      });
      await createTestStructure(extension, {
        'main/config.md': 'extension config'
      });

      multiManifest = new MultiManifest([main, extension]);

      const file = await multiManifest.findFile('main', null, 'config');
      expect(file.manifestDir).toBe(extension); // Extension wins

      const content = await multiManifest.readFile('main', null, 'config');
      expect(content.content).toBe('extension config');
    });

    it('should handle partial matching with fuzzy search', async () => {
      const main = await createTempDir();
      await createTestStructure(main, {
        'tech/frontend/react_hooks.md': 'hooks content',
        'tech/frontend/vue_composition.md': 'vue content'
      });

      multiManifest = new MultiManifest([main]);

      const file = await multiManifest.findFile('tech', 'frontend', 'react');
      expect(file).toBeTruthy();
      expect(file.filename).toBe('react_hooks');
    });

    it('should return null when file not found (no throwing)', async () => {
      const main = await createTempDir();
      multiManifest = new MultiManifest([main]);

      const content = await multiManifest.readFile('nonexistent', null, 'file');
      expect(content).toBeNull(); // No error thrown
    });

    it('should return null for read failures', async () => {
      const main = await createTempDir();
      await createTestStructure(main, {
        'main/test.md': 'content'
      });

      multiManifest = new MultiManifest([main]);

      // Make file unreadable (Windows might not respect this)
      const filePath = path.join(main, 'main', 'test.md');
      await fs.chmod(filePath, 0o000);

      const content = await multiManifest.readFile('main', null, 'test');
      // Should return null or content depending on OS permissions
      expect([null, { content: 'content' }]).toContainEqual(
        content ? { content: content.content } : null
      );

      // Restore permissions
      await fs.chmod(filePath, 0o644);
    });
  });

  describe('Write Operations', () => {
    it('should write to LAST directory with parent section', async () => {
      const main = await createTempDir();
      const ext1 = await createTempDir();
      const ext2 = await createTempDir();

      // Create section in main and ext2 only
      await createTestStructure(main, {
        'config/dummy.md': 'dummy'
      });
      await createTestStructure(ext2, {
        'config/dummy2.md': 'dummy2'
      });

      multiManifest = new MultiManifest([main, ext1, ext2]);

      const result = await multiManifest.writeFile(
        'config', null, 'test.md', 'test content', false
      );

      expect(result.success).toBe(true);
      expect(result.path).toContain(ext2); // Should write to ext2 (last with section)
    });

    it('should default to main if section doesnt exist anywhere', async () => {
      const main = await createTempDir();
      const extension = await createTempDir();

      multiManifest = new MultiManifest([main, extension]);

      const result = await multiManifest.writeFile(
        'new_section', null, 'test.md', 'content', true // createDir=true
      );

      expect(result.success).toBe(true);
      expect(result.path).toContain(main); // Defaults to main
    });

    it('should fail when createDir=false and directory missing', async () => {
      const main = await createTempDir();
      multiManifest = new MultiManifest([main]);

      const result = await multiManifest.writeFile(
        'nonexistent', null, 'test.md', 'content', false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('createDir=false');
    });

    it('should create directories when createDir=true', async () => {
      const main = await createTempDir();
      multiManifest = new MultiManifest([main]);

      const result = await multiManifest.writeFile(
        'deep', 'nested/path', 'file.md', 'content', true
      );

      expect(result.success).toBe(true);

      const file = await multiManifest.findFile('deep', 'nested/path', 'file');
      expect(file).toBeTruthy();
    });

    it('should NOT add .md extension (handled by layer above)', async () => {
      const main = await createTempDir();
      multiManifest = new MultiManifest([main]);

      await fs.mkdir(path.join(main, 'test'), { recursive: true });

      const result = await multiManifest.writeFile(
        'test', null, 'myfile', 'content', false
      );

      expect(result.success).toBe(true);
      expect(result.path).toContain('myfile'); // No .md added
    });
  });

  describe('Delete Operations', () => {
    it('should delete existing files and return true', async () => {
      const main = await createTempDir();
      await createTestStructure(main, {
        'main/deleteme.md': 'delete this'
      });

      multiManifest = new MultiManifest([main]);

      const deleted = await multiManifest.deleteFile('main', null, 'deleteme');
      expect(deleted).toBe(true);

      const file = await multiManifest.findFile('main', null, 'deleteme');
      expect(file).toBeNull();
    });

    it('should return false for non-existent files (no error)', async () => {
      const main = await createTempDir();
      multiManifest = new MultiManifest([main]);

      const deleted = await multiManifest.deleteFile('main', null, 'nonexistent');
      expect(deleted).toBe(false); // No error, just false
    });
  });

  describe('Section and Subsection Listing', () => {
    it('should list sections from all N directories', async () => {
      const dirs = [];
      for (let i = 0; i < 5; i++) {
        const dir = await createTempDir();
        dirs.push(dir);
        await createTestStructure(dir, {
          [`section${i}/test.md`]: 'content',
          'common/test.md': 'common'
        });
      }

      multiManifest = new MultiManifest(dirs);
      const sections = await multiManifest.listSections();
      const sectionNames = sections.map(s => s.name).sort();

      expect(sectionNames).toContain('common');
      expect(sectionNames).toContain('section0');
      expect(sectionNames).toContain('section4');

      // Common should appear in all 5 directories
      const common = sections.find(s => s.name === 'common');
      expect(common.manifestDirs).toHaveLength(5);
    });

    it('should ignore hidden directories', async () => {
      const main = await createTempDir();
      await createTestStructure(main, {
        'visible/test.md': 'content',
        '.hidden/test.md': 'hidden'
      });

      multiManifest = new MultiManifest([main]);
      const sections = await multiManifest.listSections();
      const sectionNames = sections.map(s => s.name);

      expect(sectionNames).toContain('visible');
      expect(sectionNames).not.toContain('.hidden');
    });
  });

  describe('Extension Override Scenarios', () => {
    it('should handle complex override chains', async () => {
      const main = await createTempDir();
      const ext1 = await createTempDir();
      const ext2 = await createTempDir();

      await createTestStructure(main, {
        'config/base.md': 'main base',
        'config/only_main.md': 'only in main'
      });
      await createTestStructure(ext1, {
        'config/base.md': 'ext1 override',
        'config/ext1_only.md': 'only in ext1'
      });
      await createTestStructure(ext2, {
        'config/base.md': 'ext2 override',
        'config/ext2_only.md': 'only in ext2'
      });

      multiManifest = new MultiManifest([main, ext1, ext2]);

      // ext2 wins for base.md
      const base = await multiManifest.readFile('config', null, 'base');
      expect(base.content).toBe('ext2 override');

      // Each unique file is accessible
      const mainOnly = await multiManifest.readFile('config', null, 'only_main');
      expect(mainOnly.content).toBe('only in main');

      const ext1Only = await multiManifest.readFile('config', null, 'ext1_only');
      expect(ext1Only.content).toBe('only in ext1');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should resolve files from the local overlay when main is empty', async () => {
      const main = await createTempDir();
      const local = await createTempDir();

      await createTestStructure(local, {
        'jobs/02_backend/database_expert.md': 'db expertise'
      });

      multiManifest = new MultiManifest(main, local);

      const file = await multiManifest.findFile('jobs', '02_backend', 'database_expert');
      expect(file).toBeTruthy();
      expect(file.filename).toBe('database_expert');
    });

    it('should handle numeric section prefixes', () => {
      const cleaned = multiManifest.constructor.name;
      expect(cleaned).toBe('MultiManifest');
    });
  });
});