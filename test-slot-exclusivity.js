import { PersonaManager } from './src/PersonaManager.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

async function test() {
  console.log('Testing SLOT exclusivity in compilation...\n');

  const manager = new PersonaManager('.');

  // Create a test template with conflicting SLOT references
  const testTemplate = `# Test Template

@./manifest/001_main/wolf.md
@./manifest/001_main/professional.md
@./../mcp_persona/manifest/001_main/agent.md

@./manifest/020_pattern_list/clean_code.md
@./../mcp_persona/manifest/020_pattern_list/security.md
`;

  // Write test template
  const templatePath = manager.getTemplatePath();
  const templateDir = path.dirname(templatePath);
  await fs.mkdir(templateDir, { recursive: true });
  await fs.writeFile(templatePath, testTemplate, 'utf8');

  console.log('Template created with 3 files competing for 001_main SLOT:');
  console.log('  - wolf.md');
  console.log('  - professional.md');
  console.log('  - agent.md');
  console.log('\nAnd 2 files for 020_pattern_list (should both be included):\n');

  // Run compilation
  await manager.compilePersona('.');

  // Read the compiled output
  const compiled = await fs.readFile('CLAUDE.local.md', 'utf8');

  // Count how many main sections exist
  const mainSections = compiled.match(/## \w+\s+\w+/g) || [];
  console.log(`\nFound ${mainSections.length} main identity sections`);
  console.log('Main sections found:', mainSections);

  if (mainSections.length === 1) {
    console.log('\n✅ SUCCESS: SLOT exclusivity is working!');
  } else {
    console.log('\n❌ FAILURE: Multiple files in same SLOT!');
  }
}

test().catch(console.error);