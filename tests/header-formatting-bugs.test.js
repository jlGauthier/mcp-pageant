import { describe, it, beforeEach } from 'vitest';
import { expect } from 'vitest';
import { MultiManifest } from '../src/MultiManifest.js';
import { formatWithContext } from '../src/formatMarkdown.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Header Formatting Bugs', () => {
  let multiManifest;

  beforeEach(() => {
    const baseDir = path.join(__dirname, '..');
    const manifestDirs = [path.join(baseDir, 'manifest')];
    multiManifest = new MultiManifest(manifestDirs);
  });

  it('should not output "## 020 Pattern List\\n## Long Term Outlook"', async () => {
    // Bug: Getting "## 020 Pattern List\n## Long Term Outlook"
    // Should be: "# Pattern\n\n## Long Term Outlook"

    const fileDataList = [
      ['020.02', './manifest/020_pattern/02_long_term_outlook.md', '02_long_term_outlook.md',
       '## Long Term Outlook\n\nMeasure success through long-term outcomes.']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    console.log('Pattern List formatted:\n', formatted);

    // Should have clean Pattern section header
    expect(formatted).toContain('# Pattern:');
    expect(formatted).not.toContain('## 020 Pattern List');
    expect(formatted).not.toContain('Pattern List');

    // Should have Long Term Outlook header
    expect(formatted).toContain('Long Term Outlook');
  });

  it('should not output "## Config: Config" duplicate', async () => {
    // Bug: Getting "## Config: Config"
    // Single file should be: "# Setup: Config: Basic" (combined)

    const fileDataList = [
      ['070.4', './manifest/070_setup/4_config/basic.md', 'basic.md',
       '## Config\n\nBasic configuration.']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    console.log('Config formatted:\n', formatted);

    // Should have combined header
    expect(formatted).toContain('# Setup: Config: Basic');

    // Should NOT have duplicate "Config: Config"
    expect(formatted).not.toMatch(/Config:\s*Config/);

    // Should NOT have ## Config after the combined header
    expect(formatted).not.toMatch(/# Setup.*\n\s*## Config/);
  });

  it('should not output "## James" after "# User: James"', async () => {
    // Bug: Getting "# User: James\n## James"
    // Should be: "# User: James" (no ## James)

    const fileDataList = [
      ['080', './manifest/080_user/james.md', 'james.md',
       '## James\n\nYour user profile.']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    console.log('User formatted:\n', formatted);

    // Should have combined header
    expect(formatted).toContain('# User: James');

    // Should NOT have duplicate ## James
    expect(formatted).not.toMatch(/# User: James\s*\n\s*## James/);
  });

  it('should not output "## Identity Commitment" after "# End: Identity Commitment"', async () => {
    // Bug: Getting "# End: Identity Commitment\n## Identity Commitment"
    // Should be: "# End: Identity Commitment" (no ## duplicate)

    const fileDataList = [
      ['999', './manifest/999_end/identity_commitment.md', 'identity_commitment.md',
       '## Identity Commitment\n\nYou choose this identity completely.']
    ];

    const formatted = await formatWithContext(fileDataList, multiManifest);

    console.log('End formatted:\n', formatted);

    // Should have combined header
    expect(formatted).toContain('# End: Identity Commitment');

    // Should NOT have duplicate ## Identity Commitment
    expect(formatted).not.toMatch(/# End: Identity Commitment\s*\n\s*## Identity Commitment/);
  });
});
