import { PersonaManager } from './src/PersonaManager.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('Testing add command for hair...\n');

  const manager = new PersonaManager('.');
  await manager.variablesLoaded;

  console.log('Manifest dirs:', manager.multiManifest.getManifestDirs());

  // Test finding the file
  const section = '070_look';
  const subsection = '3_hair';
  const partial = 'cute_pigtails';

  console.log('\n1. Finding file with MultiManifest...');
  const fileInfo = await manager.multiManifest.findFile(section, subsection, partial);
  console.log('File info:', fileInfo);

  if (fileInfo) {
    console.log('  path:', fileInfo.path);
    console.log('  manifestDir:', fileInfo.manifestDir);
    console.log('  filename:', fileInfo.filename);
  }

  console.log('\n2. Now trying handleAdd...');
  try {
    const result = await manager.handleAdd({
      section: 'look',  // Using fuzzy match
      subsection: '3_hair',
      partial: 'cute_pigtails'
    });
    console.log('Success:', result);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

test().catch(console.error);