import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersonaManager } from '../src/PersonaManager.js';

import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync } from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGEANT_DIR = path.resolve(__dirname, '..');
const AGENT_CWD = path.join(os.tmpdir(), 'pageant-test', 'myproject', '.pageant', 'agent_role');

mkdirSync(AGENT_CWD, { recursive: true });

describe('PersonaManager projectDirName initialization', () => {
  let originalCwd;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('should be null without initialCwd', async () => {
    process.chdir(AGENT_CWD);
    const pm = new PersonaManager(PAGEANT_DIR);
    await pm.projectDirNameInitialized;
    expect(pm.getProjectDirName()).toBeNull();
  });

  it('should resolve with initialCwd', async () => {
    process.chdir(AGENT_CWD);
    const pm = new PersonaManager(PAGEANT_DIR, { initialCwd: process.cwd() });
    await pm.projectDirNameInitialized;
    const expectedId = pm.generatePathId(AGENT_CWD);
    expect(pm.getProjectDirName()).toBe(expectedId);
  });
});

describe('handleInspect requires projectPath', () => {
  let originalCwd;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('should throw when called without projectPath', async () => {
    process.chdir(AGENT_CWD);
    const pm = new PersonaManager(PAGEANT_DIR, { initialCwd: process.cwd() });
    await pm.projectDirNameInitialized;
    await expect(pm.handleInspect()).rejects.toThrow('handleInspect requires projectPath');
  });

  it('should succeed when called with projectPath', async () => {
    process.chdir(AGENT_CWD);
    const pm = new PersonaManager(PAGEANT_DIR, { initialCwd: process.cwd() });
    await pm.projectDirNameInitialized;
    const result = await pm.handleInspect(process.cwd());
    expect(result.content).toBeDefined();
  });
});
