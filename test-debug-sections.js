import { PersonaManager } from './src/PersonaManager.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('MANIFEST_DIRS:', process.env.MANIFEST_DIRS);

  const manager = new PersonaManager('.');
  await manager.variablesLoaded;

  const sections = await manager.multiManifest.listSections();
  console.log('\nAll sections:');
  sections.forEach(s => {
    console.log(`  ${s.name} in dirs:`, s.manifestDirs);
  });

  // Try to find files in "look" section
  console.log('\nSearching for "look" section files:');
  const lookFiles = await manager.multiManifest.findFiles('look');
  console.log('Found files:', lookFiles.length);
  lookFiles.forEach(f => console.log('  -', f.path));

  // Try subsection
  console.log('\nSearching for "look/4_attire" files:');
  const attireFiles = await manager.multiManifest.findFiles('look', '4_attire');
  console.log('Found files:', attireFiles.length);
  attireFiles.forEach(f => console.log('  -', f.path));
}

test().catch(console.error);