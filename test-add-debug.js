import { PersonaManager } from './src/PersonaManager.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('Testing add command logic...\n');

  const manager = new PersonaManager('.');
  await manager.variablesLoaded;

  console.log('Manifest dirs:', manager.multiManifest.getManifestDirs());

  // Simulate what handleAdd does
  const section = 'look';
  const subsection = '5_style';
  const partial = 'cat_ears';

  console.log('\n1. Getting sections...');
  const sections = await manager.multiManifest.listSections();
  const sectionNames = sections.map(s => s.name);
  console.log('Available sections:', sectionNames);

  console.log('\n2. Matching section...');
  let matchedSection = sectionNames.find(s => s === section);
  if (!matchedSection) {
    matchedSection = manager.fuzzyMatch(sectionNames, section);
  }
  console.log('Matched section:', matchedSection);

  console.log('\n3. Matching subsection...');
  const subsections = await manager.multiManifest.listSubsections(matchedSection);
  const subsectionNames = subsections.map(s => s.name);
  console.log('Available subsections:', subsectionNames);

  let matchedSubsection = manager.fuzzyMatch(subsectionNames, subsection);
  console.log('Matched subsection:', matchedSubsection);

  console.log('\n4. Finding file...');
  const fileInfo = await manager.multiManifest.findFile(matchedSection, matchedSubsection, partial);
  console.log('File info:', fileInfo);

  if (!fileInfo) {
    console.log('ERROR: File not found!');
  } else {
    console.log('\n5. Building reference path...');
    const path = await import('path');
    const relativePath = path.default.relative(manager.baseDir, fileInfo.path).replace(/\\/g, '/');
    console.log('Relative path:', relativePath);
    console.log('Reference:', `@./${relativePath}`);
  }
}

test().catch(console.error);