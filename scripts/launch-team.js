#!/usr/bin/env node
/**
 * launch-team.js — Launch all agents in a .pageant directory as terminal tabs
 *
 * Usage:
 *   node launch-team.js <pageant-dir>           # Launch all agents
 *   node launch-team.js <pageant-dir> <agent>    # Launch single agent
 *
 * Reads AGENT_NAME and AGENT_COLOR from each agent's compiled CLAUDE.local.md
 * or from its plan template. Falls back to directory name / default color.
 *
 * Platform support:
 *   Windows: Windows Terminal tabs (wt)
 *   macOS:   Terminal.app tabs (osascript)
 *   Linux:   Sequential background processes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { execSync, execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(PACKAGE_ROOT, '.env') });

const PLANS_DIR = path.resolve(PACKAGE_ROOT, process.env.PLANS_DIR || './plans');
const COMPILE_SCRIPT = path.join(PACKAGE_ROOT, 'scripts', 'compile-remote.js');
const LAUNCH_CMD = process.env.LAUNCH_CMD || 'claude';
const DEFAULT_COLOR = '#888888';

function readVarsFromFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;

  const content = fs.readFileSync(filePath, 'utf8');

  // Check HTML comments first (compiled output format)
  const idMatch = content.match(/<!-- PAGEANT_ID: (.+?) -->/);
  if (idMatch) vars.PAGEANT_ID = idMatch[1];
  const nameMatch = content.match(/<!-- AGENT_NAME: (.+?) -->/);
  if (nameMatch) vars.AGENT_NAME = nameMatch[1];
  const colorMatch = content.match(/<!-- AGENT_COLOR: (.+?) -->/);
  if (colorMatch) vars.AGENT_COLOR = colorMatch[1];

  // Check var lines (template format: KEY=value before first @ or #)
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@') || trimmed.startsWith('#') || trimmed.startsWith('<!--')) {
      if (!trimmed.startsWith('<!--')) break;
      continue;
    }
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      if (!vars[key]) vars[key] = trimmed.substring(eqIdx + 1).trim();
    }
  }

  return vars;
}

function planKeyFromPath(agentPath) {
  let normalized = agentPath.toLowerCase();
  normalized = normalized.replace(/^([a-z]):/, '$1').replace(/\\/g, '/');
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized.split('/').filter(Boolean).join('--');
}

function getAgentVars(agentPath) {
  // Try compiled output first
  const vars = readVarsFromFile(path.join(agentPath, 'CLAUDE.local.md'));

  // Fall back to plan template if missing name/color
  if (!vars.AGENT_NAME || !vars.AGENT_COLOR) {
    const pageantId = vars.PAGEANT_ID || planKeyFromPath(agentPath);
    const planDirs = fs.existsSync(PLANS_DIR) ? fs.readdirSync(PLANS_DIR) : [];
    const match = planDirs.find(d => d.toLowerCase() === pageantId.toLowerCase());
    if (match) {
      const templateVars = readVarsFromFile(path.join(PLANS_DIR, match, 'template.md'));
      if (!vars.AGENT_NAME) vars.AGENT_NAME = templateVars.AGENT_NAME;
      if (!vars.AGENT_COLOR) vars.AGENT_COLOR = templateVars.AGENT_COLOR;
    }
  }

  return vars;
}

function discoverAgents(pageantDir) {
  const agents = [];
  const entries = fs.readdirSync(pageantDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const agentPath = path.join(pageantDir, entry.name);
    const hasClaude = fs.existsSync(path.join(agentPath, 'CLAUDE.md')) ||
                      fs.existsSync(path.join(agentPath, 'CLAUDE.local.md'));
    if (!hasClaude) continue;

    // Compile if not already compiled
    if (!fs.existsSync(path.join(agentPath, 'CLAUDE.local.md'))) {
      console.log(`  Compiling ${entry.name}...`);
      try {
        execFileSync('node', [COMPILE_SCRIPT, agentPath], { stdio: 'pipe' });
      } catch (e) {
        console.error(`  Failed to compile ${entry.name}: ${e.message}`);
      }
    }

    let vars = getAgentVars(agentPath);

    // Recompile if missing name or color
    if (!vars.AGENT_NAME || !vars.AGENT_COLOR) {
      console.log(`  Recompiling ${entry.name} (missing name/color)...`);
      try {
        execFileSync('node', [COMPILE_SCRIPT, agentPath], { stdio: 'pipe' });
        vars = getAgentVars(agentPath);
      } catch (e) {
        console.error(`  Failed to recompile ${entry.name}: ${e.message}`);
      }
    }

    agents.push({
      dir: agentPath,
      dirName: entry.name,
      name: vars.AGENT_NAME || entry.name,
      color: vars.AGENT_COLOR || DEFAULT_COLOR
    });
  }

  return agents;
}

function printAgents(agents) {
  console.log(`Launching ${agents.length} agents...`);
  for (const agent of agents) {
    console.log(`  ${agent.name.padEnd(12)} ${agent.color}  ${agent.dirName}`);
  }
}

function launchWindows(agents) {
  const tabLines = agents.map((agent, i) => {
    const sep = i < agents.length - 1 ? ' `; `' : '';
    return `   new-tab --title "${agent.name}" --suppressApplicationTitle -d "${agent.dir}" --tabColor '${agent.color}' cmd /k "set CLAUDECODE= && ${LAUNCH_CMD}"${sep}`;
  });

  const ps1Content = `wt -w new ${tabLines.join('\n')}`;
  const tmpFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'launch-team-tmp.ps1');
  fs.writeFileSync(tmpFile, ps1Content);
  execSync(`powershell -ExecutionPolicy Bypass -File "${tmpFile}"`, { stdio: 'inherit' });
  fs.unlinkSync(tmpFile);
}

function launchMac(agents) {
  // First agent opens a new window, rest open as tabs
  const commands = agents.map((agent, i) => {
    const cdAndRun = `cd ${agent.dir.replace(/'/g, "\\'")} && ${LAUNCH_CMD}`;
    if (i === 0) {
      return `tell application "Terminal"
        activate
        do script "${cdAndRun}"
        set custom title of front window to "${agent.name}"
      end tell`;
    }
    return `tell application "Terminal"
        activate
        tell application "System Events" to keystroke "t" using command down
        delay 0.3
        do script "${cdAndRun}" in front window
        set custom title of front window to "${agent.name}"
      end tell`;
  });

  const script = commands.join('\n');
  execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { stdio: 'inherit' });
}

function launchLinux(agents) {
  // Fallback: launch each agent as a background process
  for (const agent of agents) {
    execSync(`cd "${agent.dir}" && ${LAUNCH_CMD} &`, { stdio: 'inherit', shell: true });
  }
}

function launchAgents(agents) {
  if (agents.length === 0) {
    console.error('No agents found.');
    process.exit(1);
  }

  printAgents(agents);

  const platform = process.platform;
  if (platform === 'win32') {
    launchWindows(agents);
  } else if (platform === 'darwin') {
    launchMac(agents);
  } else {
    launchLinux(agents);
  }
}

// --- Main ---
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node launch-team.js <pageant-dir> [agent-name]');
  process.exit(1);
}

const pageantDir = path.resolve(args[0]);
if (!fs.existsSync(pageantDir)) {
  console.error(`Directory not found: ${pageantDir}`);
  process.exit(1);
}

const filterAgent = args[1] || null;
let agents = discoverAgents(pageantDir);

if (filterAgent) {
  agents = agents.filter(a =>
    a.name.toLowerCase() === filterAgent.toLowerCase() ||
    a.dirName.toLowerCase() === filterAgent.toLowerCase()
  );
}

launchAgents(agents);
