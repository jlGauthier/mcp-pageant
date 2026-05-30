import 'dotenv/config';
import { PersonaManager } from './src/PersonaManager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugMerge() {
  const manager = new PersonaManager(__dirname);

  console.log('Environment variables:');
  console.log('  MANIFEST_DIRS:', process.env.MANIFEST_DIRS);

  console.log('\nResolved manifest directories:');
  manager.manifestDirs.forEach((dir, i) => {
    console.log(`  [${i}] ${dir}`);
  });

  // Check if directories exist
  const fs = await import('fs/promises');

  console.log('\nChecking directory existence:');
  for (const dir of manager.manifestDirs) {
    try {
      await fs.access(dir);
      const contents = await fs.readdir(dir);
      console.log(`  ✓ ${dir} (${contents.length} items)`);

      // List directories that look like sections
      const sections = contents.filter(item =>
        item.match(/^\d+_/) || item.endsWith('_list')
      );
      console.log(`    Sections: ${sections.join(', ')}`);
    } catch (e) {
      console.log(`  ✗ ${dir} - ${e.message}`);
    }
  }
}

debugMerge().catch(console.error);