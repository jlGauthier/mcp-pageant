import { PersonaManager } from './src/PersonaManager.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('Testing MultiManifest Integration...\n');

  // Set up environment to use multiple manifest dirs
  process.env.MANIFEST_DIRS = './manifest,../mcp_persona/manifest';

  const manager = new PersonaManager('.');

  // Wait for variables to load
  await manager.variablesLoaded;

  console.log('Manifest directories:', manager.multiManifest.getManifestDirs());

  // Test 1: Find a file using MultiManifest helper
  console.log('\nTest 1: Finding cozy_morning in look/4_attire');
  const file = await manager.findFileWithMultiManifest('look', '4_attire', 'cozy_morning');
  console.log('Found:', file);

  // Test 2: Find all files in a section
  console.log('\nTest 2: Finding all files in look/4_attire');
  const files = await manager.findFilesWithMultiManifest('look', '4_attire');
  console.log('Files found:', files.length);
  files.forEach(f => console.log('  -', f));

  // Test 3: Read file content
  console.log('\nTest 3: Reading file content');
  const content = await manager.readFileWithMultiManifest('look', '4_attire', 'cozy_morning');
  if (content) {
    console.log('Content preview:', content.substring(0, 100) + '...');
  } else {
    console.log('No content found');
  }

  // Test 4: Test fuzzy matching on sections
  console.log('\nTest 4: Fuzzy matching');
  const sections = await manager.multiManifest.listSections();
  console.log('Available sections:', sections.map(s => s.name).join(', '));

  // Test 5: Check if extensions override main
  console.log('\nTest 5: Extension override test');
  const allFiles = await manager.multiManifest.findFiles('look', '4_attire');
  console.log('All attire files with manifest info:');
  allFiles.forEach(f => {
    console.log(`  - ${f.filename} from ${f.manifestDir}`);
  });

  console.log('\n✅ Integration tests complete!');
}

test().catch(console.error);