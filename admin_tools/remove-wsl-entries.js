import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function removeWSLEntries() {
  const claudeJsonPath = 'C:\\Users\\jgaut\\.claude.json';

  console.log('\n=== Removing WSL Entries from .claude.json ===\n');
  console.log(`Reading from: ${claudeJsonPath}`);

  try {
    // Read the current file
    const content = await fs.readFile(claudeJsonPath, 'utf8');
    const data = JSON.parse(content);

    // Get stats before cleaning
    const stats = {
      originalSize: Buffer.byteLength(content, 'utf8'),
      projectsBefore: 0,
      projectsRemoved: 0,
      wslPaths: []
    };

    // Check if projects exists
    if (data.projects) {
      stats.projectsBefore = Object.keys(data.projects).length;
      console.log(`\n📊 Current Status:`);
      console.log(`  - Total projects: ${stats.projectsBefore}`);
      console.log(`  - File size: ${(stats.originalSize / 1024).toFixed(2)} KB`);

      // Filter out WSL entries
      const cleanedProjects = {};
      console.log('\n🔍 Scanning for WSL paths...\n');

      for (const [projectPath, projectData] of Object.entries(data.projects)) {
        // Check if it's a WSL/Unix path (uses forward slashes)
        // Windows paths use backslashes: C:\... or D:\...
        // WSL/Unix paths use forward slashes: /mnt/c/... or //c/...
        if (projectPath.includes('/')) {
          console.log(`  ❌ Removing WSL/Unix path: ${projectPath}`);
          stats.wslPaths.push(projectPath);
          stats.projectsRemoved++;
        } else {
          // Keep only Windows-style paths with backslashes
          cleanedProjects[projectPath] = projectData;
        }
      }

      if (stats.projectsRemoved === 0) {
        console.log('  ✅ No WSL entries found!');
        return;
      }

      // Update the data
      data.projects = cleanedProjects;

      // Convert back to JSON with nice formatting
      const cleanedContent = JSON.stringify(data, null, 2);
      const newSize = Buffer.byteLength(cleanedContent, 'utf8');

      console.log('\n✨ Results:');
      console.log(`  - WSL entries removed: ${stats.projectsRemoved}`);
      console.log(`  - Remaining projects: ${Object.keys(cleanedProjects).length}`);
      console.log(`  - Original size: ${(stats.originalSize / 1024).toFixed(2)} KB`);
      console.log(`  - New size: ${(newSize / 1024).toFixed(2)} KB`);
      console.log(`  - Size reduction: ${((stats.originalSize - newSize) / 1024).toFixed(2)} KB (${((1 - newSize/stats.originalSize) * 100).toFixed(1)}%)`);

      // Create a backup first
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = claudeJsonPath + `.backup-wsl-${timestamp}`;
      await fs.writeFile(backupPath, content);
      console.log(`\n💾 Backup saved to: ${backupPath}`);

      // Write the cleaned version
      await fs.writeFile(claudeJsonPath, cleanedContent);
      console.log(`✅ Successfully cleaned ${claudeJsonPath}`);

      // Show remaining project paths
      console.log('\n📋 Remaining Windows projects:');
      const windowsPaths = Object.keys(cleanedProjects).slice(0, 10);
      for (const path of windowsPaths) {
        console.log(`  - ${path}`);
      }
      if (Object.keys(cleanedProjects).length > 10) {
        console.log(`  ... and ${Object.keys(cleanedProjects).length - 10} more`);
      }

    } else {
      console.log('❌ No projects section found in .claude.json');
    }

  } catch (error) {
    console.error('❌ Error processing .claude.json:', error);

    if (error.code === 'ENOENT') {
      console.error('   File not found at:', claudeJsonPath);
    } else if (error instanceof SyntaxError) {
      console.error('   Invalid JSON in file');
    }
  }
}

// Run the cleaner
console.log('🧹 WSL Entry Remover for .claude.json');
console.log('=====================================');
removeWSLEntries().catch(console.error);