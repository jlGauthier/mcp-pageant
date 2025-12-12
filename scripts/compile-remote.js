#!/usr/bin/env node
/**
 * compile-remote.js - Compile pageant persona for a remote agent directory
 *
 * Usage:
 *   node compile-remote.js <agent-directory>
 *   node compile-remote.js "C:/James/thenuts/.pageant/TW"
 *
 * This script allows compiling pageant personas for agents in other directories
 * without needing to cd into them or run the MCP from that location.
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PersonaManager } from '../src/PersonaManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Override the project directory name to point to target
  manager.overrideProjectDirName = existingId || targetId;

  // If no existing ID, we need to ensure the plan directory exists
  const planDir = path.join(manager.plansDir, manager.overrideProjectDirName);
  try {
    await fs.access(planDir);
    console.log(`📁  Plan directory exists: ${planDir}`);
  } catch {
    console.log(`📁  Plan directory not found: ${planDir}`);

    // Try to find with the generated ID instead
    if (existingId && existingId !== targetId) {
      const altPlanDir = path.join(manager.plansDir, targetId);
      try {
        await fs.access(altPlanDir);
        console.log(`📁  Found plan at: ${altPlanDir}`);
        manager.overrideProjectDirName = targetId;
      } catch {
        console.error(`❌  No plan directory found for this agent.`);
        console.error(`   Looked for: ${existingId}`);
        console.error(`   Also tried: ${targetId}`);
        process.exit(1);
      }
    } else {
      console.error(`❌  No plan directory found: ${planDir}`);
      process.exit(1);
    }
  }

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
  node compile-remote.js "C:/James/thenuts/.pageant/TW"
  node compile-remote.js ../my-project/.pageant/FS

This compiles the pageant persona for an agent in another directory.
The agent must already have a plan configured (template.md in plans/).
`);
  process.exit(0);
}

compileRemote(args[0]).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
