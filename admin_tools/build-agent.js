#!/usr/bin/env node
import { AgentBuilder } from './src/AgentBuilder.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node build-agent.js <agent-name> [mcp1,mcp2,...]');
    console.log('Example: node build-agent.js frontend_agent persona,selfie');
    process.exit(1);
  }

  const agentName = args[0];
  const mcps = args[1] ? args[1].split(',') : ['persona', 'selfie'];

  console.log(`Building agent: ${agentName}`);
  console.log(`MCPs to install: ${mcps.join(', ')}`);

  const builder = new AgentBuilder(__dirname);
  const result = await builder.buildAgent(agentName, { mcps });

  if (result.success) {
    console.log('\n✅ Agent created successfully!');
    console.log(`📁 Path: ${result.agentPath}`);
    console.log('\n📋 Steps completed:');
    result.results.forEach(step => console.log(`  - ${step}`));
    console.log('\n✅ Your new agent is ready to solve problems!');
  } else {
    console.error('\n❌ Failed to create agent:', result.error);
    if (result.results.length > 0) {
      console.log('\n📋 Partial progress:');
      result.results.forEach(step => console.log(`  - ${step}`));
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});