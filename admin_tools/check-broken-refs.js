import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkBrokenReferences() {
  const results = {
    brokenTemplateRefs: [],
    brokenManifestDeps: [],
    checkedFiles: 0
  };

  // Check all template files in plans directories
  console.log('\n=== Checking Template References ===\n');
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

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('@./manifest/')) {
              const refPath = line.substring(2); // Remove @./
              const fullPath = path.join(__dirname, refPath);

              try {
                await fs.access(fullPath);
              } catch {
                results.brokenTemplateRefs.push({
                  template: templatePath.replace(__dirname, '.'),
                  line: i + 1,
                  reference: line,
                  issue: 'File not found'
                });
              }
            }
          }
          results.checkedFiles++;
        } catch (err) {
          // Template doesn't exist, skip
        }
      }
    }
  } catch (err) {
    console.error('Error reading plans directory:', err);
  }

  // Check all manifest files for dependencies
  console.log('\n=== Checking Manifest Dependencies ===\n');

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

          // Check only lines before first header
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#')) break; // Stop at first header

            if (line.startsWith('@./manifest/')) {
              const refPath = line.substring(2); // Remove @./
              const fullPath = path.join(__dirname, refPath);

              try {
                await fs.access(fullPath);
              } catch {
                results.brokenManifestDeps.push({
                  file: entryRelative,
                  line: i + 1,
                  reference: line,
                  issue: 'Dependency file not found'
                });
              }
            }
          }
          results.checkedFiles++;
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

  if (results.brokenTemplateRefs.length > 0) {
    console.log(`\n❌ Found ${results.brokenTemplateRefs.length} broken template references:\n`);
    for (const ref of results.brokenTemplateRefs) {
      console.log(`  Template: ${ref.template}`);
      console.log(`  Line ${ref.line}: ${ref.reference}`);
      console.log(`  Issue: ${ref.issue}\n`);
    }
  } else {
    console.log('\n✅ No broken template references found!');
  }

  if (results.brokenManifestDeps.length > 0) {
    console.log(`\n❌ Found ${results.brokenManifestDeps.length} broken manifest dependencies:\n`);
    for (const dep of results.brokenManifestDeps) {
      console.log(`  File: ${dep.file}`);
      console.log(`  Line ${dep.line}: ${dep.reference}`);
      console.log(`  Issue: ${dep.issue}\n`);
    }
  } else {
    console.log('\n✅ No broken manifest dependencies found!');
  }

  // Special check for service references that might need updating
  console.log('\n=== Checking for old service paths ===\n');

  const oldServicePaths = [];

  // Check templates for direct service references
  for (const dir of await fs.readdir(plansDir)) {
    const dirPath = path.join(plansDir, dir);
    const stat = await fs.stat(dirPath);

    if (stat.isDirectory()) {
      const templatePath = path.join(dirPath, 'template.md');

      try {
        const content = await fs.readFile(templatePath, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (line.includes('050_config/4_services/') && line.includes('.md')) {
            // Check if it's pointing to a file that should be in a subdirectory
            const match = line.match(/4_services\/([^\/]+\.md)/);
            if (match) {
              const filename = match[1];
              // These files are now in subdirectories
              if (filename.includes('config') || filename.includes('service') ||
                  filename.includes('module') || filename.includes('api') ||
                  filename.includes('database') || filename.includes('cache')) {
                oldServicePaths.push({
                  template: templatePath.replace(__dirname, '.'),
                  line: i + 1,
                  reference: line,
                  suggestion: 'This file may have moved to a subdirectory'
                });
              }
            }
          }
        }
      } catch {
        // Skip if template doesn't exist
      }
    }
  }

  if (oldServicePaths.length > 0) {
    console.log(`⚠️  Found ${oldServicePaths.length} potentially outdated service paths:\n`);
    for (const path of oldServicePaths) {
      console.log(`  Template: ${path.template}`);
      console.log(`  Line ${path.line}: ${path.reference}`);
      console.log(`  Note: ${path.suggestion}\n`);
    }
  } else {
    console.log('✅ No outdated service paths found!');
  }

  return results;
}

// Run the check
checkBrokenReferences().catch(console.error);