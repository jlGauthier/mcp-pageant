#!/usr/bin/env node

import { WebEditor } from './src/WebEditor.js';
import { PersonaManager } from './src/PersonaManager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function launch() {
  try {
    // Use current directory - slash commands run in project directory
    const projectDir = process.cwd();
    console.log(`Starting editor for: ${projectDir}`);

    // Set process directory for PersonaManager
    process.chdir(projectDir);

    const manager = new PersonaManager(__dirname);
    const editor = new WebEditor(manager);

    const result = await editor.start();

    // Clear output
    console.log('✅ EDITOR LAUNCHED AT: http://localhost:52100');

    // Keep process alive
    // Simple resume works everywhere
    process.stdin.resume();

  } catch (error) {
    if (error.message.includes('Port 52100 in use')) {
      console.log('✅ Editor already running at: http://localhost:52100');
      process.exit(0);
    } else {
      console.error('❌ Failed:', error.message);
      process.exit(1);
    }
  }
}

launch();