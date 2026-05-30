#!/usr/bin/env node
/**
 * deploy-team.js — Clone a .pageant team from one project to another
 *
 * Usage:
 *   node deploy-team.js <source-pageant-dir> <target-pageant-dir> [options]
 *
 * Examples:
 *   # Clone entire team to a new project
 *   node deploy-team.js "C:/project-a/.pageant" "C:/project-b/.pageant"
 *
 *   # Clone with extra MCPs for specific agents
 *   node deploy-team.js "C:/project-a/.pageant" "C:/project-b/.pageant" --mcps="agent_ROLE:hotline,snap"
 *
 *   # Clone only specific agents
 *   node deploy-team.js "C:/project-a/.pageant" "C:/project-b/.pageant" --only="agent1_FS,agent2_QA"
 *
 * What it does for each agent:
 *   1. Copies pageant.template.md from source agent dir to target agent dir
 *   2. Creates .mcp.json with the correct MCPs
 *   3. Creates .claude/settings.local.json
 *   4. Compiles persona → CLAUDE.local.md
 *
 * Options:
 *   --only=agent1,agent2    Only deploy these agents (comma-separated dir names)
 *   --mcps=agent:mcp1,mcp2  Extra MCPs per agent (repeatable)
 *   --base-mcps=a,b,c       Override base MCPs (default: pageant,lace,utils)
 *   --dry-run               Show what would happen without doing it
 *   --skip-compile           Skip compilation step (useful for debugging)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(PACKAGE_ROOT, '.env') });

const COMPILE_SCRIPT = path.join(PACKAGE_ROOT, 'scripts', 'compile-remote.js');
const TEMPLATE_FILENAME = 'pageant.template.md';

// All known MCP definitions — add new ones here
const MCP_DEFINITIONS = {
  pageant: {
    type: "stdio",
    command: "bun",
    args: [path.join(PACKAGE_ROOT, "server.js")],
    env: {}
  },
  lace: {
    type: "stdio",
    command: "bun",
    args: [path.resolve(PACKAGE_ROOT, "..", "mcp_lace", "server.js")],
    env: {}
  },
  utils: {
    type: "stdio",
    command: "node",
    args: [path.resolve(PACKAGE_ROOT, "..", "mcp_utils", "server.js")],
    env: {}
  },
  snap: {
    type: "stdio",
    command: "bun",
    args: [path.resolve(PACKAGE_ROOT, "..", "snap", "server.js")],
    env: {}
  },
  hotline: {
    type: "stdio",
    command: "node",
    args: [path.resolve(PACKAGE_ROOT, "..", "mcp_hotline", "server.js")],
    env: {}
  },
  benchmark: {
    type: "stdio",
    command: "bun",
    args: [path.resolve(PACKAGE_ROOT, "..", "mcp_benchmark", "server.js")],
    env: {}
  }
};

const BASE_MCPS = ['pageant', 'lace', 'utils'];

// --- Argument Parsing ---

function parseArgs(argv) {
  const args = { positional: [], options: {} };
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 0) {
        args.options[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        args.options[arg.slice(2)] = true;
      }
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

function parseAgentMcps(mcpString) {
  // Format: "agent1:mcp1,mcp2;agent2:mcp3,mcp4" or "agent1:mcp1,mcp2"
  const map = {};
  if (!mcpString) return map;
  const entries = mcpString.split(';');
  for (const entry of entries) {
    const [agent, mcps] = entry.split(':');
    if (agent && mcps) {
      map[agent.trim().toLowerCase()] = mcps.split(',').map(m => m.trim());
    }
  }
  return map;
}

// --- Discovery ---

async function discoverSourceAgents(sourceDir) {
  const agents = [];
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const agentPath = path.join(sourceDir, entry.name);

    let mcpServers = [];
    try {
      const mcpJson = JSON.parse(await fs.readFile(path.join(agentPath, '.mcp.json'), 'utf8'));
      mcpServers = Object.keys(mcpJson.mcpServers || {});
    } catch {
      mcpServers = [...BASE_MCPS];
    }

    const templatePath = path.join(agentPath, TEMPLATE_FILENAME);
    const hasTemplate = await fs.access(templatePath).then(() => true).catch(() => false);

    agents.push({
      dirName: entry.name,
      sourcePath: agentPath,
      templatePath: hasTemplate ? templatePath : null,
      mcpServers
    });
  }

  return agents;
}

// --- Build Operations ---

async function copyTemplate(sourceTemplate, targetAgentPath) {
  const targetTemplate = path.join(targetAgentPath, TEMPLATE_FILENAME);
  try {
    await fs.access(targetTemplate);
    console.log(`    Template already exists at target, skipping copy`);
    return;
  } catch { /* needs copy */ }

  await fs.mkdir(targetAgentPath, { recursive: true });
  await fs.copyFile(sourceTemplate, targetTemplate);
  console.log(`    Copied template: ${path.basename(path.dirname(sourceTemplate))} → ${path.basename(targetAgentPath)}`);
}

