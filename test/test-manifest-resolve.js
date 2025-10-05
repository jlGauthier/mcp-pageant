import { MultiManifest } from '../src/MultiManifest.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testResolveManifestPath() {
  console.log('Testing MultiManifest path resolution...\n');

  // Setup with two manifest directories
  const manifestDirs = [
    path.join(__dirname, '..', 'manifest'),
    path.join(__dirname, '..', '..', 'mcp_persona', 'manifest')
  ];

  const mm = new MultiManifest(manifestDirs);

  // Test cases
  const testPaths = [
    // Old style paths (should resolve to whichever manifest has the file)
    './manifest/001_main/muse.md',
    './manifest/020_pattern_list/terminal_calude_code_update_bug.md',

    // New style paths
    './../mcp_persona/manifest/001_main/muse.md',
    './../mcp_persona/manifest/070_look/1_body/freckled_redhead.md',

    // Just manifest-relative paths
    '001_main/good_girl.md',
    '070_look/3_hair/high_ponytail.md',

    // Non-existent files
    './manifest/001_main/doesnt_exist.md',
    '999_fake/not_real.md'
  ];

  for (const testPath of testPaths) {
    console.log(`\nTesting: ${testPath}`);

    try {
      const resolved = await mm.resolveManifestPath(testPath);
      if (resolved) {
        console.log(`  ✓ Resolved to: ${resolved}`);
        console.log(`    Exists: ${await mm.fileExists(resolved)}`);
      } else {
        console.log(`  ✗ Could not resolve (file not found in any manifest)`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
    }
  }
}

testResolveManifestPath().catch(console.error);