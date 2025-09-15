import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Map of moved files to their new locations - generic examples
const fileMovements = {
  // Configuration files
  'database_config.md': 'config/database_config.md',
  'api_config.md': 'config/api_config.md',
  'auth_config.md': 'config/auth_config.md',
  'cache_config.md': 'config/cache_config.md',

  // Service definitions
  'payment_service.md': 'services/payment_service.md',
  'email_service.md': 'services/email_service.md',
  'logging_service.md': 'services/logging_service.md',
  'monitoring_service.md': 'services/monitoring_service.md',

  // Module configurations
  'module_alpha.md': 'modules/module_alpha.md',
  'module_beta.md': 'modules/module_beta.md',
  'module_gamma.md': 'modules/module_gamma.md',

  // Environment settings
  'dev_settings.md': 'environments/dev_settings.md',
  'staging_settings.md': 'environments/staging_settings.md',
  'prod_settings.md': 'environments/prod_settings.md'
};

async function fixBrokenReferences() {
  let totalFixed = 0;
  let filesModified = 0;

  const plansDir = path.join(__dirname, '..', 'plans');

  // Scan all plan directories
  for (const dir of await fs.readdir(plansDir)) {
    const dirPath = path.join(plansDir, dir);
    const stat = await fs.stat(dirPath);

    if (stat.isDirectory()) {
      // Look for template.md files
      const templatePath = path.join(dirPath, 'template.md');

      try {
        await fs.access(templatePath);
        console.log(`\nChecking ${templatePath}...`);

        let content = await fs.readFile(templatePath, 'utf8');
        const lines = content.split('\n');
        let modified = false;

        const updatedLines = lines.map(line => {
          // Check for references that need updating
          if (line.trim().startsWith('@./manifest/050_config/4_services/')) {
            const match = line.match(/4_services\/([^\/]+\.md)/);
            if (match) {
              const filename = match[1];
              if (fileMovements[filename]) {
                const oldPath = `4_services/${filename}`;
                const newPath = `4_services/${fileMovements[filename]}`;
                line = line.replace(oldPath, newPath);
                totalFixed++;
                modified = true;
                console.log(`  Fixed: ${filename} -> ${fileMovements[filename]}`);
              }
            }
          }
          return line;
        });

        if (modified) {
          await fs.writeFile(templatePath, updatedLines.join('\n'), 'utf8');
          filesModified++;
          console.log(`  ✅ File updated`);
        } else {
          console.log(`  ✅ No changes needed`);
        }

      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error processing ${templatePath}:`, error);
        }
      }

      // Also check persona.md files
      const personaPath = path.join(dirPath, 'persona.md');

      try {
        await fs.access(personaPath);
        console.log(`\nChecking ${personaPath}...`);

        let content = await fs.readFile(personaPath, 'utf8');
        const lines = content.split('\n');
        let modified = false;
        let headerFound = false;

        const updatedLines = lines.map(line => {
          // Skip the header section
          if (line.startsWith('# ')) {
            headerFound = true;
          }

          // Only process references after the header
          if (!headerFound && line.trim().startsWith('@./manifest/050_config/4_services/')) {
            const match = line.match(/4_services\/([^\/]+\.md)/);
            if (match) {
              const filename = match[1];
              if (fileMovements[filename]) {
                const oldPath = `4_services/${filename}`;
                const newPath = `4_services/${fileMovements[filename]}`;
                line = line.replace(oldPath, newPath);
                totalFixed++;
                modified = true;
                console.log(`  Fixed: ${filename} -> ${fileMovements[filename]}`);
              }
            }
          }
          return line;
        });

        if (modified) {
          await fs.writeFile(personaPath, updatedLines.join('\n'), 'utf8');
          filesModified++;
          console.log(`  ✅ File updated`);
        } else {
          console.log(`  ✅ No changes needed`);
        }

      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error processing ${personaPath}:`, error);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Fixed ${totalFixed} broken references across ${filesModified} files`);
}

// Run the fix
fixBrokenReferences().catch(console.error);