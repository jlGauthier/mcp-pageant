import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { PersonaManager } from './src/PersonaManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testImportIntegration() {
  console.log('🧪  Testing actual import process with PersonaManager...\n');

  // Create test directories
  const testDir = path.join(__dirname, 'test-import-temp');
  const manifestDir = path.join(testDir, 'manifest');
  const plansDir = path.join(testDir, 'plans');
  const projectDir = path.join(plansDir, 'test-project');

  await fs.mkdir(path.join(manifestDir, '080_play_list'), { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });

  // Create a test file with headers that should be stripped
  const testContent = `# 080_play_list
## handjob_variety

# Handjob Variety Techniques

Try these approaches:

## Speed Variations
- Start slow
- Build up gradually

## Grip Techniques
- Light touches
- Full grip

Remember eye contact.`;

  await fs.writeFile(
    path.join(manifestDir, '080_play_list', 'handjob_variety.md'),
    testContent
  );

  // Create a template that imports this file
  const template = `# Test Template

@./manifest/080_play_list/handjob_variety.md

End of template.`;

  await fs.writeFile(path.join(projectDir, 'template.md'), template);

  // Initialize PersonaManager with test directories
  const manager = new PersonaManager(
    plansDir,
    [manifestDir]
  );
  manager.getProjectDirName = () => 'test-project';

  try {
    // Compile the persona
    await manager.compilePersona(testDir);

    // Read the compiled output
    const compiledPath = path.join(testDir, 'CLAUDE.local.md');
    const compiled = await fs.readFile(compiledPath, 'utf8');

    console.log('===== COMPILED OUTPUT =====');
    console.log(compiled);
    console.log('===========================\n');
    console.log('Output length:', compiled.length);

    // Check for issues
    const tests = {
      'No "Variety Techniques" as section header': !compiled.match(/^# .*Variety/m),
      'No "handjob_variety" header': !compiled.includes('# handjob_variety'),
      'No "Speed Variations" as main header': !compiled.match(/^# Speed Variations/m),
      'Content is preserved': compiled.includes('Start slow'),
      'Play List section added': compiled.includes('# Play List'),
      'No duplicate headers from import': !compiled.includes('# Handjob Variety Techniques'),
    };

    console.log('Test Results:');
    let allPassed = true;
    for (const [test, passed] of Object.entries(tests)) {
      console.log(`  ${passed ? '✅' : '❌'} ${test}`);
      if (!passed) allPassed = false;
    }

    // Clean up
    await fs.rm(testDir, { recursive: true });

    return allPassed;
  } catch (error) {
    console.error('Compilation error:', error);
    // Clean up on error
    await fs.rm(testDir, { recursive: true }).catch(() => {});
    return false;
  }
}

// Run the test
testImportIntegration().then(passed => {
  if (passed) {
    console.log('\n🎉  Import integration test PASSED!');
  } else {
    console.log('\n❌  Import integration test FAILED!');
    process.exit(1);
  }
}).catch(console.error);