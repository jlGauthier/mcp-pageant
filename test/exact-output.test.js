import { describe, it, beforeEach } from 'vitest';
import { expect } from 'vitest';
import { PersonaManager } from '../src/PersonaManager.js';
import { formatWithContext } from '../src/formatMarkdown.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Exact Output Format', () => {
  let pm;

  beforeEach(() => {
    const baseDir = path.join(__dirname, '..');
    pm = new PersonaManager(baseDir);
  });

  it('should produce exact Tech section format', async () => {
    // File: # MCP Author Guidelines\n## MCP Configuration
    // Single file in section, should produce:
    // # Tech: Mcp Author Guidelines
    // ### MCP Configuration     <- demoted from ##

    const fileDataList = [
      ['010.15', './manifest/010_tech/15_mcp_author.md', '15_mcp_author.md',
       '# MCP Author Guidelines\n\n## MCP Configuration\n\nContent...']
    ];

    const formatted = await formatWithContext(fileDataList, pm.multiManifest);

    expect(formatted).toContain('# Tech: Mcp Author Guidelines');
    expect(formatted).toContain('### MCP Configuration');
    expect(formatted).not.toContain('## Mcp Author.md');
    // Check that "## MCP Configuration" doesn't appear at line start (would be captured by "###" substring match)
    expect(formatted).not.toMatch(/\n## MCP Configuration/); // Should be ###
  });

  it('should produce exact Main section format', async () => {
    // File: # Main\n## Core Identity
    // Single file, first header matches section, should produce:
    // # Main: Agent
    // ## Core Identity  <- NOT demoted because first header matched section

    const fileDataList = [
      ['001', './manifest/001_main/agent.md', 'agent.md',
       '# Main\n\n## Core Identity\n\nContent...']
    ];

    const formatted = await formatWithContext(fileDataList, pm.multiManifest);

    expect(formatted).toContain('# Main: Agent');
    expect(formatted).toContain('## Core Identity');
    expect(formatted).not.toContain('### Core Identity');
  });
});
