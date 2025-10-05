import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

import { PersonaManager } from './src/PersonaManager.js';

async function stressTest() {
  const manager = new PersonaManager(__dirname);

  console.log('\n=== STRESS TEST: All Pageant Tools ===\n');

  // Test 1: Inspect (should show current template)
  console.log('TEST 1: inspect tool');
  console.log('-------------------');
  const inspectResult = await manager.handleInspect();
  console.log(inspectResult.content[0].text);

  // Test 2: List with no filters
  console.log('\n\nTEST 2: list tool (no filters)');
  console.log('------------------------------');
  const listAllResult = await manager.handleList({});
  const allText = listAllResult.content[0].text;
  console.log(allText.substring(0, 500) + '...\n[truncated]');

  // Test 3: List with section filter
  console.log('\n\nTEST 3: list tool (filter by main section)');
  console.log('------------------------------------------');
  const listMainResult = await manager.handleList({ section: 'main' });
  console.log(listMainResult.content[0].text);

  // Test 4: Add to LIST section (tech)
  console.log('\n\nTEST 4: add to LIST section (tech)');
  console.log('----------------------------------');
  try {
    const addListResult = await manager.handleAdd({
      section: 'tech',
      partial: 'windows'
    });
    console.log(addListResult.content[0].text);
  } catch (error) {
    console.log('Error (expected if already added):', error.message);
  }

  // Test 5: Inspect again to see changes
  console.log('\n\nTEST 5: inspect after add');
  console.log('-------------------------');
  const inspect2Result = await manager.handleInspect();
  console.log(inspect2Result.content[0].text);

  // Test 6: Add to SLOT section (should replace)
  console.log('\n\nTEST 6: add to SLOT section (main)');
  console.log('----------------------------------');
  try {
    const addSlotResult = await manager.handleAdd({
      section: 'main',
      partial: 'agent'
    });
    console.log(addSlotResult.content[0].text);
  } catch (error) {
    console.log('Error:', error.message);
  }

  // Test 7: Inspect to see SLOT replacement
  console.log('\n\nTEST 7: inspect after SLOT replacement');
  console.log('--------------------------------------');
  const inspect3Result = await manager.handleInspect();
  console.log(inspect3Result.content[0].text);

  // Test 8: Remove from LIST
  console.log('\n\nTEST 8: remove from LIST section');
  console.log('--------------------------------');
  try {
    const removeResult = await manager.handleRemove({
      section: 'tech',
      partial: 'windows'
    });
    console.log(removeResult.content[0].text);
  } catch (error) {
    console.log('Error:', error.message);
  }

  // Test 9: Final inspect
  console.log('\n\nTEST 9: final inspect');
  console.log('---------------------');
  const inspect4Result = await manager.handleInspect();
  console.log(inspect4Result.content[0].text);

  console.log('\n\n=== STRESS TEST COMPLETE ===\n');
}

stressTest().catch(console.error);