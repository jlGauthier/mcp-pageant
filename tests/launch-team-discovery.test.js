import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { discoverAgents } from '../scripts/launch-team.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pageant-launch-'));
}

describe('launch-team discovery', () => {
  let tmp;

  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('discovers a flat solo agent (CLAUDE.local.md at the directory root)', () => {
    fs.writeFileSync(path.join(tmp, 'CLAUDE.local.md'),
      '<!-- AGENT_NAME: Solo -->\n<!-- AGENT_COLOR: #ff0000 -->\n');

    const agents = discoverAgents(tmp);

    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Solo');
    expect(agents[0].color).toBe('#ff0000');
    expect(agents[0].dir).toBe(tmp);
  });

  it('discovers team-mode agents (subdirectories with CLAUDE files)', () => {
    const a = path.join(tmp, 'agent_a');
    const b = path.join(tmp, 'agent_b');
    fs.mkdirSync(a);
    fs.mkdirSync(b);
    fs.writeFileSync(path.join(a, 'CLAUDE.local.md'),
      '<!-- AGENT_NAME: Alpha -->\n<!-- AGENT_COLOR: #00ff00 -->\n');
    fs.writeFileSync(path.join(b, 'CLAUDE.local.md'),
      '<!-- AGENT_NAME: Beta -->\n<!-- AGENT_COLOR: #0000ff -->\n');

    const agents = discoverAgents(tmp);

    expect(agents).toHaveLength(2);
    const names = agents.map(a => a.name).sort();
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('flat solo takes precedence over subdirectory scan when root has CLAUDE file', () => {
    fs.writeFileSync(path.join(tmp, 'CLAUDE.local.md'),
      '<!-- AGENT_NAME: Root -->\n<!-- AGENT_COLOR: #ffffff -->\n');
    const sub = path.join(tmp, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'CLAUDE.local.md'),
      '<!-- AGENT_NAME: Sub -->\n<!-- AGENT_COLOR: #000000 -->\n');

    const agents = discoverAgents(tmp);

    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Root');
  });

  it('returns empty array for a directory with no CLAUDE files anywhere', () => {
    const agents = discoverAgents(tmp);
    expect(agents).toEqual([]);
  });
});
