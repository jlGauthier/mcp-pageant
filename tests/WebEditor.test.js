import { describe, it, beforeEach, afterEach } from 'vitest';
import { expect } from 'vitest';
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

describe('WebEditor', () => {
  let tmpDir;
  let webEditor;

  beforeEach(async () => {
    console.log('\n🧪 Testing WebEditor tree building with MultiManifest');

    // Create temp directory for tests
    tmpDir = path.join(__dirname, 'tmp_webeditor_test_' + Date.now());
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    // Stop server if running
    if (webEditor) {
      try {
        await webEditor.stop();
      } catch (e) {
        // Server might not be running
      }
    }

    // Cleanup temp directory - MUST succeed or test fails
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should build manifest tree with MultiManifest', async () => {
    const { mainManifest, extManifest } = await createTestDirectories(tmpDir);

    // Set up environment
    process.env.MANIFEST_DIRS = `${mainManifest},${extManifest}`;

    // Create PersonaManager with test directories
    const manager = new PersonaManager(__dirname, { testMode: true });
    await manager.variablesLoaded;

    // Create WebEditor instance
    webEditor = new WebEditor(manager);

    // Start the server
    const result = await webEditor.start();
    expect(result.port).toBeTruthy();
    expect(result.message).toBeTruthy();

    // Test 1: Get manifest tree structure
    const port = webEditor.port || 5442;
    const manifestResponse = await makeRequest(`http://localhost:${port}/api/manifest`);

    expect(manifestResponse.success).toBe(true);
    const sections = manifestResponse.data;

    // Verify sections exist
    expect(sections['001_main']).toBeTruthy();
    expect(sections['040_output']).toBeTruthy();
    expect(sections['010_tech']).toBeTruthy();

    // Test 2: Verify file merging from multiple manifests
    const mainFiles = sections['001_main'].tree.files;
    expect(mainFiles).toContain('professional');
    expect(mainFiles).toContain('casual');

    // Test 3: Verify subsection structure
    const outputChildren = sections['040_output'].tree.children;
    expect(outputChildren['01_dialect']).toBeTruthy();
    expect(outputChildren['02_narration']).toBeTruthy();

    // Check dialect files from both manifests
    const dialectFiles = outputChildren['01_dialect'].files;
    expect(dialectFiles).toContain('formal');
    expect(dialectFiles).toContain('informal');

    // Test 4: Verify deep nesting (frameworks with org directories)
    const techChildren = sections['010_tech'].tree.children;
    expect(techChildren['15_frameworks']).toBeTruthy();

    const frameworkChildren = techChildren['15_frameworks'].children;
    expect(frameworkChildren['frontend']).toBeTruthy();
    expect(frameworkChildren['backend']).toBeTruthy();

    // Check files in org directories
    expect(frameworkChildren['frontend'].files).toContain('react');
    expect(frameworkChildren['backend'].files).toContain('express');

    // Test 5: Test list operation through API
    const listResponse = await makeRequest(`http://localhost:${port}/api/list`);
    expect(listResponse.success).toBe(true);
    expect(listResponse.data).toContain('001_main');
    expect(listResponse.data).toContain('040_output');
  });
});
