import { describe, it, beforeEach } from 'vitest';
import { expect } from 'vitest';
import { PersonaManager } from '../src/PersonaManager.js';
import { formatWithContext } from '../src/formatMarkdown.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Duplicate Consecutive Headers', () => {
  let pm;

  beforeEach(() => {
    const baseDir = path.join(__dirname, '..');
    pm = new PersonaManager(baseDir);
  });

  it('should not produce duplicate consecutive headers', async () => {
    // Bug: Getting two consecutive headers:
    // ## Design Driven Quality
    // ## Design-Driven Quality

    const fileDataList = [
      ['020.01', './manifest/020_pattern/01_clean_code.md', '01_clean_code.md',
       '# Clean Code\n\nWrite clean code.'],
      ['020.29', './manifest/020_pattern/29_design_driven_quality.md', '29_design_driven_quality.md',
       '## Design-Driven Quality\n\nDon Norman\'s principle: mistakes happen because design is bad.']
    ];

    const formatted = await formatWithContext(fileDataList, pm.multiManifest);

    console.log('FORMATTED:\n', formatted);

    // Should NOT have duplicate consecutive ## headers
    const lines = formatted.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].startsWith('## Design') && lines[i + 1].startsWith('## Design')) {
        throw new Error(`Found duplicate consecutive headers at lines ${i}-${i+1}:\n${lines[i]}\n${lines[i+1]}`);
      }
    }

    // Should only have ONE Design header
    const designHeaders = formatted.match(/^## Design.*$/gm);
    expect(designHeaders).not.toBeNull();
    expect(designHeaders.length).toBe(1);
  });
});
