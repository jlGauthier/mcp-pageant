import { PersonaCore } from '../src/persona-core.js';
import fs from 'fs/promises';

async function testExtractDependencies() {
  const persona = new PersonaCore();

  const filePath = 'D:/claudeTools/pageant_extension/manifest/050_story/turned_hot/learning_from_the_hub.md';

  console.log('Testing extractDependencies on actual file...\n');
  console.log(`File: ${filePath}\n`);

  // Read first few lines of the file
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n').slice(0, 10);
  console.log('First 10 lines of file:');
  lines.forEach((line, i) => console.log(`  ${i+1}: ${line}`));

  console.log('\nExtracting dependencies...\n');

  const deps = await persona.extractDependencies(filePath);

  console.log(`Found ${deps.length} dependencies:`);
  deps.forEach(dep => console.log(`  - ${dep}`));
}

testExtractDependencies().catch(console.error);