import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkMissingDirectories() {
  const results = {
    missingDirs: new Set(),
    brokenRefs: [],
    checkedFiles: 0
  };

  console.log('\n=== Checking All Referenced Directories ===\n');

  // Check template files
  const plansDir = path.join(__dirname, 'plans');

  try {
    const planDirs = await fs.readdir(plansDir);

    for (const dir of planDirs) {
      const dirPath = path.join(plansDir, dir);
      const stat = await fs.stat(dirPath);

      if (stat.isDirectory()) {
        const templatePath = path.join(dirPath, 'template.md');

        try {
          const content = await fs.readFile(templatePath, 'utf8');
          const lines = content.split('\n');
          results.checkedFiles++;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('@./manifest/')) {
              const refPath = line.substring(2); // Remove @./

              // Extract all directory parts from the path
              const pathParts = refPath.split('/');

              // Check each directory level
              for (let j = 1; j < pathParts.length; j++) {
                const dirToCheck = pathParts.slice(0, j).join('/');
                const fullDirPath = path.join(__dirname, dirToCheck);

                try {
                  const stat = await fs.stat(fullDirPath);
                  if (!stat.isDirectory()) {
                    results.missingDirs.add(dirToCheck);
                    results.brokenRefs.push({
                      file: templatePath.replace(__dirname, '.'),
                      line: i + 1,
                      reference: line,
                      missingDir: dirToCheck
                    });
                  }
                } catch {
                  results.missingDirs.add(dirToCheck);
                  results.brokenRefs.push({
                    file: templatePath.replace(__dirname, '.'),
                    line: i + 1,
                    reference: line,
                    missingDir: dirToCheck
                  });
                }
              }
            }
          }
        } catch {
          // Template doesn't exist
        }
      }
    }
  } catch (err) {
    console.error('Error reading plans directory:', err);
  }

  // Also check manifest files for dependencies
  async function checkManifestDir(dirPath, relativePath = '') {
    try {
      const entries = await fs.readdir(dirPath);

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const entryRelative = path.join(relativePath, entry);
        const stat = await fs.stat(entryPath);

        if (stat.isDirectory()) {
          await checkManifestDir(entryPath, entryRelative);
        } else if (entry.endsWith('.md')) {
          const content = await fs.readFile(entryPath, 'utf8');
          const lines = content.split('\n');
          results.checkedFiles++;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#')) break; // Stop at first header

            if (line.startsWith('@./manifest/')) {
              const refPath = line.substring(2); // Remove @./

              // Extract all directory parts from the path
              const pathParts = refPath.split('/');

              // Check each directory level
              for (let j = 1; j < pathParts.length; j++) {
                const dirToCheck = pathParts.slice(0, j).join('/');
                const fullDirPath = path.join(__dirname, dirToCheck);

                try {
                  const stat = await fs.stat(fullDirPath);
                  if (!stat.isDirectory()) {
                    results.missingDirs.add(dirToCheck);
                    results.brokenRefs.push({
                      file: entryRelative,
                      line: i + 1,
                      reference: line,
                      missingDir: dirToCheck
                    });
                  }
                } catch {
                  results.missingDirs.add(dirToCheck);
                  results.brokenRefs.push({
                    file: entryRelative,
                    line: i + 1,
                    reference: line,
                    missingDir: dirToCheck
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dirPath}:`, err);
    }
  }

  const manifestDir = path.join(__dirname, 'manifest');
  await checkManifestDir(manifestDir, 'manifest');

  // Print results
  console.log('\n=== RESULTS ===\n');
  console.log(`Files checked: ${results.checkedFiles}`);
  console.log(`Unique missing directories: ${results.missingDirs.size}`);

  if (results.missingDirs.size > 0) {
    console.log('\n❌ Missing Directories:\n');
    const sortedDirs = Array.from(results.missingDirs).sort();
    for (const dir of sortedDirs) {
      console.log(`  - ${dir}`);
    }

    // Group broken refs by missing directory
    console.log('\n📁 Files referencing missing directories:\n');
    const byDir = {};
    for (const ref of results.brokenRefs) {
      if (!byDir[ref.missingDir]) {
        byDir[ref.missingDir] = [];
      }
      byDir[ref.missingDir].push(ref);
    }

    for (const [dir, refs] of Object.entries(byDir)) {
      console.log(`\n  Missing: ${dir}/`);

      // Get unique files referencing this directory
      const uniqueFiles = new Set(refs.map(r => r.file));
      for (const file of uniqueFiles) {
        console.log(`    Referenced in: ${file}`);
      }
    }
  } else {
    console.log('\n✅ All referenced directories exist!');
  }

  return results;
}

// Run the check
checkMissingDirectories().catch(console.error);