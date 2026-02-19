#!/usr/bin/env node
/**
 * compile-remote.js - Compile pageant persona for a remote agent directory
 *
 * Usage:
 *   node compile-remote.js <agent-directory>
 *   node compile-remote.js "/project/.pageant/agent"
 *
 * This script allows compiling pageant personas for agents in other directories
 * without needing to cd into them or run the MCP from that location.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from script's parent directory (mcp_pageant), not cwd
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import fs from 'fs/promises';
import { PersonaManager } from '../src/PersonaManager.js';

async function compileRemote(targetDir) {
  // Resolve to absolute path
  const absoluteTarget = path.resolve(targetDir);

  console.log(`\n🎀  Compiling pageant for: ${absoluteTarget}\n`);

  // Verify target directory exists
  try {
    const stat = await fs.stat(absoluteTarget);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${absoluteTarget}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌  Directory not found: ${absoluteTarget}`);
      process.exit(1);
    }
    throw error;
  }

  // Check for CLAUDE.local.md to verify it's a pageant agent
  const claudeLocalPath = path.join(absoluteTarget, 'CLAUDE.local.md');
  let hasExistingPersona = false;
  let existingId = null;

  try {
    const content = await fs.readFile(claudeLocalPath, 'utf8');
    hasExistingPersona = true;
    const match = content.match(/<!--\s*PAGEANT_ID:\s*(.+?)\s*-->/);
    existingId = match ? match[1].trim() : null;
    console.log(`📄  Found existing CLAUDE.local.md`);
    if (existingId) {
      console.log(`🔑  PAGEANT_ID: ${existingId}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log(`📄  No existing CLAUDE.local.md (will be created)`);
  }

  // Create PersonaManager with mcp_pageant as base
  const baseDir = path.resolve(__dirname, '..');
  const manager = new PersonaManager(baseDir);

  // Wait for initialization
  await manager.projectDirNameInitialized;
  await manager.variablesLoaded;

  // Generate the ID for the target directory (same logic as PersonaManager)
  const targetId = manager.generatePathId(absoluteTarget);
  console.log(`🎯  Target ID: ${targetId}`);

  // Determine which ID to use - prefer targetId if it has a plan
  let useId = null;
  const targetPlanDir = path.join(manager.plansDir, targetId);
  const existingPlanDir = existingId ? path.join(manager.plansDir, existingId) : null;

  // Check if targetId has a plan
  try {
    await fs.access(path.join(targetPlanDir, 'template.md'));
    useId = targetId;
    console.log(`📁  Plan found for target ID: ${targetPlanDir}`);
  } catch {
    // targetId doesn't have a plan, try existingId
    if (existingId && existingId !== targetId) {
      try {
        await fs.access(path.join(existingPlanDir, 'template.md'));
        useId = existingId;
        console.log(`📁  Plan found for existing ID: ${existingPlanDir}`);
      } catch {
        // Neither has a plan
      }
    }
  }

  if (!useId) {
    console.error(`❌  No plan directory found for this agent.`);
    console.error(`   Looked for: ${targetId}`);
    if (existingId && existingId !== targetId) {
      console.error(`   Also tried: ${existingId}`);
    }
    process.exit(1);
  }

  manager.overrideProjectDirName = useId;

  // Reload variables now that we know the correct project directory
  // (loadVariables runs at construction before overrideProjectDirName is set)
  await manager.loadVariables();

  // Check template exists
  const templatePath = manager.getTemplatePath();
  try {
    const template = await fs.readFile(templatePath, 'utf8');
    const refCount = (template.match(/^@/gm) || []).length;
    console.log(`📋  Template has ${refCount} component reference(s)`);
  } catch (error) {
    console.error(`❌  Template not found: ${templatePath}`);
    process.exit(1);
  }

  // Compile!
  console.log(`\n⚙️   Compiling persona...`);

  try {
    await manager.compilePersona(absoluteTarget);
    console.log(`\n✅  Successfully compiled to: ${claudeLocalPath}`);

    // Show a preview of the output
    const output = await fs.readFile(claudeLocalPath, 'utf8');
    const lines = output.split('\n');
    const headerLines = lines.filter(l => l.startsWith('#')).slice(0, 10);

    console.log(`\n📝  Section headers:`);
    headerLines.forEach(h => console.log(`   ${h}`));

    if (headerLines.length < lines.filter(l => l.startsWith('#')).length) {
      console.log(`   ... and more`);
    }

  } catch (error) {
    console.error(`\n❌  Compilation failed:`, error.message);
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage: node compile-remote.js <agent-directory>

Examples:
  node compile-remote.js "/project/.pageant/agent"
  node compile-remote.js ../my-project/.pageant/agent

This compiles the pageant persona for an agent in another directory.
The agent must already have a plan configured (template.md in plans/).
`);
  process.exit(0);
}

compileRemote(args[0]).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
