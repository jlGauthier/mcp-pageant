import { promises as fs } from 'fs';

async function convertToBun() {
  const claudeJsonPath = 'C:\\Users\\jgaut\\.claude.json';

  console.log('\n=== Converting MCPs to Bun ===\n');

  try {
    const content = await fs.readFile(claudeJsonPath, 'utf8');
    const data = JSON.parse(content);

    let conversionsCount = 0;

    if (data.projects) {
      for (const [projectPath, projectData] of Object.entries(data.projects)) {
        if (projectData.mcpServers) {
          for (const [serverName, serverConfig] of Object.entries(projectData.mcpServers)) {
            // Pattern 1: Direct .js file path as command
            if (typeof serverConfig.command === 'string' && serverConfig.command.endsWith('.js')) {
              console.log(`✓ Converting ${projectPath} > ${serverName}`);
              console.log(`  From: ${serverConfig.command}`);

              // Convert to bun with args
              const jsPath = serverConfig.command;
              serverConfig.command = 'bun';
              serverConfig.args = [jsPath];

              console.log(`  To: bun ${jsPath}\n`);
              conversionsCount++;
            }
            // Pattern 2: command="node" with args=[".../server.js"]
            else if (serverConfig.command === 'node' && Array.isArray(serverConfig.args) && serverConfig.args.length > 0) {
              console.log(`✓ Converting ${projectPath} > ${serverName}`);
              console.log(`  From: node ${serverConfig.args.join(' ')}`);

              serverConfig.command = 'bun';

              console.log(`  To: bun ${serverConfig.args.join(' ')}\n`);
              conversionsCount++;
            }
          }
        }
      }
    }

    if (conversionsCount === 0) {
      console.log('No Node.js MCPs found to convert!');
      return;
    }

    // Create backup
    const backupPath = claudeJsonPath + '.backup-bun-' + new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(backupPath, content);
    console.log(`\n💾 Backup saved to: ${backupPath}`);

    // Write converted version
    const convertedContent = JSON.stringify(data, null, 2);
    await fs.writeFile(claudeJsonPath, convertedContent);

    console.log(`\n✅ Successfully converted ${conversionsCount} MCP servers to Bun`);
    console.log('\n⚠️  IMPORTANT: Restart Claude Code to load Bun-based MCPs!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

console.log('🔄 MCP Node → Bun Converter');
console.log('===========================');
convertToBun().catch(console.error);
