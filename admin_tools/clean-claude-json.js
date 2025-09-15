import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function cleanClaudeJson() {
  const claudeJsonPath = 'C:\\Users\\jgaut\\.claude.json';

  console.log('\n=== Cleaning .claude.json ===\n');
  console.log(`Reading from: ${claudeJsonPath}`);

  try {
    // Read the current file
    const content = await fs.readFile(claudeJsonPath, 'utf8');
    const data = JSON.parse(content);

    // Get stats before cleaning
    const stats = {
      originalSize: Buffer.byteLength(content, 'utf8'),
      historyItemsBefore: 0,
      historyItemsRemoved: 0,
      projectsCount: 0
    };

    // Count history items across all projects
    if (data.projects) {
      stats.projectsCount = Object.keys(data.projects).length;

      for (const [projectPath, projectData] of Object.entries(data.projects)) {
        if (projectData.history && Array.isArray(projectData.history)) {
          stats.historyItemsBefore += projectData.history.length;
        }
      }
    }

    console.log('\n📊 Current Status:');
    console.log(`  - File size: ${(stats.originalSize / 1024).toFixed(2)} KB`);
    console.log(`  - Projects: ${stats.projectsCount}`);
    console.log(`  - Total history items: ${stats.historyItemsBefore}`);

    // Clean the data - remove all history arrays
    const cleanedData = { ...data };

    if (cleanedData.projects) {
      for (const [projectPath, projectData] of Object.entries(cleanedData.projects)) {
        if (projectData.history) {
          stats.historyItemsRemoved += projectData.history.length;
          // Remove the history array completely
          delete projectData.history;
        }
      }
    }

    // Also clean any top-level history if it exists
    if (cleanedData.history) {
      stats.historyItemsRemoved += cleanedData.history.length;
      delete cleanedData.history;
    }

    // Convert back to JSON with nice formatting
    const cleanedContent = JSON.stringify(cleanedData, null, 2);
    const newSize = Buffer.byteLength(cleanedContent, 'utf8');

    console.log('\n✨ After Cleaning:');
    console.log(`  - New file size: ${(newSize / 1024).toFixed(2)} KB`);
    console.log(`  - Size reduction: ${((stats.originalSize - newSize) / 1024).toFixed(2)} KB (${((1 - newSize/stats.originalSize) * 100).toFixed(1)}%)`);
    console.log(`  - History items removed: ${stats.historyItemsRemoved}`);

    // Create a backup first
    const backupPath = claudeJsonPath + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(backupPath, content);
    console.log(`\n💾 Backup saved to: ${backupPath}`);

    // Write the cleaned version
    await fs.writeFile(claudeJsonPath, cleanedContent);
    console.log(`✅ Successfully cleaned ${claudeJsonPath}`);

    // Show sample of what's left in the file
    console.log('\n📋 Structure of cleaned file:');
    const structure = getStructure(cleanedData);
    console.log(structure);

  } catch (error) {
    console.error('❌ Error cleaning .claude.json:', error);

    if (error.code === 'ENOENT') {
      console.error('   File not found at:', claudeJsonPath);
    } else if (error instanceof SyntaxError) {
      console.error('   Invalid JSON in file');
    }
  }
}

// Helper function to show the structure of the cleaned data
function getStructure(obj, indent = '  ', depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return '';

  let result = '';
  const currentIndent = indent.repeat(depth);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result += `${currentIndent}- ${key}: null\n`;
    } else if (Array.isArray(value)) {
      result += `${currentIndent}- ${key}: [${value.length} items]\n`;
    } else if (typeof value === 'object') {
      const keyCount = Object.keys(value).length;
      result += `${currentIndent}- ${key}: { ${keyCount} keys }\n`;

      // For projects, show a sample
      if (key === 'projects' && depth === 0) {
        const projectPaths = Object.keys(value).slice(0, 3);
        for (const path of projectPaths) {
          result += `${currentIndent}  - ${path}\n`;
        }
        if (Object.keys(value).length > 3) {
          result += `${currentIndent}  ... and ${Object.keys(value).length - 3} more projects\n`;
        }
      } else if (depth < maxDepth - 1) {
        result += getStructure(value, indent, depth + 1, maxDepth);
      }
    } else {
      const displayValue = typeof value === 'string' && value.length > 50
        ? value.substring(0, 50) + '...'
        : value;
      result += `${currentIndent}- ${key}: ${displayValue}\n`;
    }
  }

  return result;
}

// Run the cleaner
console.log('🧹 Claude.json History Cleaner');
console.log('================================');
cleanClaudeJson().catch(console.error);