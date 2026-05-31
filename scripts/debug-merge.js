import 'dotenv/config';
import { PersonaManager } from '../src/PersonaManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debugMerge() {
  const manager = new PersonaManager(path.resolve(__dirname, '..'));

  console.log('Manifest directories:');
  for (const dir of manager.manifestDirs) {
    try {
      const entries = await fs.readdir(dir);
      const sections = entries.filter(e => /^\d+_/.test(e));
      console.log(`  ✓ ${dir} (${entries.length} entries, ${sections.length} sections)`);
      if (sections.length) console.log(`    sections: ${sections.join(', ')}`);
    } catch (e) {
      console.log(`  ✗ ${dir} — ${e.message}`);
    }
  }
}

debugMerge().catch(console.error);
