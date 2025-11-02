import { describe, it, beforeEach } from 'vitest';
import { expect } from 'vitest';
import { MultiManifest } from '../src/MultiManifest.js';
import { formatWithContext } from '../src/formatMarkdown.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('No Duplicate Headers', () => {
  let multiManifest;

  beforeEach(() => {
    const baseDir = path.join(__dirname, '..');
    const manifestDirs = [path.join(baseDir, 'manifest')];
    multiManifest = new MultiManifest(manifestDirs);
  });

  it('should NOT have duplicate Main headers', async () => {
    // agent.md contains: # Main\n## Core Identity
    // PersonaManager strips first # header, so content passed here is: \n## Core Identity
    // After formatting should be: # Main: Agent\n## Core Identity

    const fileDataList = [
      ['001', './manifest/001_main/agent.md', 'agent.md', '## Core Identity\n\nContent here...']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    // Should have exactly ONE occurrence of "# Main"
    const mainHeaderMatches = formatted.match(/^# Main/gm);
    expect(mainHeaderMatches).toBeTruthy();
    expect(mainHeaderMatches.length).toBe(1);

    // Should NOT have "# Main\n# Main" pattern
    expect(formatted).not.toMatch(/# Main.*\n# Main/);
  });

  it('should handle file title headers correctly', async () => {
    // mcp_author.md has: # MCP Author Guidelines\n## MCP Configuration
    // PersonaManager strips first #, so content is: ## MCP Configuration
    // Should output section header, NOT the stripped file title

    const fileDataList = [
      ['010.15', './manifest/010_tech/15_mcp_author.md', '15_mcp_author.md',
       '## MCP Configuration\n\nContent...']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    // Should have section header
    expect(formatted).toContain('# Tech');

    // Should NOT have the file's original # header in output
    expect(formatted).not.toContain('# MCP Author Guidelines');
  });
});
