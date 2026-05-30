#!/usr/bin/env node
/**
 * compile-remote.js — Compile pageant persona for an agent in another directory.
 *
 * Usage:
 *   node compile-remote.js <agent-directory>
 *   node compile-remote.js <agent-directory> --seed=<persona-name>
 *
 * The agent directory must already exist (with CLAUDE.md, .mcp.json, .claude/settings.local.json).
 * If pageant.template.md is missing, pass --seed=<persona-name> to create one
 * pointing at manifest/001_main/<persona>.md.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(PACKAGE_ROOT, '.env') });

import { PersonaManager } from '../src/PersonaManager.js';

function deriveAgentName(personaName) {
  return personaName
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function pastelHex() {
  const r = Math.floor(180 + Math.random() * 70);
  const g = Math.floor(150 + Math.random() * 80);
  const b = Math.floor(170 + Math.random() * 70);
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0').toUpperCase()).join('');
}

async function seedTemplate(manager, templatePath, personaName) {
  const fileInfo = await manager.multiManifest.findFile('001_main', null, personaName);
  if (!fileInfo) {
    console.error(`❌  Persona '${personaName}' not found in any configured manifest.`);
    const all = await manager.multiManifest.findFiles('001_main', null);
    console.error(`Available personas:`);
    all.forEach(f => console.error(`  ${f.filename}`));
    process.exit(1);
  }

  // Build the @reference the same way handleAdd does, so resolution stays consistent.
  const relativePath = path.relative(manager.baseDir, fileInfo.path).split(path.sep).join('/');
  const reference = `@./${relativePath}`;

  const agentName = deriveAgentName(personaName);
  const color = pastelHex();
  const content =
    `AGENT_NAME=${agentName}\n` +
    `AGENT_COLOR=${color}\n` +
    `${reference}\n`;

  await fs.writeFile(templatePath, content);
  console.log(`🌱  Seeded ${templatePath}`);
  console.log(`    AGENT_NAME=${agentName}`);
  console.log(`    AGENT_COLOR=${color}`);
  console.log(`    persona: ${personaName}`);
}

function parseArgs(argv) {
  const out = { positional: [], seed: null };
  for (const arg of argv) {
    if (arg.startsWith('--seed=')) out.seed = arg.slice('--seed='.length);
    else out.positional.push(arg);
  }
  return out;
}

async function main() {
  const { positional, seed } = parseArgs(process.argv.slice(2));
  if (positional.length === 0) {
    console.log(`
Usage: node compile-remote.js <agent-directory> [--seed=<persona-name>]

Examples:
  node compile-remote.js "/project/.pageant/agent"
  node compile-remote.js "/project/.pageant/agent" --seed=engineer
`);
    process.exit(0);
  }

  const absoluteTarget = path.resolve(positional[0]);
  console.log(`\n🎀  Compiling pageant for: ${absoluteTarget}\n`);

  try {
    const stat = await fs.stat(absoluteTarget);
    if (!stat.isDirectory()) throw new Error(`Not a directory: ${absoluteTarget}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌  Directory not found: ${absoluteTarget}`);
      process.exit(1);
    }
    throw error;
  }

  const manager = new PersonaManager(PACKAGE_ROOT);
  await manager.variablesLoaded;

  const templatePath = manager.getTemplatePath(absoluteTarget);
  let templateExists = false;
  try {
    await fs.access(templatePath);
    templateExists = true;
  } catch { /* missing */ }

  if (!templateExists) {
    if (!seed) {
      console.error(`❌  Template not found: ${templatePath}`);
      console.error(`\nSeed it first by passing --seed=<persona-name>:`);
      console.error(`  node ${path.basename(__filename)} "${absoluteTarget}" --seed=engineer`);
      console.error(`\nManifest dirs (where personas live):`);
      manager.multiManifest.getManifestDirs().forEach(d => console.error(`  ${d}`));
      process.exit(1);
    }
    await seedTemplate(manager, templatePath, seed);
  }

  const template = await fs.readFile(templatePath, 'utf8');
  const refCount = (template.match(/^@/gm) || []).length;
  console.log(`📋  Template has ${refCount} component reference(s)`);

  console.log(`\n⚙️   Compiling persona...`);
  try {
    await manager.compilePersona(absoluteTarget);
    const claudeLocalPath = path.join(absoluteTarget, 'CLAUDE.local.md');
    console.log(`\n✅  Compiled to: ${claudeLocalPath}`);

    const output = await fs.readFile(claudeLocalPath, 'utf8');
    const allHeaders = output.split('\n').filter(l => l.startsWith('#'));
    const headerLines = allHeaders.slice(0, 10);

    console.log(`\n📝  Section headers:`);
    headerLines.forEach(h => console.log(`   ${h}`));
    if (allHeaders.length > headerLines.length) {
      console.log(`   ... and ${allHeaders.length - headerLines.length} more`);
    }
  } catch (error) {
    console.error(`\n❌  Compilation failed:`, error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
