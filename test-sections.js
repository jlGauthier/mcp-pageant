import { PersonaManager } from './src/PersonaManager.js';

async function test() {
  console.log('Testing sections listing...');

  const manager = new PersonaManager('.');
  await manager.variablesLoaded;

  console.log('Manifest dirs:', manager.multiManifest.getManifestDirs());

  const sections = await manager.multiManifest.listSections();
  console.log('\nFound sections:', sections.map(s => s.name));

  // Test look section specifically
  const lookFiles = await manager.multiManifest.findFiles('look');
  console.log('\nFiles in look section:', lookFiles.length);
  lookFiles.forEach(f => console.log('  -', f.path));

  // Test 4_attire subsection
  const attireFiles = await manager.multiManifest.findFiles('look', '4_attire');
  console.log('\nFiles in look/4_attire:', attireFiles.length);
  attireFiles.forEach(f => console.log('  -', f.path));
}

test().catch(console.error);