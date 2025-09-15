import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkPlanDirectories() {
  const results = {
    planDirs: [],
    missingTemplates: [],
    missingPersonas: [],
    emptyDirs: [],
    totalDirs: 0
  };

  console.log('\n=== Checking Plan Directories ===\n');
  const plansDir = path.join(__dirname, 'plans');

  try {
    const entries = await fs.readdir(plansDir);

    for (const entry of entries) {
      const entryPath = path.join(plansDir, entry);
      const stat = await fs.stat(entryPath);

      if (stat.isDirectory()) {
        results.totalDirs++;
        results.planDirs.push(entry);

        const dirContents = {
          name: entry,
          hasTemplate: false,
          hasPersona: false,
          hasVars: false,
          files: []
        };

        // Check what files exist in this directory
        try {
          const files = await fs.readdir(entryPath);
          dirContents.files = files;

          for (const file of files) {
            if (file === 'template.md') dirContents.hasTemplate = true;
            if (file === 'persona.md') dirContents.hasPersona = true;
            if (file === 'vars.txt') dirContents.hasVars = true;
          }

          // Check for issues
          if (!dirContents.hasTemplate) {
            results.missingTemplates.push(entry);
          }
          if (!dirContents.hasPersona) {
            results.missingPersonas.push(entry);
          }
          if (files.length === 0) {
            results.emptyDirs.push(entry);
          }
        } catch (err) {
          console.error(`Error reading directory ${entry}:`, err);
        }
      }
    }

    // Special check for default_vars.txt
    let hasDefaultVars = false;
    try {
      await fs.access(path.join(plansDir, 'default_vars.txt'));
      hasDefaultVars = true;
    } catch {
      hasDefaultVars = false;
    }

    // Print results
    console.log('=== RESULTS ===\n');
    console.log(`Total plan directories: ${results.totalDirs}`);
    console.log(`Has default_vars.txt: ${hasDefaultVars ? '✅' : '❌'}\n`);

    // List all plan directories
    console.log('📁 All Plan Directories:\n');
    for (const dir of results.planDirs.sort()) {
      console.log(`  - ${dir}`);
    }

    if (results.emptyDirs.length > 0) {
      console.log('\n❌ Empty Directories:\n');
      for (const dir of results.emptyDirs) {
        console.log(`  - ${dir}/`);
      }
    }

    if (results.missingTemplates.length > 0) {
      console.log('\n⚠️  Directories Missing template.md:\n');
      for (const dir of results.missingTemplates) {
        console.log(`  - ${dir}/`);
      }
    }

    if (results.missingPersonas.length > 0) {
      console.log('\n⚠️  Directories Missing persona.md:\n');
      for (const dir of results.missingPersonas) {
        console.log(`  - ${dir}/`);
      }
    }

    // Check for orphaned directories (ones that might be typos or old versions)
    console.log('\n=== Checking for Potential Issues ===\n');

    // Look for similar directory names that might be duplicates
    const dirNames = results.planDirs;
    const possibleDuplicates = [];

    for (let i = 0; i < dirNames.length; i++) {
      for (let j = i + 1; j < dirNames.length; j++) {
        const dir1 = dirNames[i].toLowerCase();
        const dir2 = dirNames[j].toLowerCase();

        // Check if one is very similar to the other
        if (dir1.includes(dir2.replace(/-/g, '')) || dir2.includes(dir1.replace(/-/g, ''))) {
          possibleDuplicates.push({
            dir1: dirNames[i],
            dir2: dirNames[j]
          });
        }
      }
    }

    if (possibleDuplicates.length > 0) {
      console.log('🤔 Possible duplicate or related directories:\n');
      for (const dup of possibleDuplicates) {
        console.log(`  - ${dup.dir1}`);
        console.log(`    vs ${dup.dir2}\n`);
      }
    }

    // Check if any directories are referenced in server.js or other code
    console.log('\n=== Checking Directory Usage ===\n');

    // Read server.js to see if it references any plan directories
    try {
      const serverContent = await fs.readFile(path.join(__dirname, 'server.js'), 'utf8');
      const srcFiles = await fs.readdir(path.join(__dirname, 'src'));

      let allCode = serverContent;
      for (const file of srcFiles) {
        if (file.endsWith('.js')) {
          const content = await fs.readFile(path.join(__dirname, 'src', file), 'utf8');
          allCode += '\n' + content;
        }
      }

      const unreferencedDirs = [];
      for (const dir of results.planDirs) {
        // Check if this directory name appears in the code
        if (!allCode.includes(dir)) {
          unreferencedDirs.push(dir);
        }
      }

      if (unreferencedDirs.length > 0) {
        console.log('⚠️  Plan directories not referenced in code:\n');
        for (const dir of unreferencedDirs) {
          console.log(`  - ${dir}/`);
        }
      } else {
        console.log('✅ All plan directories are referenced in code');
      }
    } catch (err) {
      console.error('Could not check code references:', err);
    }

  } catch (err) {
    console.error('Error reading plans directory:', err);
  }

  return results;
}

// Run the check
checkPlanDirectories().catch(console.error);