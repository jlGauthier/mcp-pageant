import { describe, it, expect } from 'vitest';
import { PersonaManager } from '../src/PersonaManager.js';

import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGEANT_DIR = path.resolve(__dirname, '..');
const AGENT_CWD = path.join(os.tmpdir(), 'pageant-test', 'myproject', '.pageant', 'agent_role');

mkdirSync(AGENT_CWD, { recursive: true });

describe('PersonaManager getTemplatePath', () => {
  it('requires a projectPath', () => {
    const pm = new PersonaManager(PAGEANT_DIR);
    expect(() => pm.getTemplatePath()).toThrow('getTemplatePath requires projectPath');
  });

  it('returns pageant.template.md inside the given project directory', () => {
    const pm = new PersonaManager(PAGEANT_DIR);
    expect(pm.getTemplatePath(AGENT_CWD))
      .toBe(path.join(AGENT_CWD, 'pageant.template.md'));
  });
});

describe('PersonaManager.deriveProjectFromPath', () => {
  it('extracts the project segment above .pageant', () => {
    const pm = new PersonaManager(PAGEANT_DIR);
    expect(pm.deriveProjectFromPath('C:\\Work\\Acme\\.pageant\\backend')).toBe('acme');
    expect(pm.deriveProjectFromPath('/home/me/projects/foo/.pageant/qa')).toBe('foo');
  });

  it('falls back to the directory name when no .pageant is present', () => {
    const pm = new PersonaManager(PAGEANT_DIR);
    expect(pm.deriveProjectFromPath('/home/me/projects/Standalone')).toBe('standalone');
  });
});

describe('handleInspect requires projectPath', () => {
  it('throws when called without projectPath', async () => {
    const pm = new PersonaManager(PAGEANT_DIR);
    await expect(pm.handleInspect()).rejects.toThrow('handleInspect requires projectPath');
  });

  it('succeeds when called with projectPath', async () => {
    const pm = new PersonaManager(PAGEANT_DIR);
    const result = await pm.handleInspect(AGENT_CWD);
    expect(result.content).toBeDefined();
  });
});
