import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to convert plan directory name back to actual path
function planDirToPath(planDir) {
  // Replace -- with path separator
  let reconstructed = planDir.replace(/--/g, path.sep);

  // On Windows, the first part is the drive letter
  if (process.platform === 'win32') {
    // C--Users--name becomes C:/Users/name
    reconstructed = reconstructed.replace(/^([A-Z])/, '$1:');
  } else {
    // On Unix, add leading slash
    reconstructed = '/' + reconstructed;
  }

  return reconstructed;
}

async function checkOrphanPlans() {
  const results = {
    orphanPlans: [],
    validPlans: [],
    totalPlans: 0,
    checkedPlans: 0
  };

  console.log('\n=== Checking for Orphan Plan Directories ===\n');
  console.log('(Plan directories that reference non-existent project paths)\n');

  const plansDir = path.join(__dirname, 'plans');

  try {
    const entries = await fs.readdir(plansDir);

    for (const entry of entries) {
      const entryPath = path.join(plansDir, entry);
      const stat = await fs.stat(entryPath);

      if (stat.isDirectory()) {
        results.totalPlans++;

        // Skip the current MCP directory itself
        if (entry === 'D--claudeTools--mcp_pageant') {
          results.validPlans.push({
            planDir: entry,
            actualPath: 'D:/claudeTools/mcp_pageant',
            status: 'CURRENT PROJECT'
          });
          continue;
        }

        // Convert plan directory name to actual path
        const actualPath = planDirToPath(entry);
        results.checkedPlans++;

        console.log(`Checking: ${entry}`);
        console.log(`  → Maps to: ${actualPath}`);

        try {
          // Check if the actual path exists
          await fs.access(actualPath);
          const pathStat = await fs.stat(actualPath);

          if (pathStat.isDirectory()) {
            console.log(`  ✅ EXISTS\n`);
            results.validPlans.push({
              planDir: entry,
              actualPath: actualPath,
              status: 'EXISTS'
            });
          } else {
            console.log(`  ❌ EXISTS but is NOT a directory\n`);
            results.orphanPlans.push({
              planDir: entry,
              actualPath: actualPath,
              issue: 'Path exists but is not a directory'
            });
          }
        } catch (err) {
          console.log(`  ❌ DOES NOT EXIST\n`);
          results.orphanPlans.push({
            planDir: entry,
            actualPath: actualPath,
            issue: 'Path does not exist'
          });
        }
      }
    }

    // Also check for special files
    if (entries.includes('default_vars.txt')) {
      console.log('✅ Found default_vars.txt\n');
    }

  } catch (err) {
    console.error('Error reading plans directory:', err);
  }

  // Print summary
  console.log('\n=== SUMMARY ===\n');
  console.log(`Total plan directories: ${results.totalPlans}`);
  console.log(`Checked: ${results.checkedPlans}`);
  console.log(`Valid (path exists): ${results.validPlans.length}`);
  console.log(`Orphaned (path missing): ${results.orphanPlans.length}`);

  if (results.orphanPlans.length > 0) {
    console.log('\n❌ ORPHAN PLAN DIRECTORIES:\n');
    console.log('These plan directories reference projects that no longer exist:\n');

    for (const orphan of results.orphanPlans) {
      console.log(`  Plan Directory: ${orphan.planDir}/`);
      console.log(`  Expected Path:  ${orphan.actualPath}`);
      console.log(`  Issue:          ${orphan.issue}`);

      // Check what files exist in the orphan plan directory
      const planPath = path.join(plansDir, orphan.planDir);
      try {
        const files = await fs.readdir(planPath);
        if (files.length > 0) {
          console.log(`  Contains:       ${files.join(', ')}`);
        }
      } catch {
        console.log(`  Contains:       <unable to read>`);
      }
      console.log();
    }

    console.log('💡 Suggestion: These orphan directories can be safely deleted');
    console.log('   unless you plan to recreate the projects at those paths.\n');
  }

  if (results.validPlans.length > 0) {
    console.log('\n✅ VALID PLAN DIRECTORIES:\n');
    for (const valid of results.validPlans) {
      console.log(`  ${valid.planDir}/`);
      console.log(`    → ${valid.actualPath} (${valid.status})`);
    }
  }

  return results;
}

// Run the check
checkOrphanPlans().catch(console.error);