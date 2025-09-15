import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkBrokenDirectoryReferences() {
  const results = {
    brokenDirRefs: [],
    checkedTemplates: 0,
    totalReferences: 0
  };

  console.log('\n=== Checking Directory References in Plans ===\n');
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
          results.checkedTemplates++;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check for directory references (ending with /)
            if (line.startsWith('@./manifest/') && line.endsWith('/')) {
              results.totalReferences++;
              const refPath = line.substring(2); // Remove @./
              const fullPath = path.join(__dirname, refPath);

              try {
                const stat = await fs.stat(fullPath);
                if (!stat.isDirectory()) {
                  results.brokenDirRefs.push({
                    template: templatePath.replace(__dirname, '.'),
                    line: i + 1,
                    reference: line,
                    issue: 'Path exists but is not a directory'
                  });
                }
              } catch {
                results.brokenDirRefs.push({
                  template: templatePath.replace(__dirname, '.'),
                  line: i + 1,
                  reference: line,
                  issue: 'Directory not found'
                });
              }
            }

            // Also check for file references to see if their parent directories exist
            if (line.startsWith('@./manifest/') && line.endsWith('.md')) {
              const refPath = line.substring(2); // Remove @./
              const dirPath = path.dirname(path.join(__dirname, refPath));
              const relativeDirPath = path.dirname(refPath);

              try {
                await fs.stat(dirPath);
              } catch {
                results.brokenDirRefs.push({
                  template: templatePath.replace(__dirname, '.'),
                  line: i + 1,
                  reference: line,
                  issue: `Parent directory doesn't exist: ${relativeDirPath}`
                });
              }
            }
          }
        } catch (err) {
          // Template doesn't exist, skip
        }
      }
    }
  } catch (err) {
    console.error('Error reading plans directory:', err);
  }

  // Print results
  console.log('\n=== RESULTS ===\n');
  console.log(`Templates checked: ${results.checkedTemplates}`);
  console.log(`Total directory references found: ${results.totalReferences}`);

  if (results.brokenDirRefs.length > 0) {
    console.log(`\n❌ Found ${results.brokenDirRefs.length} broken directory references:\n`);

    // Group by template for easier reading
    const byTemplate = {};
    for (const ref of results.brokenDirRefs) {
      if (!byTemplate[ref.template]) {
        byTemplate[ref.template] = [];
      }
      byTemplate[ref.template].push(ref);
    }

    for (const [template, refs] of Object.entries(byTemplate)) {
      console.log(`\n  Template: ${template}`);
      for (const ref of refs) {
        console.log(`    Line ${ref.line}: ${ref.reference}`);
        console.log(`    Issue: ${ref.issue}`);
      }
    }
  } else {
    console.log('\n✅ No broken directory references found!');
  }

  // Also check for references to old directory structures
  console.log('\n=== Checking for Outdated Directory Patterns ===\n');

  const outdatedPatterns = [];

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

            // Check for common outdated patterns
            if (line.includes('060_play/') && !line.includes('060_play_list/')) {
              outdatedPatterns.push({
                template: templatePath.replace(__dirname, '.'),
                line: i + 1,
                reference: line,
                suggestion: 'Should probably be 060_play_list/'
              });
            }

            if (line.includes('010_tech/') && !line.includes('010_tech_list/')) {
              outdatedPatterns.push({
                template: templatePath.replace(__dirname, '.'),
                line: i + 1,
                reference: line,
                suggestion: 'Should probably be 010_tech_list/'
              });
            }

            if (line.includes('020_pattern/') && !line.includes('020_pattern_list/')) {
              outdatedPatterns.push({
                template: templatePath.replace(__dirname, '.'),
                line: i + 1,
                reference: line,
                suggestion: 'Should probably be 020_pattern_list/'
              });
            }

            if (line.includes('030_ref/') && !line.includes('030_ref_list/')) {
              outdatedPatterns.push({
                template: templatePath.replace(__dirname, '.'),
                line: i + 1,
                reference: line,
                suggestion: 'Should probably be 030_ref_list/'
              });
            }
          }
        } catch {
          // Skip if template doesn't exist
        }
      }
    }
  } catch (err) {
    console.error('Error checking patterns:', err);
  }

  if (outdatedPatterns.length > 0) {
    console.log(`⚠️  Found ${outdatedPatterns.length} potentially outdated directory patterns:\n`);
    for (const pattern of outdatedPatterns) {
      console.log(`  Template: ${pattern.template}`);
      console.log(`  Line ${pattern.line}: ${pattern.reference}`);
      console.log(`  Suggestion: ${pattern.suggestion}\n`);
    }
  } else {
    console.log('✅ No outdated directory patterns found!');
  }

  return results;
}

// Run the check
checkBrokenDirectoryReferences().catch(console.error);