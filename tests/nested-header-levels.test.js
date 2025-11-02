import { describe, it, beforeEach } from 'vitest';
import { expect } from 'vitest';
import { MultiManifest } from '../src/MultiManifest.js';
import { formatWithContext } from '../src/formatMarkdown.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Nested Header Levels', () => {
  let multiManifest;

  beforeEach(() => {
    const baseDir = path.join(__dirname, '..');
    const manifestDirs = [path.join(baseDir, 'manifest')];
    multiManifest = new MultiManifest(manifestDirs);
  });

  it('should demote ## headers to ### after stripping first #', async () => {
    // File structure: # MCP Author Guidelines\n## MCP Configuration\n## Path Formats
    // After stripping first header AND demoting: ### MCP Configuration\n### Path Formats
    const fileDataList = [
      ['010.15', './manifest/010_tech/15_mcp_author.md', '15_mcp_author.md',
       '### MCP Configuration\nContent...\n### Path Formats\nMore content...']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    // Should produce (single file, so combined header):
    // # Tech: Mcp Author.md: Mcp Author.md
    // ### MCP Configuration
    // Content...
    // ### Path Formats
    // More content...

    expect(formatted).toContain('# Tech');
    expect(formatted).toContain('### MCP Configuration');
    expect(formatted).toContain('### Path Formats');

    // Should NOT have ## for these subsections
    expect(formatted).not.toMatch(/\n## MCP Configuration/);
    expect(formatted).not.toMatch(/\n## Path Formats/);
  });

  it('should handle files with multiple ## sections in Tech', async () => {
    // After processing (stripping first # and demoting): ### headers
    const fileDataList = [
      ['010.15', './manifest/010_tech/15_mcp_author.md', '15_mcp_author.md',
       '### MCP Configuration\nFirst section...\n### Development Pattern\nSecond section...'],
      ['010.28', './manifest/010_tech/28_windows.md', '28_windows.md',
       '### Directories\nWindows dirs...\n### Files\nFile ops...']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    // With multiple files: # Tech\n\n## Mcp Author...\n### MCP Configuration\n\n## Windows...\n### Directories
    expect(formatted).toContain('# Tech');
    expect(formatted).toContain('### MCP Configuration');
    expect(formatted).toContain('### Development Pattern');
    expect(formatted).toContain('### Directories');
    expect(formatted).toContain('### Files');
  });

  it('should handle Main section headers after demotion', async () => {
    // agent.md has: # Main\n## Core Identity
    // After stripping # Main and demoting: ### Core Identity
    const fileDataList = [
      ['001', './manifest/001_main/agent.md', 'agent.md',
       '### Core Identity\nContent...\n### Core Values\nMore content...']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    // Single file in Main, so: # Main: Agent.md\n### Core Identity
    expect(formatted).toContain('# Main');
    expect(formatted).toContain('### Core Identity');
    expect(formatted).toContain('### Core Values');
  });

  it('should handle #### headers becoming #####', async () => {
    // After stripping first # and demoting: ### and #####
    const fileDataList = [
      ['020.01', './manifest/020_pattern/01_clean.md', '01_clean.md',
       '### Good\nContent...\n##### Specific Item\nDetails...']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    expect(formatted).toContain('### Good');
    expect(formatted).toContain('##### Specific Item');
  });
});
