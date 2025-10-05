import { PersonaManager } from '../src/PersonaManager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock MCP environment
process.env.MANIFEST_DIRS = './manifest,../mcp_persona/manifest';
process.env.PLANS_DIR = '../mcp_persona/plans';

async function testListCommand() {
  console.log('Testing list command with fuzzy section matching...\n');

  const manager = new PersonaManager(path.join(__dirname, '..'));

  // Test cases that my sister tried
  const testCases = [
    { section: 'look', subsection: null, description: 'List all files in look section (fuzzy match to 070_look)' },
    { section: 'look', subsection: '4_attire', description: 'List files in look/4_attire' },
    { section: '070_look', subsection: null, description: 'List all files with exact section name' },
    { section: '070_look', subsection: '4_attire', description: 'List files with exact names' },
    { section: 'main', subsection: null, description: 'List all files in main section (fuzzy match to 001_main)' },
  ];

  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.description} ===`);
    console.log(`Input: section="${testCase.section}"${testCase.subsection ? `, subsection="${testCase.subsection}"` : ''}`);

    try {
      const result = await manager.handleList({
        section: testCase.section,
        subsection: testCase.subsection
      });

      const text = result.content[0].text;
      const lines = text.split('\n');

      // Check if we got any files
      const hasFiles = lines.some(line => line.includes('-'));

      if (!hasFiles) {
        console.log('❌ EMPTY RESULT - No files found!');
        console.log('Output:', text);
      } else {
        console.log('✅ Found files:');
        // Show first few lines
        console.log(lines.slice(0, 15).join('\n'));
        if (lines.length > 15) {
          console.log(`... and ${lines.length - 15} more lines`);
        }
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
  }
}

testListCommand().catch(console.error);