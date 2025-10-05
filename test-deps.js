import 'dotenv/config';
import { PersonaManager } from './src/PersonaManager.js';
import path from 'path';

async function testDependencyExtraction() {
  const manager = new PersonaManager('.');

  console.log('Manager manifest dirs:', manager.manifestDirs);

  // The file with dependencies
  const testFile = 'D:/claudeTools/mcp_persona/manifest/050_story/turned_hot/learning_from_the_hub.md';

  // Simulate the dependency extraction
  const allDependencies = new Set();
  const processedFiles = new Set();

  async function extractDepsRecursive(filePath) {
    if (processedFiles.has(filePath)) return;
    processedFiles.add(filePath);

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      const fileDir = path.dirname(filePath);

      for (const line of lines) {
        if (line.trim().startsWith('@')) {
          const depPath = line.trim().substring(1);
          console.log(`\nFound dependency: ${depPath}`);
          console.log(`In file: ${filePath}`);
          console.log(`File dir: ${fileDir}`);

          let fullDepPath;

          // Check if the dependency starts with ./manifest/
          if (depPath.startsWith('./manifest/')) {
            console.log('This is a manifest-relative dependency');
            const manifestRelativePath = depPath.replace('./manifest/', '');
            console.log(`Manifest relative: ${manifestRelativePath}`);

            // Try to find in manifest directories
            for (const manifestDir of manager.manifestDirs) {
              const candidatePath = path.join(manifestDir, manifestRelativePath);
              console.log(`Checking: ${candidatePath}`);
              try {
                await fs.access(candidatePath);
                fullDepPath = candidatePath;
                console.log(`Found at: ${fullDepPath}`);
                break;
              } catch (e) {
                console.log(`Not found: ${e.message}`);
              }
            }

            if (!fullDepPath) {
              console.log(`WARNING: Could not find dependency in any manifest directory`);
            }
          } else {
            fullDepPath = path.resolve(fileDir, depPath);
            console.log(`Resolved to: ${fullDepPath}`);
          }

          if (fullDepPath) {
            const relativeDepPath = path.relative(manager.baseDir, fullDepPath).replace(/\\/g, '/');
            console.log(`Relative to base: ${relativeDepPath}`);
            console.log(`Will write to template: @./${relativeDepPath}`);
            allDependencies.add(`./${relativeDepPath}`);
          }
        } else if (line.trim().startsWith('#')) {
          break;
        }
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  }

  await extractDepsRecursive(testFile);

  console.log('\n\nFinal dependencies to write:');
  for (const dep of allDependencies) {
    console.log(`  @${dep}`);
  }
}

testDependencyExtraction().catch(console.error);