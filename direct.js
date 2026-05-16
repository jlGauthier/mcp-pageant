#!/usr/bin/env node
/**
 * direct.js - Direct CLI for pageant operations on remote agents
 *
 * Usage:
 *   node direct.js --path="/project/.pageant/agent" --add --slot=tech --partial=nodejs
 *   node direct.js --path="/project/.pageant/agent" --remove --slot=tech --partial=nodejs
 *   node direct.js --path="/project/.pageant/agent" --remove --slot=tech
 *   node direct.js --path="/project/.pageant/agent" --list
 *   node direct.js --path="/project/.pageant/agent" --list --slot=tech
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from script's directory
dotenv.config({ path: path.join(__dirname, '.env') });

import { PersonaManager } from './src/PersonaManager.js';

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      const value = valueParts.join('=') || true;
      parsed[key] = value;
    }
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Validate required args
  if (!args.path) {
    console.error(`Usage:
  node direct.js --path=<agent-dir> --add --slot=<slot> --partial=<partial>
  node direct.js --path=<agent-dir> --remove --slot=<slot> [--partial=<partial>]
  node direct.js --path=<agent-dir> --list [--slot=<slot>]

Examples:
  node direct.js --path="/project/.pageant/agent" --add --slot=tech --partial=nodejs
  node direct.js --path="/project/.pageant/agent" --remove --slot=tech
  node direct.js --path="/project/.pageant/agent" --list`);
    process.exit(1);
  }

  const targetDir = path.resolve(args.path);

  // Verify target exists
  try {
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      console.error(`❌ Not a directory: ${targetDir}`);
      process.exit(1);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Directory not found: ${targetDir}`);
      process.exit(1);
    }
    throw error;
  }

  console.log(`🎀 Target: ${targetDir}`);

  // Create PersonaManager with skipInit to avoid cwd-based detection
  const manager = new PersonaManager(__dirname, { skipInit: true });
  await manager.variablesLoaded;

  // Initialize for remote target - handles copy detection
  const resolvedId = await manager.initializeForRemote(targetDir);
  console.log(`🔑 Resolved ID: ${resolvedId}`);

  // Verify plan exists
  const templatePath = manager.getTemplatePath();
  const claudeLocalPath = path.join(targetDir, 'CLAUDE.local.md');
  try {
    await fs.access(templatePath);
  } catch {
    console.error(`❌ Template not found: ${templatePath}`);
    console.error(`   Run from the agent directory first to create a plan, or copy an existing plan.`);
    process.exit(1);
  }

  // Determine operation
  if (args.add) {
    if (!args.slot || !args.partial) {
      console.error('❌ --add requires --slot and --partial');
      process.exit(1);
    }

    const { section, subsection } = slotToSectionSubsection(args.slot);
    console.log(`\n⚙️  Adding ${args.partial} to ${args.slot}...`);

    const result = await manager.handleAdd({ section, subsection, partial: args.partial, projectPath: targetDir });

    // Recompile to target directory
    await manager.compilePersona(targetDir);

    console.log(`✅ Added and compiled to ${claudeLocalPath}`);

  } else if (args.remove) {
    if (!args.slot) {
      console.error('❌ --remove requires --slot');
      process.exit(1);
    }

    const { section, subsection } = slotToSectionSubsection(args.slot);
    console.log(`\n⚙️  Removing ${args.partial || 'all'} from ${args.slot}...`);

    const result = await manager.handleRemove({ section, subsection, partial: args.partial, projectPath: targetDir });

    // Recompile to target directory
    await manager.compilePersona(targetDir);

    console.log(`✅ Removed and compiled to ${claudeLocalPath}`);

  } else if (args.list) {
    const { section, subsection } = args.slot ? slotToSectionSubsection(args.slot) : {};

    const result = await manager.handleList({ section, subsection });

    // Extract text from MCP response format
    if (result.content && result.content[0] && result.content[0].text) {
      console.log(result.content[0].text);
    }

  } else {
    console.error('❌ Specify --add, --remove, or --list');
    process.exit(1);
  }
}

function slotToSectionSubsection(slot) {
  if (slot.includes('/')) {
    const parts = slot.split('/');
    return { section: parts[0], subsection: parts[1] };
  }
  return { section: slot, subsection: undefined };
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
