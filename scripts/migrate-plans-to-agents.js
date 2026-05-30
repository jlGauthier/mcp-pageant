#!/usr/bin/env node
/**
 * migrate-plans-to-agents.js
 *
 * One-shot migration: move every plans/{id}/template.md to <agent-dir>/pageant.template.md
 * and strip PAGEANT_ID comments from CLAUDE.local.md.
 *
 *   --dry-run   show what would happen, don't write
 *   --force     overwrite an existing pageant.template.md at the target
 */
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(PACKAGE_ROOT, '.env') });

const PLANS_DIR = path.resolve(PACKAGE_ROOT, process.env.PLANS_DIR || './plans');
const TEMPLATE_FILENAME = 'pageant.template.md';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');

function idToCandidatePaths(id) {
  // Plan IDs come from generatePathId: drive letter (no colon) joined by '--' with path segments.
  // We reverse them to a Windows absolute path. The ID is lowercase; on Windows that's fine.
  const parts = id.split('--').filter(Boolean);
  if (parts.length === 0) return [];
  const drive = parts[0];
  if (drive.length !== 1) return [];   // not a windows drive layout
  const rest = parts.slice(1).join('\\');
  return [`${drive.toUpperCase()}:\\${rest}`];
}

async function dirExists(p) {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function stripPageantId(claudeLocalPath) {
  let content;
  try {
    content = await fs.readFile(claudeLocalPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
  if (!/<!--\s*PAGEANT_ID:/.test(content)) return false;
  const updated = content.replace(/<!--\s*PAGEANT_ID:\s*.+?\s*-->\n?/, '');
  if (!DRY_RUN) await fs.writeFile(claudeLocalPath, updated, 'utf8');
  return true;
}

async function main() {
  console.log(`\n🐰 Migrate plans → agent-local templates`);
  console.log(`   PLANS_DIR: ${PLANS_DIR}`);
  if (DRY_RUN) console.log(`   MODE: DRY RUN`);
  console.log();

  let planIds;
  try {
    planIds = await fs.readdir(PLANS_DIR);
  } catch (e) {
    console.error(`❌ Cannot read plans dir: ${e.message}`);
    process.exit(1);
  }

  const results = {
    migrated: [],
    skipped_no_template: [],
    skipped_no_agent_dir: [],
    skipped_target_exists: [],
    overwritten: [],
    pageantid_stripped: 0
  };

  for (const id of planIds) {
    const planDir = path.join(PLANS_DIR, id);
    const planStat = await fs.stat(planDir).catch(() => null);
    if (!planStat || !planStat.isDirectory()) continue;

    const templatePath = path.join(planDir, 'template.md');
    try {
      await fs.access(templatePath);
    } catch {
      results.skipped_no_template.push(id);
      continue;
    }

    const candidates = idToCandidatePaths(id);
    let agentDir = null;
    for (const c of candidates) {
      if (await dirExists(c)) {
        agentDir = c;
        break;
      }
    }
    if (!agentDir) {
      results.skipped_no_agent_dir.push({ id, candidates });
      continue;
    }

    const targetPath = path.join(agentDir, TEMPLATE_FILENAME);
    const targetExists = await fs.access(targetPath).then(() => true).catch(() => false);

    if (targetExists && !FORCE) {
      results.skipped_target_exists.push({ id, targetPath });
      continue;
    }

    if (!DRY_RUN) {
      const body = await fs.readFile(templatePath, 'utf8');
      await fs.writeFile(targetPath, body, 'utf8');
    }
    if (targetExists) results.overwritten.push({ id, targetPath });
    else results.migrated.push({ id, agentDir, targetPath });

    const claudeLocal = path.join(agentDir, 'CLAUDE.local.md');
    const stripped = await stripPageantId(claudeLocal);
    if (stripped) results.pageantid_stripped++;
  }

  console.log(`✅ Migrated: ${results.migrated.length}`);
  for (const r of results.migrated.slice(0, 5)) console.log(`   ${r.id} → ${r.targetPath}`);
  if (results.migrated.length > 5) console.log(`   ... +${results.migrated.length - 5} more`);

  if (results.overwritten.length) {
    console.log(`\n♻️  Overwritten (--force): ${results.overwritten.length}`);
  }

  console.log(`\n🧹 PAGEANT_ID comments stripped from CLAUDE.local.md: ${results.pageantid_stripped}`);

  if (results.skipped_target_exists.length) {
    console.log(`\n⏭️  Target already had ${TEMPLATE_FILENAME} (use --force to overwrite): ${results.skipped_target_exists.length}`);
    for (const r of results.skipped_target_exists.slice(0, 5)) console.log(`   ${r.id}`);
  }

  if (results.skipped_no_template.length) {
    console.log(`\n⚠️  Plan dirs with no template.md: ${results.skipped_no_template.length}`);
    for (const id of results.skipped_no_template.slice(0, 5)) console.log(`   ${id}`);
  }

  if (results.skipped_no_agent_dir.length) {
    console.log(`\n👻 Orphan plans (agent dir doesn't exist): ${results.skipped_no_agent_dir.length}`);
    for (const r of results.skipped_no_agent_dir.slice(0, 10)) {
      console.log(`   ${r.id}`);
      for (const c of r.candidates) console.log(`     tried: ${c}`);
    }
    if (results.skipped_no_agent_dir.length > 10) {
      console.log(`   ... +${results.skipped_no_agent_dir.length - 10} more`);
    }
  }

  console.log(`\n${DRY_RUN ? 'DRY RUN — nothing written.' : 'Done.'}`);
  if (!DRY_RUN) {
    console.log(`\nNext steps (manual, after spot-checking):`);
    console.log(`   1. Review one migrated agent: ls <agentdir> and inspect pageant.template.md`);
    console.log(`   2. Run the test suite`);
    console.log(`   3. Delete plans dir: rm -rf "${PLANS_DIR}"`);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
