import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function removeDeadProjects() {
  const claudeJsonPath = 'C:\\Users\\jgaut\\.claude.json';

  console.log('\n=== Removing Dead Project Entries from .claude.json ===\n');
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
      deadPaths: []
    };

    // Check if projects exists
    if (data.projects) {
      stats.projectsBefore = Object.keys(data.projects).length;
      console.log(`\n📊 Current Status:`);
      console.log(`  - Total projects: ${stats.projectsBefore}`);
      console.log(`  - File size: ${(stats.originalSize / 1024).toFixed(2)} KB`);

      // Filter out dead entries
      const cleanedProjects = {};
      console.log('\n🔍 Checking project paths...\n');

      for (const [projectPath, projectData] of Object.entries(data.projects)) {
        // Check if the path actually exists on disk
        try {
          await fs.access(projectPath);
          const pathStat = await fs.stat(projectPath);

          if (pathStat.isDirectory()) {
            console.log(`  ✅ EXISTS: ${projectPath}`);
            cleanedProjects[projectPath] = projectData;
          } else {
            console.log(`  ❌ NOT A DIRECTORY: ${projectPath}`);
            stats.deadPaths.push(projectPath);
            stats.projectsRemoved++;
          }
        } catch (err) {
          console.log(`  ❌ DEAD PATH: ${projectPath}`);
          stats.deadPaths.push(projectPath);
          stats.projectsRemoved++;
        }
      }

      if (stats.projectsRemoved === 0) {
        console.log('\n✅ No dead project paths found!');
        return;
      }

      // Update the data
      data.projects = cleanedProjects;

      // Convert back to JSON with nice formatting
      const cleanedContent = JSON.stringify(data, null, 2);
      const newSize = Buffer.byteLength(cleanedContent, 'utf8');

      console.log('\n✨ Results:');
      console.log(`  - Dead entries removed: ${stats.projectsRemoved}`);
      console.log(`  - Remaining projects: ${Object.keys(cleanedProjects).length}`);
      console.log(`  - Original size: ${(stats.originalSize / 1024).toFixed(2)} KB`);
      console.log(`  - New size: ${(newSize / 1024).toFixed(2)} KB`);
      console.log(`  - Size reduction: ${((stats.originalSize - newSize) / 1024).toFixed(2)} KB (${((1 - newSize/stats.originalSize) * 100).toFixed(1)}%)`);

      // Show what was removed
      if (stats.deadPaths.length > 0) {
        console.log('\n🗑️  Removed dead project paths:');
        for (const deadPath of stats.deadPaths) {
          console.log(`  - ${deadPath}`);
        }
      }

      // Create a backup first
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = claudeJsonPath + `.backup-dead-${timestamp}`;
      await fs.writeFile(backupPath, content);
      console.log(`\n💾 Backup saved to: ${backupPath}`);

      // Write the cleaned version
      await fs.writeFile(claudeJsonPath, cleanedContent);
      console.log(`✅ Successfully cleaned ${claudeJsonPath}`);

      // Show remaining project paths
      console.log('\n📋 Remaining valid projects:');
      const validPaths = Object.keys(cleanedProjects).slice(0, 10);
      for (const path of validPaths) {
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
console.log('🧹 Dead Project Remover for .claude.json');
console.log('=========================================');
removeDeadProjects().catch(console.error);