#!/usr/bin/env node

import { WebEditor } from '../src/WebEditor.js';
import { PersonaManager } from '../src/PersonaManager.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test helper to make HTTP requests
async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function createTestDirectories(tmpDir) {
  // Create main manifest
  const mainManifest = path.join(tmpDir, 'main_manifest');
  await fs.mkdir(path.join(mainManifest, '001_main'), { recursive: true });
  await fs.mkdir(path.join(mainManifest, '040_output', '01_dialect'), { recursive: true });
  await fs.mkdir(path.join(mainManifest, '040_output', '02_narration'), { recursive: true });
  await fs.mkdir(path.join(mainManifest, '010_tech', '15_frameworks', 'frontend'), { recursive: true });

  // Create test files
  await fs.writeFile(
    path.join(mainManifest, '001_main', 'professional.md'),
    'Professional persona'
  );
  await fs.writeFile(
    path.join(mainManifest, '040_output', '01_dialect', 'formal.md'),
    'Formal dialect'
  );
  await fs.writeFile(
    path.join(mainManifest, '040_output', '02_narration', 'descriptive.md'),
    'Descriptive narration'
  );
  await fs.writeFile(
    path.join(mainManifest, '010_tech', '15_frameworks', 'frontend', 'react.md'),
    'React framework guide'
  );

  // Create extension manifest
  const extManifest = path.join(tmpDir, 'ext_manifest');
  await fs.mkdir(path.join(extManifest, '001_main'), { recursive: true });
  await fs.mkdir(path.join(extManifest, '040_output', '01_dialect'), { recursive: true });
  await fs.mkdir(path.join(extManifest, '010_tech', '15_frameworks', 'backend'), { recursive: true });

  // Extension files (these should override/extend main)
  await fs.writeFile(
    path.join(extManifest, '001_main', 'casual.md'),
    'Casual persona'
  );
  await fs.writeFile(
    path.join(extManifest, '040_output', '01_dialect', 'informal.md'),
    'Informal dialect'
  );
  await fs.writeFile(
    path.join(extManifest, '010_tech', '15_frameworks', 'backend', 'express.md'),
    'Express framework guide'
  );

  return { mainManifest, extManifest };
}

async function runTests() {
  console.log('🧪 Testing WebEditor tree building with MultiManifest\n');

  // Create temp directory for tests
  const tmpDir = path.join(__dirname, 'tmp_webeditor_test_' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const { mainManifest, extManifest } = await createTestDirectories(tmpDir);

    // Set up environment
    process.env.MANIFEST_DIRS = `${mainManifest},${extManifest}`;

    // Create PersonaManager with test directories
    const manager = new PersonaManager(__dirname);
    await manager.variablesLoaded;

    // Create WebEditor instance
    const webEditor = new WebEditor(manager);

    // Start the server
    const result = await webEditor.start();
    console.log('✓ Server started:', result.message);

    // Test 1: Get manifest tree structure
    console.log('\nTest 1: Get manifest tree structure');
    const port = webEditor.port || 5442;
    const manifestResponse = await makeRequest(`http://localhost:${port}/api/manifest`);

    if (!manifestResponse.success) {
      throw new Error('Failed to get manifest: ' + manifestResponse.error);
    }

    const sections = manifestResponse.data;

    // Verify sections exist
    if (!sections['001_main']) {
      throw new Error('Missing 001_main section');
    }
    if (!sections['040_output']) {
      throw new Error('Missing 040_output section');
    }
    if (!sections['010_tech']) {
      throw new Error('Missing 010_tech section');
    }

    console.log('✓ All expected sections found');

    // Test 2: Verify file merging from multiple manifests
    console.log('\nTest 2: Verify file merging from multiple manifests');

    // Check 001_main has files from both manifests
    const mainFiles = sections['001_main'].tree.files;
    if (!mainFiles.includes('professional')) {
      throw new Error('Missing professional from main manifest');
    }
    if (!mainFiles.includes('casual')) {
      throw new Error('Missing casual from extension manifest');
    }
    console.log('✓ Files from both manifests present in 001_main');

    // Test 3: Verify subsection structure
    console.log('\nTest 3: Verify subsection structure');

    // Debug: check what files MultiManifest finds
    const outputFiles = await manager.multiManifest.findFiles('040_output');
    console.log('Files found for 040_output:', outputFiles.map(f => f.path));

    console.log('040_output structure:', JSON.stringify(sections['040_output'], null, 2));
    const outputChildren = sections['040_output'].tree.children;
    if (!outputChildren['01_dialect']) {
      throw new Error('Missing 01_dialect subsection');
    }
    if (!outputChildren['02_narration']) {
      throw new Error('Missing 02_narration subsection');
    }

    // Check dialect files from both manifests
    const dialectFiles = outputChildren['01_dialect'].files;
    if (!dialectFiles.includes('formal')) {
      throw new Error('Missing formal in dialect');
    }
    if (!dialectFiles.includes('informal')) {
      throw new Error('Missing informal in dialect');
    }
    console.log('✓ Subsections properly structured with merged files');

    // Test 4: Verify deep nesting (frameworks with org directories)
    console.log('\nTest 4: Verify deep nesting (frameworks with org directories)');

    const techChildren = sections['010_tech'].tree.children;
    if (!techChildren['15_frameworks']) {
      throw new Error('Missing 15_frameworks subsection');
    }

    const frameworkChildren = techChildren['15_frameworks'].children;
    if (!frameworkChildren['frontend']) {
      throw new Error('Missing frontend org directory');
    }
    if (!frameworkChildren['backend']) {
      throw new Error('Missing backend org directory');
    }

    // Check files in org directories
    if (!frameworkChildren['frontend'].files.includes('react')) {
      throw new Error('Missing react in frontend directory');
    }
    if (!frameworkChildren['backend'].files.includes('express')) {
      throw new Error('Missing express in backend directory');
    }
    console.log('✓ Deep nesting with org directories working correctly');

    // Test 5: Test list operation through API
    console.log('\nTest 5: Test list operation through API');
    const listResponse = await makeRequest(`http://localhost:${port}/api/list`);

    if (!listResponse.success) {
      throw new Error('Failed to list: ' + listResponse.error);
    }

    // Verify list contains expected sections
    if (!listResponse.data.includes('001_main')) {
      throw new Error('List missing 001_main');
    }
    if (!listResponse.data.includes('040_output')) {
      throw new Error('List missing 040_output');
    }
    console.log('✓ List operation returns expected sections');

    // Stop the server
    await webEditor.stop();
    console.log('\n✓ Server stopped successfully');

    console.log('\n✅ All WebEditor tree building tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
      console.log('\n🧹 Cleaned up test directories');
    } catch (e) {
      console.error('Failed to cleanup:', e.message);
    }
  }
}

// Run tests
runTests().catch(console.error);