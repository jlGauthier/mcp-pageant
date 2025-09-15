#!/usr/bin/env node
const readline = require('readline');
const { exec } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=== Agent Builder ===');
console.log('Create a new development agent with MCPs and permissions.\n');

rl.question('Enter agent name (e.g., frontend_agent): ', (name) => {
  if (!name.match(/^[a-zA-Z0-9_-]+$/)) {
    console.error('❌ Invalid name. Use only letters, numbers, underscores, or hyphens.');
    rl.close();
    process.exit(1);
  }

  console.log(`\nBuilding agent: ${name}...`);

  exec(`node ${__dirname}/build-agent.js ${name}`, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Build failed:', stderr);
      rl.close();
      process.exit(1);
    }

    console.log(stdout);
    rl.close();
  });
});