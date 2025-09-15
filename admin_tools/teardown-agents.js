#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const CLAUDE_CONFIG_PATH = 'C:\\Users\\jgaut\\.claude.json';

async function teardownAgent(planDirName) {
  console.log(`\n🗑️  Tearing down agent: ${planDirName}`);
  const results = {
    planDir: false,
    agentDir: false,
    claudeJson: false
  };

  try {
    // 1. Delete the plan directory
    const planPath = path.join('D:\\claudeTools\\mcp_pageant\\plans', planDirName);
    try {
      await fs.rm(planPath, { recursive: true, force: true });
      console.log(`   ✅ Deleted plan directory: ${planPath}`);
      results.planDir = true;
    } catch (e) {
      console.log(`   ⚠️  Could not delete plan directory: ${e.message}`);
    }

    // 2. Convert plan directory name back to agent path
    // Format is like: C--Sprectums--agents--cleaning_lady
    // Becomes: C:\Sprectums\agents\cleaning_lady
    const pathParts = planDirName.split('--');
    if (pathParts[0] && pathParts[0].length === 1) {
      // Add colon after drive letter
      pathParts[0] = pathParts[0] + ':';
    }
    const agentPath = pathParts.join('\\');

    console.log(`   🔍 Checking for agent directory: ${agentPath}`);

    // 3. Delete the agent directory if it exists
    try {
      const exists = await fs.access(agentPath).then(() => true).catch(() => false);
      if (exists) {
        await fs.rm(agentPath, { recursive: true, force: true });
        console.log(`   ✅ Deleted agent directory: ${agentPath}`);
        results.agentDir = true;
      } else {
        console.log(`   ℹ️  Agent directory doesn't exist: ${agentPath}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Could not delete agent directory: ${e.message}`);
    }

    // 4. Remove from .claude.json
    try {
      const claudeConfig = JSON.parse(await fs.readFile(CLAUDE_CONFIG_PATH, 'utf8'));

      if (claudeConfig.projects && claudeConfig.projects[agentPath]) {
        delete claudeConfig.projects[agentPath];

        await fs.writeFile(
          CLAUDE_CONFIG_PATH,
          JSON.stringify(claudeConfig, null, 2)
        );

        console.log(`   ✅ Removed from .claude.json: ${agentPath}`);
        results.claudeJson = true;
      } else {
        console.log(`   ℹ️  No .claude.json entry found for: ${agentPath}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Could not update .claude.json: ${e.message}`);
    }

    // Summary
    const success = results.planDir || results.agentDir || results.claudeJson;
    if (success) {
      console.log(`   ✨ Agent teardown completed`);
    } else {
      console.log(`   ❌ Nothing was removed`);
    }

    return results;

  } catch (error) {
    console.error(`   ❌ Error during teardown: ${error.message}`);
    return results;
  }
}

async function main() {
  console.log('🧹 Agent Teardown Script');
  console.log('========================\n');

  // List of agents to tear down
  const agentsToRemove = [
    'C--Sprectums--agents--agents--cleaning_lady',
    'C--Sprectums--agents--cleaning_day',
    'C--Sprectums--agents--design',
    'C--Sprectums--agents--front',
    'C--Sprectums--agents--qa_eng'
  ];

  console.log(`Removing ${agentsToRemove.length} agents...`);

  const results = [];
  for (const agent of agentsToRemove) {
    const result = await teardownAgent(agent);
    results.push({ agent, ...result });
  }

  // Final summary
  console.log('\n📊 Final Summary');
  console.log('================');

  let totalPlans = 0;
  let totalDirs = 0;
  let totalJson = 0;

  results.forEach(r => {
    if (r.planDir) totalPlans++;
    if (r.agentDir) totalDirs++;
    if (r.claudeJson) totalJson++;
  });

  console.log(`   Plan directories removed: ${totalPlans}/${agentsToRemove.length}`);
  console.log(`   Agent directories removed: ${totalDirs}/${agentsToRemove.length}`);
  console.log(`   .claude.json entries removed: ${totalJson}/${agentsToRemove.length}`);

  console.log('\n✨ Teardown complete!');
}

// Run main function
main().catch(console.error);

export { teardownAgent };