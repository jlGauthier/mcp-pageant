import express from 'express';
import cors from 'cors';
import open from 'open';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIXED PORT for persona editor - always use this
const PERSONA_EDITOR_PORT = 52100;

export class WebEditor {
  constructor(personaManager) {
    this.manager = personaManager;
    this.app = null;
    this.server = null;
    this.port = PERSONA_EDITOR_PORT;
    this.lastPing = Date.now();
    this.pingCheckInterval = null;
  }

  async start() {
    if (this.server) {
      return { port: this.port, message: 'Editor already running' };
    }

    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    // Disable all caching
    this.app.use((req, res, next) => {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      });
      next();
    });

    // Keep-alive endpoint
    this.app.post('/api/keepalive', (req, res) => {
      this.lastPing = Date.now();
      res.json({ success: true });
    });

    // PERSONA PREVIEW - SHOWS PERSONA.MD NOT TEMPLATE.MD!!!
    this.app.get('/api/compiled', async (req, res) => {
      try {
        const fs = await import('fs/promises');
        // Get PERSONA path, not template path!
        const personaPath = this.manager.getPersonaPath();
        const exists = await fs.access(personaPath).then(() => true).catch(() => false);
        
        if (!exists) {
          res.json({ success: true, data: '# No persona compiled yet\n\nThe persona.md file will appear here once personas are added and compiled.' });
          return;
        }
        
        const content = await fs.readFile(personaPath, 'utf8');
        res.json({ success: true, data: content });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // API Routes
    this.app.get('/api/list', async (req, res) => {
      try {
        const result = await this.manager.handleList({});
        res.json({ success: true, data: result.content[0].text });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/template', async (req, res) => {
      try {
        const fs = await import('fs/promises');
        const templatePath = this.manager.getTemplatePath();
        const exists = await fs.access(templatePath).then(() => true).catch(() => false);
        
        if (!exists) {
          res.json({ success: true, data: { items: [] } });
          return;
        }
        
        const content = await fs.readFile(templatePath, 'utf8');
        const lines = content.split('\n');
        const items = lines
          .filter(l => l.trim().startsWith('@'))
          .map(ref => {
            // Parse any @-reference, handling various path formats
            const refPath = ref.trim().substring(1); // Remove @
            const parts = refPath.split('/');

            // Find 'manifest' in the path and use parts after it
            const manifestIndex = parts.findIndex(p => p === 'manifest' || p.includes('manifest'));
            let section = '', subsection = '', file = '';

            if (manifestIndex >= 0 && manifestIndex < parts.length - 1) {
              section = parts[manifestIndex + 1] || '';
              subsection = parts[manifestIndex + 2] || '';
              file = parts[parts.length - 1] || '';
            } else {
              // Fallback: just use last parts if no manifest found
              section = parts[parts.length - 3] || '';
              subsection = parts[parts.length - 2] || '';
              file = parts[parts.length - 1] || '';
            }

            return {
              ref: ref.trim(),
              section,
              subsection,
              file
            };
          });
        
        res.json({ success: true, data: { items } });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/add', async (req, res) => {
      try {
        const { section, subsection, partial } = req.body;
        const result = await this.manager.handleAdd({ section, subsection, partial });
        res.json({ success: true, message: result.content[0].text });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/remove', async (req, res) => {
      try {
        const { section, subsection, partial } = req.body;
        const result = await this.manager.handleRemove({ section, subsection, partial });
        res.json({ success: true, message: result.content[0].text });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Get current persona
    this.app.get('/api/persona', async (req, res) => {
      try {
        const personaPath = this.manager.getPersonaPath();
        const fs = await import('fs/promises');

        try {
          const content = await fs.readFile(personaPath, 'utf8');
          res.json({ success: true, data: content });
        } catch (error) {
          // Return empty if persona doesn't exist yet
          res.json({ success: true, data: '' });
        }
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Tree building is now handled by MultiManifest in /api/manifest endpoint
    // The old scanDirectory function has been removed as it's no longer needed

    // List all available project directories in plans folder
    // Switch to a different project
    this.app.post('/api/switch-project', async (req, res) => {
      try {
        const { dirName } = req.body;
        if (!dirName) {
          return res.json({ success: false, error: 'Project directory name required' });
        }

        // Update the manager's current project directory
        // This is a bit hacky but works for the web editor
        const originalGetProjectDirName = this.manager.getProjectDirName.bind(this.manager);
        this.manager.getProjectDirName = () => dirName;

        // Reload template and persona for the new project
        const templatePath = this.manager.getTemplatePath();
        const personaPath = this.manager.getPersonaPath();

        res.json({
          success: true,
          data: {
            templatePath,
            personaPath,
            projectDir: dirName
          }
        });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/projects', async (req, res) => {
      try {
        const fs = await import('fs/promises');
        const projects = [];

        // Read all directories in the plans folder
        const plansPath = this.manager.plansDir;
        const items = await fs.readdir(plansPath, { withFileTypes: true });

        for (const item of items) {
          if (item.isDirectory() && item.name !== 'node_modules') {
            // Check if template.md exists
            const templatePath = path.join(plansPath, item.name, 'template.md');
            try {
              await fs.access(templatePath);
              // Convert directory name back to readable project path
              const projectPath = item.name.replace(/--/g, '/').replace(/^([A-Z])-/, '$1:/');
              projects.push({
                dirName: item.name,
                displayName: projectPath,
                isCurrent: item.name === this.manager.getProjectDirName()
              });
            } catch {
              // No template, skip
            }
          }
        }

        res.json({ success: true, data: projects });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/manifest', async (req, res) => {
      try {
        const fs = await import('fs/promises');
        const sections = {};

        // Use MultiManifest to list all sections
        console.log('Getting sections from MultiManifest');
        const allSections = await this.manager.multiManifest.listSections();

        for (const sectionInfo of allSections) {
          const sectionName = sectionInfo.name;

          // Determine type - sections ending in _list are lists, numbered are slots
          const isList = sectionName.endsWith('_list') || sectionName.includes('list');
          const hasNumberPrefix = true; // Most sections have number prefixes

          sections[sectionName] = {
            dir: sectionName, // Use section name for compatibility
            type: isList ? 'list' : hasNumberPrefix ? 'slot' : 'dir',
            tree: { files: [], children: {} }
          };

          // Get all files for this section (recursively)
          const files = await this.manager.multiManifest.findAllFilesRecursive(sectionName);

          // Build tree structure from files
          for (const fileInfo of files) {
            const relPath = fileInfo.relativePath.replace(/\\/g, '/');
            const parts = relPath.split('/');

            if (parts.length === 1) {
              // Direct section file
              sections[sectionName].tree.files.push(fileInfo.filename.replace('.md', ''));
            } else {
              // Subsection file
              const pathWithoutFile = parts.slice(0, -1);

              // Navigate/create tree structure
              let current = sections[sectionName].tree.children;

              for (let i = 0; i < pathWithoutFile.length; i++) {
                const part = pathWithoutFile[i];
                if (!current[part]) {
                  current[part] = { files: [], children: {} };
                }
                if (i === pathWithoutFile.length - 1) {
                  // Add file to the last directory
                  current[part].files.push(fileInfo.filename.replace('.md', ''));
                }
                current = current[part].children;
              }
            }
          }
        }

        res.json({ success: true, data: sections });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Static file handler MUST come AFTER all API routes
    this.app.use(express.static(path.join(__dirname, '..', 'editor-ui')));

    // Start server on FIXED PORT
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(PERSONA_EDITOR_PORT, async (err) => {
        if (err) {
          if (err.code === 'EADDRINUSE') {
            console.log(`Port ${PERSONA_EDITOR_PORT} already in use - editor may already be running`);
            return reject(new Error(`Port ${PERSONA_EDITOR_PORT} in use`));
          }
          return reject(err);
        }
        
        console.log(`Pageant editor running at http://localhost:${this.port}`);
        
        // Start monitoring for keep-alive pings
        this.lastPing = Date.now();
        this.pingCheckInterval = setInterval(() => {
          const timeSinceLastPing = Date.now() - this.lastPing;
          if (timeSinceLastPing > 35000) { // 35 seconds (with 5s grace period)
            console.log('No keep-alive ping received for 35 seconds, shutting down editor...');
            this.stop();
            // Don't exit the process - just stop the web server
            // process.exit(0);  // This was killing the entire MCP server!
          }
        }, 5000); // Check every 5 seconds
        
        // Open browser
        await open(`http://localhost:${this.port}`);
        
        resolve({ 
          port: this.port, 
          message: `Editor opened at http://localhost:${this.port}` 
        });
      });
    });
  }

  async stop() {
    if (this.pingCheckInterval) {
      clearInterval(this.pingCheckInterval);
      this.pingCheckInterval = null;
    }
    
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          this.app = null;
          resolve({ message: 'Editor stopped' });
        });
      });
    }
    return { message: 'Editor not running' };
  }
}