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
          .filter(l => l.trim().startsWith('@./manifest/'))
          .map(ref => {
            const parts = ref.trim().split('/');
            return {
              ref: ref.trim(),
              section: parts[2] || '',
              subsection: parts[3] || '',
              file: parts[parts.length - 1] || ''
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

    this.app.get('/api/manifest', async (req, res) => {
      try {
        const fs = await import('fs/promises');
        const manifestPath = path.join(this.manager.baseDir, 'manifest');
        const sections = {};
        
        const dirs = await fs.readdir(manifestPath);
        for (const dir of dirs) {
          const dirPath = path.join(manifestPath, dir);
          const stat = await fs.stat(dirPath);
          
          if (stat.isDirectory()) {
            let sectionName = '';
            if (dir.includes('_')) {
              sectionName = dir.split('_').slice(1).join('_');
            } else if (dir.includes('-')) {
              sectionName = dir.split('-').slice(1).join('-');
            } else {
              sectionName = dir;
            }

            // Remove _list suffix for matching with PersonaManager
            if (sectionName.endsWith('_list')) {
              sectionName = sectionName.replace(/_list$/, '');
            }
            
            // Directories ending in _list are LIST type (unordered collections)
            // All others with number prefix are SLOT type (single value)
            const isList = dir.match(/_list$/);
            const hasNumberPrefix = dir.match(/^\d+_/);
            
            sections[sectionName] = {
              dir: dir,
              type: isList ? 'list' : hasNumberPrefix ? 'slot' : 'dir',
              files: [],
              subsections: {}
            };
            
            // Read files and subdirectories
            const items = await fs.readdir(dirPath, { withFileTypes: true });
            for (const item of items) {
              if (item.isFile() && item.name.endsWith('.md')) {
                sections[sectionName].files.push(item.name.replace('.md', ''));
              } else if (item.isDirectory()) {
                const subPath = path.join(dirPath, item.name);
                const subFiles = await fs.readdir(subPath);
                const mdFiles = subFiles.filter(f => f.endsWith('.md'));
                
                const subName = item.name.replace(/^\d+_/, '');
                sections[sectionName].subsections[subName] = {
                  dir: item.name,
                  type: item.name.match(/^\d+_/) ? 'slot' : 'dir',
                  files: mdFiles.map(f => f.replace('.md', ''))
                };
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
            console.log('No keep-alive ping received for 35 seconds, shutting down...');
            this.stop();
            process.exit(0);
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