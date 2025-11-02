import { describe, it, beforeEach } from 'vitest';
import { expect } from 'vitest';
import { PersonaManager } from '../src/PersonaManager.js';
import { formatWithContext } from '../src/formatMarkdown.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Header Levels', () => {
  let pm;

  beforeEach(() => {
    const baseDir = path.join(__dirname, '..');
    pm = new PersonaManager(baseDir);
  });

  it('should use ## headers for subsections under # Main', async () => {
    // Single file with ## headers (no # header)
    // Should get combined: # Main: Agent
    // Content headers stay as ##
    const fileDataList = [
      ['001', './manifest/001_main/agent.md', 'agent.md', '## Core Identity\nContent here...\n## Core Values\nMore content...']
    ];

    const formatted = await formatWithContext(fileDataList, pm.multiManifest);

    // Single file produces combined header
    expect(formatted).toContain('# Main: Agent');

    // First ## header is stripped, remaining stay as ##
    expect(formatted).not.toContain('## Core Identity');
    expect(formatted).toContain('## Core Values');
    expect(formatted).not.toContain('### Core Identity');
    expect(formatted).not.toContain('### Core Values');
  });

  it('should use ## headers for subsections under # Tech', async () => {
    // Single file in section produces combined header
    const fileDataList = [
      ['010.15', './manifest/010_tech/15_mcp_author.md', '15_mcp_author.md', 'Content without headers...']
    ];

    const formatted = await formatWithContext(fileDataList, pm.multiManifest);

    expect(formatted).toContain('# Tech: Mcp Author');
    expect(formatted).not.toContain('### Mcp Author');
  });

  it('should use ## headers for subsections under # Output with numbered slots', async () => {
    // After stripping first header, content has no headers (filename becomes header)
    const fileDataList = [
      ['040.01', './manifest/040_output/01_dialect/technical.md', 'technical.md', 'Dialect content...'],
      ['040.02', './manifest/040_output/02_narration/tactile.md', 'tactile.md', 'Narration content...']
    ];

    const formatted = await formatWithContext(fileDataList, pm.multiManifest);

    expect(formatted).toContain('# Output');
    expect(formatted).toContain('## Dialect: Technical');
    expect(formatted).toContain('## Narration: Tactile');
    expect(formatted).not.toContain('### Dialect');
    expect(formatted).not.toContain('### Narration');
  });

  it('should handle depth-1 sections correctly', async () => {
    // Slot 001 is depth 1 (one numbered component), single file
    const fileDataList = [
      ['001', './manifest/001_main/agent.md', 'agent.md', 'Content without headers...']
    ];

    const formatted = await formatWithContext(fileDataList, pm.multiManifest);

    // Should be: # Main: Agent (combined)
    expect(formatted).toContain('# Main: Agent');
    expect(formatted).not.toContain('### Agent');
  });

  it('should handle depth-2 sections correctly', async () => {
    // Slot 040.01 is depth 2 (two numbered components), single file
    const fileDataList = [
      ['040.01', './manifest/040_output/01_dialect/file.md', 'file.md', 'Text content...']
    ];

    const formatted = await formatWithContext(fileDataList, pm.multiManifest);

    // Should be: # Output: Dialect: File (combined)
    expect(formatted).toContain('# Output: Dialect: File');
    expect(formatted).not.toContain('### Dialect');
  });
});