function buildMcpJson(mcpNames) {
  const config = { mcpServers: {} };
  for (const name of mcpNames) {
    if (MCP_DEFINITIONS[name]) {
      config.mcpServers[name] = MCP_DEFINITIONS[name];
    } else {
      console.warn(`    ⚠️  Unknown MCP: ${name} — skipped`);
    }
  }
  return config;
}

function buildSettingsJson() {
  return {
    permissions: {
      additionalDirectories: ["../.."],
      allow: [],
      deny: [],
      ask: []
    },
    enableAllProjectMcpServers: true
  };
}

async function ensureAgentDir(targetPageantDir, dirName) {
  const agentPath = path.join(targetPageantDir, dirName);
  await fs.mkdir(path.join(agentPath, '.claude'), { recursive: true });
  return agentPath;
}

async function writeIfMissing(filePath, content) {
  try {
    await fs.access(filePath);
    return false; // already exists
  } catch {
    await fs.writeFile(filePath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return true; // created
  }
}

async function compileAgent(agentPath) {
  try {
    execFileSync('node', [COMPILE_SCRIPT, agentPath], {
      stdio: 'pipe',
      timeout: 30000
    });
    return true;
  } catch (e) {
    console.error(`    ❌ Compile failed: ${e.message.split('\n')[0]}`);
    return false;
  }
}

// --- Main ---

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));

  if (positional.length < 2) {
    console.log(`
Usage: node deploy-team.js <source-pageant-dir> <target-pageant-dir> [options]

Options:
  --only=agent1,agent2          Only deploy these agents
  --mcps=agent:mcp1,mcp2        Extra MCPs per agent (semicolon-separated for multiple)
  --base-mcps=a,b,c             Override base MCPs (default: pageant,lace,utils)
  --dry-run                     Show plan without executing
  --skip-compile                Skip compilation step

Examples:
  node deploy-team.js "C:/project-a/.pageant" "C:/project-b/.pageant"
  node deploy-team.js "C:/project-a/.pageant" "C:/project-b/.pageant" --mcps="agent_ROLE:hotline,snap"
  node deploy-team.js "C:/project-a/.pageant" "C:/project-b/.pageant" --only="agent1_FS,agent2_QA"
`);
    process.exit(0);
  }

  const sourceDir = path.resolve(positional[0]);
  const targetDir = path.resolve(positional[1]);
  const dryRun = !!options['dry-run'];
  const skipCompile = !!options['skip-compile'];
  const onlyAgents = options.only ? options.only.split(',').map(s => s.trim().toLowerCase()) : null;
  const extraMcps = parseAgentMcps(options.mcps);
  const baseMcps = options['base-mcps'] ? options['base-mcps'].split(',').map(s => s.trim()) : BASE_MCPS;

  // Verify source exists
  try {
    await fs.access(sourceDir);
  } catch {
    console.error(`❌ Source not found: ${sourceDir}`);
    process.exit(1);
  }

  // Ensure target exists
  if (!dryRun) {
    await fs.mkdir(targetDir, { recursive: true });
  }

  console.log(`\n🐰 Deploy Team`);
  console.log(`   Source: ${sourceDir}`);
  console.log(`   Target: ${targetDir}`);
  if (dryRun) console.log(`   MODE: DRY RUN`);
  console.log();

  // Discover source agents
  let agents = await discoverSourceAgents(sourceDir);

  // Filter if --only specified
  if (onlyAgents) {
    agents = agents.filter(a => onlyAgents.includes(a.dirName.toLowerCase()));
  }

  if (agents.length === 0) {
    console.error('❌ No agents found to deploy.');
    process.exit(1);
  }

  console.log(`Found ${agents.length} agent(s):\n`);

  let success = 0;
  let failed = 0;

  for (const agent of agents) {
    const targetAgentPath = path.join(targetDir, agent.dirName);

    const portableMcps = agent.mcpServers.filter(m => MCP_DEFINITIONS[m]);
    const agentExtras = extraMcps[agent.dirName.toLowerCase()] || [];
    const allMcps = [...new Set([...portableMcps, ...agentExtras])];
    for (const base of baseMcps) {
      if (!allMcps.includes(base)) allMcps.unshift(base);
    }

    console.log(`📦 ${agent.dirName}`);
    console.log(`    MCPs: ${allMcps.join(', ')}`);
    console.log(`    Template: ${agent.templatePath ? '✅' : '❌ MISSING'}`);

    if (dryRun) {
      console.log(`    [DRY RUN — skipping]\n`);
      continue;
    }

    if (!agent.templatePath) {
      console.log(`    ⚠️  No source pageant.template.md — skipping (create one manually)`);
      failed++;
      console.log();
      continue;
    }

    try {
      // 1. Ensure agent directory structure
      await ensureAgentDir(targetDir, agent.dirName);

      // 2. Copy template into target agent directory
      await copyTemplate(agent.templatePath, targetAgentPath);

      // 3. Write .mcp.json
      const mcpPath = path.join(targetAgentPath, '.mcp.json');
      const mcpCreated = await writeIfMissing(mcpPath, buildMcpJson(allMcps));
      console.log(`    .mcp.json: ${mcpCreated ? 'created' : 'exists'}`);

      // 4. Write .claude/settings.local.json
      const settingsPath = path.join(targetAgentPath, '.claude', 'settings.local.json');
      const settingsCreated = await writeIfMissing(settingsPath, buildSettingsJson());
      console.log(`    settings.local.json: ${settingsCreated ? 'created' : 'exists'}`);

      // 5. Copy CLAUDE.md if it exists in source but not target
      const sourceClaude = path.join(agent.sourcePath, 'CLAUDE.md');
      const targetClaude = path.join(targetAgentPath, 'CLAUDE.md');
      try {
        await fs.access(sourceClaude);
        const claudeCreated = await writeIfMissing(targetClaude, await fs.readFile(sourceClaude, 'utf8'));
        if (claudeCreated) console.log(`    CLAUDE.md: copied from source`);
      } catch { /* no source CLAUDE.md */ }

      // 6. Compile persona
      if (!skipCompile) {
        console.log(`    Compiling...`);
        const compiled = await compileAgent(targetAgentPath);
        if (compiled) {
          console.log(`    ✅ Compiled`);
          success++;
        } else {
          failed++;
        }
      } else {
        console.log(`    ⏭️  Compile skipped`);
        success++;
      }

    } catch (e) {
      console.error(`    ❌ Error: ${e.message}`);
      failed++;
    }

    console.log();
  }

  console.log(`\n🐰 Done: ${success} deployed, ${failed} failed, ${agents.length} total`);

  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
