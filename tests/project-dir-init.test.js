import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersonaManager } from '../src/PersonaManager.js';

const PAGEANT_DIR = 'D:/claudeTools/mcp_pageant';
const AGENT_CWD = 'C:/James/feudle/.pageant/athena_GAME';

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
    expect(pm.getProjectDirName()).toBe('c--james--feudle--.pageant--athena_game');
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
