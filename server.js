#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the server's directory, not the working directory
dotenv.config({ path: path.join(__dirname, '.env') });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync, openSync, writeSync, closeSync, statSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import http from 'http';
import { spawn } from 'child_process';
import { PersonaManager } from './src/PersonaManager.js';

class PersonaServer {
  constructor() {
    this.manager = new PersonaManager(__dirname);
    console.error('[Pageant] manifest dirs:', this.manager.multiManifest.getManifestDirs());

    this.variableNames = [];
    this.toolHints = {};
    this.manifestStructure = {};
    this.customTools = [];
    this.slotEnum = [];
    this.slotKeyMap = new Map(); // Maps slot name -> slot key
    this.talentDescriptions = [];
    this.activeTimers = new Map(); // Maps slotKey -> timerId for cancellation

    // --- Channel identity ---
    this.channel = this._parseChannelIdentity();

    this.server = new Server(
      {
        name: 'mcp-pageant',
        version: '3.0.0',
      },
      {
        capabilities: {
          experimental: { 'claude/channel': {} },
          tools: {}
        },
        instructions: this.channel.active
          ? `Agent messages arrive as <channel source="mcp-pageant" from="name/role@project">. Use the send tool to message other agents. Use roster to see who is online. Your identity: ${this.channel.display}`
          : undefined,
      }
    );

    this.initPromise = this.initialize();
  }

  async initialize() {
    await this.manager.variablesLoaded;
    await this.loadVariableNames();
    await this.loadToolHints();
    await this.loadManifestStructure();
    await this.loadCustomTools();
    await this.loadSlotEnum();
    await this.loadTalentDescriptions();

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupErrorHandling();
  }

  async loadManifestStructure() {
    const structure = {};

    // Scan both manifest directories
    for (const manifestDir of this.manager.manifestDirs) {
      try {
        const sections = await fs.readdir(manifestDir);

        for (const section of sections) {
          const sectionPath = path.join(manifestDir, section);
          const stat = await fs.stat(sectionPath);

          if (stat.isDirectory() && section.match(/^\d{3}_/)) {
            if (!structure[section]) {
              structure[section] = {};
            }

            // Check for subsections
            const items = await fs.readdir(sectionPath);
            for (const item of items) {
              const itemPath = path.join(sectionPath, item);
              const itemStat = await fs.stat(itemPath);

              if (itemStat.isDirectory()) {
                if (!structure[section][item]) {
                  structure[section][item] = [];
                }

                // Check for organizational subdirectories in sections with deep nesting
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning manifest dir ${manifestDir}:`, error);
      }
    }

    this.manifestStructure = structure;
  }

  async loadToolHints() {
    let hints = [];

    // Load hints from each manifest directory
    for (const manifestDir of this.manager.manifestDirs) {
      try {
        const hintsPath = path.join(manifestDir, 'tool_hints.txt');
        const content = await fs.readFile(hintsPath, 'utf8');
        hints.push(content.trim());
      } catch (error) {
        // No hints file is fine
      }
    }

    // Combine all hints with newlines
    this.toolHintsText = hints.length > 0 ? '\n\n' + hints.join('\n\n') : '';
  }

  async loadCustomTools() {
    const allTools = [];

    // Load custom tools from each manifest directory
    for (const manifestDir of this.manager.manifestDirs) {
      try {
        const toolsPath = path.join(manifestDir, 'tools.json');
        const content = await fs.readFile(toolsPath, 'utf8');
        const tools = JSON.parse(content);

        if (Array.isArray(tools)) {
          allTools.push(...tools);
        }
      } catch (error) {
        // No tools.json in this manifest is fine
      }
    }

    this.customTools = allTools;
  }

  async loadTalentDescriptions() {
    const talents = [];

    // Scan 015_talents in all manifest directories
    for (const manifestDir of this.manager.manifestDirs) {
      try {
        const talentsPath = path.join(manifestDir, '015_talents');
        const files = await fs.readdir(talentsPath);

        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(talentsPath, file);
            const content = await fs.readFile(filePath, 'utf8');

            // Extract frontmatter
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (frontmatterMatch) {
              const frontmatter = frontmatterMatch[1];
              const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
              const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

              if (nameMatch && descMatch) {
                talents.push({
                  name: nameMatch[1].trim(),
                  description: descMatch[1].trim(),
                  filename: file.replace('.md', '')
                });
              }
            }
          }
        }
      } catch (error) {
        // No 015_talents directory in this manifest is fine
      }
    }

    this.talentDescriptions = talents;
  }

  async loadVariableNames() {
    const varSet = new Set();

    // Load from ALL manifest directories first
    for (const manifestDir of this.manager.manifestDirs) {
      try {
        const manifestVarsPath = path.join(manifestDir, 'default_vars.txt');
        const content = await fs.readFile(manifestVarsPath, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key] = trimmed.split('=');
            if (key) {
              varSet.add(key.trim());
            }
          }
        }
      } catch (error) {
        // No default_vars.txt in this manifest is fine
      }
    }

    this.variableNames = Array.from(varSet);

    if (this.variableNames.length === 0) {
      this.variableNames = ['API_KEY', 'DEBUG_MODE', 'LOG_LEVEL', 'ENV'];
    }
  }

  async loadSlotEnum() {
    const slots = [];

    for (const manifestDir of this.manager.manifestDirs) {
      try {
        const sections = await fs.readdir(manifestDir);

        for (const section of sections) {
          const sectionPath = path.join(manifestDir, section);
          const stat = await fs.stat(sectionPath);

          if (stat.isDirectory() && section.match(/^\d{3}[_-]/)) {
            const sectionNum = section.match(/^(\d{3})[_-]/)[1];
            const sectionName = section.replace(/^\d{3}[_-]/, '');

            // Always add the section itself (for root-level files)
            slots.push(sectionName);
            this.slotKeyMap.set(sectionName, sectionNum);

            // Check for numbered subsections and add them too
            const items = await fs.readdir(sectionPath);

            for (const item of items) {
              const itemPath = path.join(sectionPath, item);
              const itemStat = await fs.stat(itemPath);

              if (itemStat.isDirectory() && item.match(/^\d+[_-]/)) {
                const subNum = item.match(/^(\d+)[_-]/)[1];
                const subName = item.replace(/^\d+[_-]/, '');
                const slotName = `${sectionName}/${subName}`;
                slots.push(slotName);
                this.slotKeyMap.set(slotName, `${sectionNum}.${subNum}`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning manifest dir ${manifestDir}:`, error);
      }
    }

    this.slotEnum = [...new Set(slots)].sort();
  }

  slotToSectionSubsection(slot) {
    if (slot.includes('/')) {
      const parts = slot.split('/');
      return { section: parts[0], subsection: parts[1] };
    }
    return { section: slot, subsection: undefined };
  }

  getDurationMs(duration) {
    return {
      'session': null,
      '1day': 24 * 60 * 60 * 1000,
      '1hour': 60 * 60 * 1000,
      '10min': 10 * 60 * 1000,
      '5min': 5 * 60 * 1000,
      '1min': 60 * 1000,
      '30sec': 30 * 1000
    }[duration] || null;
  }

  scheduleAutoRemoval(slot, slotKey, duration) {
    const durationMs = this.getDurationMs(duration);

    if (duration === 'session') {
      // Session cleanup happens when MCP disconnects - not implemented yet
      console.log(`Component with slot key '${slotKey}' marked for session cleanup (not yet implemented)`);
      return;
    }

    if (durationMs) {
      // Cancel any existing timer for this slot to prevent stale timer interference
      if (this.activeTimers.has(slotKey)) {
        clearTimeout(this.activeTimers.get(slotKey));
        console.log(`Cancelled previous timer for slot '${slotKey}'`);
      }

      const timerId = setTimeout(async () => {
        try {
          // Clean up timer reference
          this.activeTimers.delete(slotKey);

          const templatePath = this.manager.getTemplatePath(process.cwd());
          await this.manager.removeSlotByKey(templatePath, slotKey);

          // Recompile after removal so the base file shows through
          await this.manager.compilePersona(process.cwd());

          console.log(`Auto-removed slot '${slotKey}' after ${duration} and recompiled`);
        } catch (error) {
          console.error(`Failed to auto-remove slot '${slotKey}':`, error.message);
        }
      }, durationMs);

      // Track the timer so we can cancel it if a new override comes in
      this.activeTimers.set(slotKey, timerId);

      console.log(`Scheduled auto-removal of slot '${slotKey}' in ${duration}`);
    }
  }

  async handleCustomTool(tool, args) {
    const handler = tool.handler;

    if (handler.type === 'add') {
      // Custom add handler - forwards to PersonaManager.handleAdd with modified args
      const addArgs = {
        section: handler.section,
        subsection: handler.useSubsectionParam ? args.subsection : handler.subsection,
        partial: args.partial
      };
      return await this.manager.handleAdd({ ...addArgs, projectPath: process.cwd() });
    } else if (handler.type === 'inspect_template') {
      // Inspect handler - shows current template composition
      return await this.manager.handleInspect(process.cwd());
    } else if (handler.type === 'thrift') {
      // Thrift handler - inline text override
      return await this.manager.handleThrift({ ...args, projectPath: process.cwd() });
    } else if (handler.type === 'talent') {
      // Talent handler - temporary component with timer
      return await this.manager.handleTalent({ ...args, projectPath: process.cwd() });
    }

    throw new Error(`Unknown custom tool handler type: ${handler.type}`);
  }

  setupResourceHandlers() {
    // No resources currently - cross-agent messaging was removed
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.stdout.on('error', (err) => {
      console.error('[Pageant] stdout error (pipe broken):', err.message);
    });
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  // --- Channel identity ---

  _parseChannelIdentity() {
    const cwd = process.cwd().replace(/\\/g, '/');
    console.error(`[Pageant] Channel parse cwd: ${cwd}`);
    let agentName = null;
    let agentJob = null;

    // AGENT_NAME and AGENT_JOB are still written into CLAUDE.local.md.
    // AGENT_PROJECT is always derived from the path — never read from the file.
    try {
      const localPath = join(process.cwd(), 'CLAUDE.local.md');
      const content = readFileSync(localPath, 'utf8');
      const nameMatch = content.match(/<!--\s*AGENT_NAME:\s*(.+?)\s*-->/);
      const jobMatch = content.match(/<!--\s*AGENT_JOB:\s*(.+?)\s*-->/);
      if (nameMatch) agentName = nameMatch[1].trim();
      if (jobMatch) agentJob = jobMatch[1].trim();
    } catch (e) {
      console.error(`[Pageant] Failed reading CLAUDE.local.md: ${e.message}`);
    }

    if (!agentName) {
      console.error('[Pageant] No AGENT_NAME — channel inactive');
      return { active: false };
    }

    const project = PersonaManager.deriveProjectFromPath(cwd);

    if (!agentJob) {
      const segments = cwd.split('/').filter(Boolean);
      const dirName = segments[segments.length - 1] || '';
      const underIdx = dirName.indexOf('_');
      if (underIdx > 0) agentJob = dirName.slice(underIdx + 1);
    }
    const job = agentJob || '';
    const name = agentName.toLowerCase();
    const display = job ? `${name}/${job}@${project}` : `${name}@${project}`;
    const relayId = cwd;

    console.error(`[Pageant] Channel identity: ${display} (relay: ${relayId})`);

    return { active: true, name, job, project, display, relayId, agentPath: cwd };
  }

  // --- Channel relay helpers ---

  _relayPost(relayPath, payload) {
    const port = parseInt(process.env.RELAY_PORT || '7760', 10);
    const host = process.env.RELAY_HOST || 'localhost';
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const req = http.request({
        hostname: host, port, path: relayPath, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (_) { reject(new Error(`Relay returned invalid JSON: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Relay timeout')); });
      req.write(data);
      req.end();
    });
  }

  _relayGet(relayPath) {
    const port = parseInt(process.env.RELAY_PORT || '7760', 10);
    const host = process.env.RELAY_HOST || 'localhost';
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${host}:${port}${relayPath}`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (_) { reject(new Error(`Relay returned invalid JSON: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Relay timeout')); });
    });
  }

  _connectSSE() {
    if (!this.channel.active) return;
    if (stdinDead) {
      logLifecycle('SSE connect skipped — stdin already dead');
      return;
    }

    const port = parseInt(process.env.RELAY_PORT || '7760', 10);
    const host = process.env.RELAY_HOST || 'localhost';
    const id = encodeURIComponent(this.channel.relayId);
    const agentPath = encodeURIComponent(this.channel.agentPath);
    const meta = encodeURIComponent(JSON.stringify({
      name: this.channel.name,
      job: this.channel.job,
      project: this.channel.project,
      display: this.channel.display
    }));
    const url = `http://${host}:${port}/subscribe/${id}?path=${agentPath}&meta=${meta}`;

    let keepaliveTimer = null;
    const resetKeepalive = (onTimeout) => {
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      keepaliveTimer = setTimeout(onTimeout, 45000);
    };

    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[Pageant] SSE connect failed: ${res.statusCode}`);
        setTimeout(() => this._connectSSE(), 3000);
        return;
      }

      logLifecycle(`SSE subscribed as "${this.channel.display}"`);
      let buffer = '';

      const reconnect = () => {
        if (keepaliveTimer) clearTimeout(keepaliveTimer);
        res.destroy();
        logLifecycle('SSE disconnected, reconnecting in 3s...');
        setTimeout(() => this._connectSSE(), 3000);
      };

      resetKeepalive(reconnect);

      res.on('data', (chunk) => {
        const raw = chunk.toString();
        buffer += raw;
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith(': keepalive') || line.startsWith(': connected')) {
            resetKeepalive(reconnect);
            continue;
          }
          if (line.startsWith('data: ')) {
            resetKeepalive(reconnect);
            const jsonStr = line.slice(6);
            let event;
            try {
              event = JSON.parse(jsonStr);
            } catch (e) {
              console.error(`[Pageant] SSE JSON PARSE FAILED: ${e.message} | raw: ${jsonStr.slice(0, 200)}`);
              continue;
            }
            logLifecycle(`SSE EVENT from=${event.meta?.from} content=${(event.content || '').slice(0, 80)}`);
            if (!this.server.transport) {
              logLifecycle('Transport null — dropping channel message');
              continue;
            }
            try {
              this.server.notification({
                method: 'notifications/claude/channel',
                params: {
                  content: event.content,
                  meta: event.meta || {}
                }
              }).then(() => {
                logLifecycle('NOTIFICATION SENT ok');
              }).catch(err => {
                logLifecycle(`NOTIFICATION ASYNC FAIL: ${err.message}`);
              });
            } catch (syncErr) {
              logLifecycle(`NOTIFICATION SYNC THROW: ${syncErr.message}\n${syncErr.stack}`);
            }
          } else if (line.trim() && !line.startsWith(':')) {
            console.error(`[Pageant] SSE UNEXPECTED LINE: ${line.slice(0, 200)}`);
          }
        }
      });

      res.on('end', () => {
        logLifecycle('SSE res.end fired');
        reconnect();
      });
      res.on('error', (err) => {
        logLifecycle(`SSE res.error: ${err.message}`);
        reconnect();
      });
    });

    req.on('error', (err) => {
      logLifecycle(`Relay connect error: ${err.message}, retrying in 3s...`);
      setTimeout(() => this._connectSSE(), 3000);
    });
  }

  setupToolHandlers() {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const cwd = process.cwd();
      const isInPageantSubdir = cwd.includes('.pageant');

      const tools = [
          {
            name: 'add',
            description: `Adds Pageant persona components to your system context, modifying who you are.

Pageant defines your identity through composable markdown components organized in manifest directories. Components in the same slot replace each other. Your compiled template is written to ${process.cwd()}/CLAUDE.local.md

Usage notes:
- Specify \`partial\` to match a component filename (e.g., "athletic" matches "athletic_fit")
- Use \`partial=random\` to add a random component from the specified slot
- Inline content is auto-detected when partial contains spaces (e.g., "custom configuration text")
- File path: pass a relative or absolute path (e.g., "./docs/QA/05-onboarding.md") to inject any file as a component
- Use \`duration\` to auto-remove after specified time (default: kept permanently)
- Temporary components auto-restore the previous content when they expire
- The tool compiles your persona automatically after adding the component

Manifest directories:
${this.manager.manifestDirs.map(dir => `- ${dir}`).join('\n')}`,
            inputSchema: {
              type: 'object',
              properties: {
                slot: {
                  type: 'string',
                  enum: this.slotEnum,
                  description: 'Slot to add to'
                },
                partial: {
                  type: 'string',
                  description: 'Partial filename to match, "random" for random selection, or inline content (auto-detected by spaces)'
                },
                duration: {
                  type: 'string',
                  enum: ['kept', 'session', '1day', '1hour', '10min', '5min', '1min', '30sec'],
                  description: 'How long to keep this component (default: kept)',
                  default: 'kept'
                },
                target: {
                  type: 'string',
                  description: 'Absolute path to target agent directory. Omit to target self.'
                }
              },
              required: ['slot', 'partial']
            }
          },
          {
            name: 'remove',
            description: `Removes persona component(s) from your active template and recompiles.

Usage notes:
- Specify \`partial\` to remove a specific component matching that filename
- Omit \`partial\` to remove all components in the specified slot
- The tool compiles your persona automatically after removal`,
            inputSchema: {
              type: 'object',
              properties: {
                slot: {
                  type: 'string',
                  description: 'Slot to remove from'
                },
                partial: {
                  type: 'string',
                  description: 'Optional partial filename to remove specific file. Omit to remove all files in slot.'
                },
                target: {
                  type: 'string',
                  description: 'Absolute path to target agent directory. Omit to target self.'
                }
              },
              required: ['slot']
            }
          },
          {
            name: 'list',
            description: `Lists all available persona components you can add to your template.

Usage notes:
- Returns components organized by section (main, tech, pattern, jobs, output, etc.)
- Use this tool to discover available components before calling add
- Slot keys indicate replacement behavior: components with the same slot key replace each other
- Use slot="self" to show active components currently loaded in your template (inspect mode)`,
            inputSchema: {
              type: 'object',
              properties: {
                slot: {
                  type: 'string',
                  enum: ['self', ...this.slotEnum, ''],
                  description: 'Optional slot to filter results. Leave empty for all. Use "self" to inspect active template.'
                },
                target: {
                  type: 'string',
                  description: 'Absolute path to target agent directory. Omit to target self. Only used with slot="self".'
                }
              },
              required: []
            }
          },
          {
            name: 'set_var',
            description: `Sets a persona variable value for the current project and recompiles.

Usage notes:
- Variables are used in persona templates for dynamic content substitution
- Common variables: PROJECT_NAME, AGENT_NAME, DEBUG_MODE, LOG_LEVEL
- The tool compiles your persona automatically after setting the variable`,
            inputSchema: {
              type: 'object',
              properties: {
                variable: {
                  type: 'string',
                  enum: this.variableNames,
                  description: 'Variable name to set'
                },
                value: {
                  type: 'string',
                  description: 'New value for the variable'
                },
                target: {
                  type: 'string',
                  description: 'Absolute path to target agent directory. Omit to target self.'
                }
              },
              required: ['variable', 'value']
            }
          },
          ...this.customTools.map(tool => {
            let description = tool.description;

            // Dynamically append talent list to talent tool description
            if (tool.name === 'talent' && this.talentDescriptions.length > 0) {
              description += '\n\nAvailable talents:\n' +
                this.talentDescriptions.map(t => `- ${t.filename}: ${t.description}`).join('\n');
            }

            return {
              name: tool.name,
              description,
              inputSchema: tool.inputSchema
            };
          })
        ];

      // Channel tools
      tools.push(
        {
          name: 'send',
          description: 'Send a message to another agent. Arrives in their session as a <channel> event. Use name@project to target a specific agent (e.g. "agent@myproject"), or just name if unambiguous.',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Target: name, name@project, or full relay ID' },
              message: { type: 'string', description: 'Message content to send' },
              status: { type: 'string', enum: ['working', 'idle', 'blocked'], description: 'Optional: update your roster status when sending' },
              whisper: { type: 'boolean', description: 'If true, message is excluded from channel history (default: false)' }
            },
            required: ['to', 'message']
          }
        },
        {
          name: 'broadcast',
          description: 'Send a message to multiple agents at once. Pass a comma-separated list of names, or "all" to message every agent in your project (excluding yourself).',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Comma-separated targets (e.g. "frontend,backend,qa") or "all" for entire project roster' },
              message: { type: 'string', description: 'Message content to send' },
              status: { type: 'string', enum: ['working', 'idle', 'blocked'], description: 'Optional: update your roster status when broadcasting' }
            },
            required: ['to', 'message']
          }
        },
        {
          name: 'roster',
          description: 'List connected agents. By default shows only agents in your project. Set all=true to see every agent across all projects.',
          inputSchema: {
            type: 'object',
            properties: {
              all: { type: 'boolean', description: 'Show all agents across all projects (default: false, shows only your project)' }
            },
            required: []
          }
        },
        {
          name: 'history',
          description: 'View recent channel messages in your project. Useful after context clear to catch up on what you missed.',
          inputSchema: {
            type: 'object',
            properties: {
              last: { type: 'number', description: 'Number of recent messages to retrieve (default: 20, max: 50)' }
            },
            required: []
          }
        }
      );

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Resolve target: fresh PersonaManager for remote agents, self for local.
      // No ID resolution needed — the project path IS the identity.
      const resolveForTarget = async (target) => {
        if (!target) {
          return { manager: this.manager, projectPath: process.cwd() };
        }
        const targetPath = path.resolve(target);
        const manager = new PersonaManager(__dirname);
        await manager.variablesLoaded;
        return { manager, projectPath: targetPath };
      };

      try {
        switch (name) {
          case 'add': {
            const duration = args.duration || 'kept';
            const { manager, projectPath } = await resolveForTarget(args.target);

            // Resolve content source: inline text, file path, or manifest component
            const isInlineContent = args.partial && (
              args.partial.includes(' ') ||
              args.partial.includes('\n') ||
              (args.partial.startsWith('"') && args.partial.endsWith('"'))
            );

            const isFilePath = args.partial && (
              args.partial.startsWith('./') ||
              args.partial.startsWith('../') ||
              args.partial.startsWith('/') ||
              /^[a-zA-Z]:[/\\]/.test(args.partial)
            );

            // --- Inline content or file path: inject via thrift ---
            if (isInlineContent || isFilePath) {
              let content, virtualPath;

              if (isFilePath) {
                const resolvedPath = path.resolve(projectPath, args.partial);
                try {
                  content = await fs.readFile(resolvedPath, 'utf8');
                } catch (error) {
                  return {
                    content: [{ type: 'text', text: `Error: Could not read file "${resolvedPath}": ${error.message}` }]
                  };
                }
                const fileName = path.basename(resolvedPath, path.extname(resolvedPath));
                virtualPath = `${args.slot}/file_${fileName}`;
              } else {
                content = args.partial.startsWith('"') && args.partial.endsWith('"')
                  ? args.partial.slice(1, -1)
                  : args.partial;
                virtualPath = `${args.slot}/inline_${Date.now()}`;
              }

              let slotKey = this.slotKeyMap.get(args.slot);
              if (!slotKey) {
                return {
                  content: [{ type: 'text', text: `Error: Unknown slot "${args.slot}"` }]
                };
              }

              let expiresAt = null;
              if (duration !== 'kept') {
                slotKey = `${slotKey}.override`;
                const durationMs = this.getDurationMs(duration);
                if (durationMs) expiresAt = Date.now() + durationMs;
              }

              const result = await manager.handleThrift({
                slot_key: slotKey,
                virtual_path: virtualPath,
                content,
                expiresAt,
                projectPath
              });

              if (duration !== 'kept' && !args.target) {
                this.scheduleAutoRemoval(args.slot, slotKey, duration);
              }

              return result;
            }

            // --- Manifest component add ---
            const { section, subsection } = this.slotToSectionSubsection(args.slot);

            if (duration !== 'kept') {
              const slotKey = this.slotKeyMap.get(args.slot);
              if (!slotKey) {
                return {
                  content: [{ type: 'text', text: `Error: Unknown slot "${args.slot}"` }]
                };
              }

              const durationMs = this.getDurationMs(duration);
              const expiresAt = durationMs ? Date.now() + durationMs : null;

              const result = await manager.handleTemporaryAdd({
                section,
                subsection,
                partial: args.partial,
                slotKey,
                expiresAt,
                projectPath
              });

              if (!args.target) {
                this.scheduleAutoRemoval(args.slot, `${slotKey}.override`, duration);
              }
              return result;
            }

            return await manager.handleAdd({ section, subsection, partial: args.partial, projectPath });
          }
          case 'remove': {
            const { manager, projectPath } = await resolveForTarget(args.target);
            const { section, subsection } = this.slotToSectionSubsection(args.slot);
            return await manager.handleRemove({ section, subsection, partial: args.partial, projectPath });
          }
          case 'list': {
            // "self" triggers inspect mode - show active template components
            if (args.slot === 'self') {
              const { manager, projectPath } = await resolveForTarget(args.target);
              return await manager.handleInspect(projectPath);
            }
            if (args.slot && args.slot !== '') {
              const { section, subsection } = this.slotToSectionSubsection(args.slot);
              return await this.manager.handleList({ section, subsection });
            }
            return await this.manager.handleList({});
          }
          case 'set_var': {
            const { manager, projectPath } = await resolveForTarget(args.target);
            return await manager.handleSetVar({ variable: args.variable, value: args.value, projectPath });
          }
          case 'send': {
            if (!this.channel.active) {
              return { content: [{ type: 'text', text: 'Channel inactive — no AGENT_NAME in CLAUDE.local.md' }] };
            }
            try {
              // Resolve bare names against project roster first
              let resolvedTo = args.to;
              const toLower = args.to.toLowerCase().trim();
              if (!toLower.includes('@') && !toLower.includes('/') && !toLower.includes('--')) {
                try {
                  const roster = await this._relayGet('/agents');
                  const match = roster.agents.find(a => a.name === toLower && a.project === this.channel.project);
                  if (match) resolvedTo = match.id;
                } catch (_) { /* fall through to raw target */ }
              }
              const result = await this._relayPost('/send', {
                from: this.channel.relayId,
                from_display: this.channel.display,
                from_path: this.channel.agentPath,
                to: resolvedTo,
                message: args.message,
                whisper: args.whisper || false
              });
              if (args.status) {
                this._relayPost('/status', { from: this.channel.relayId, status: args.status }).catch(() => {});
              }
              if (result.sent) {
                const statusNote = args.status ? ` (status → ${args.status})` : '';
                let crossProjectNote = '';
                let ambiguityNote = '';
                const display = result.to_display || '';
                const atIdx = display.lastIndexOf('@');
                if (atIdx > 0) {
                  const targetProject = display.slice(atIdx + 1);
                  const targetName = display.slice(0, atIdx).split('/')[0].toLowerCase();
                  if (targetProject && targetProject !== this.channel.project) {
                    crossProjectNote = ` [cross-project: ${this.channel.project} → ${targetProject}]`;
                    try {
                      const roster = await this._relayGet('/agents');
                      const otherProjects = [...new Set(
                        roster.agents
                          .filter(a => a.name === targetName && a.project !== targetProject)
                          .map(a => a.project)
                      )];
                      if (otherProjects.length > 0) {
                        ambiguityNote = `\n⚠ Note: "${targetName}" also exists in ${otherProjects.join(', ')}. Confirm intended target.`;
                      }
                    } catch (_) { /* roster fetch failed; skip warning */ }
                  }
                }
                return { content: [{ type: 'text', text: `Sent to ${display || args.to}${crossProjectNote}${statusNote}${ambiguityNote}` }] };
              }
              const online = (result.online || []).map(a => a.display || a.name || a).join(', ') || 'none';
              return { content: [{ type: 'text', text: `${result.error}. Online: ${online}` }] };
            } catch (err) {
              return { content: [{ type: 'text', text: `Cannot reach relay: ${err.message}` }] };
            }
          }
          case 'broadcast': {
            if (!this.channel.active) {
              return { content: [{ type: 'text', text: 'Channel inactive — no AGENT_NAME in CLAUDE.local.md' }] };
            }
            try {
              let targets;
              if (args.to.toLowerCase().trim() === 'all') {
                const result = await this._relayGet('/agents');
                targets = result.agents
                  .filter(a => a.project === this.channel.project && a.id !== this.channel.relayId)
                  .map(a => a.id);
              } else {
                // Resolve bare names against project roster to get relay IDs
                const names = args.to.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                const result = await this._relayGet('/agents');
                const projectAgents = result.agents.filter(a => a.project === this.channel.project && a.id !== this.channel.relayId);
                targets = [];
                const notFound = [];
                for (const name of names) {
                  // Try bare name match within project first
                  const match = projectAgents.find(a => a.name === name);
                  if (match) {
                    targets.push(match.id);
                  } else {
                    // Fall back to raw target (may be a full relay ID or name@project)
                    targets.push(name);
                  }
                }
              }
              if (targets.length === 0) {
                return { content: [{ type: 'text', text: 'No targets found' }] };
              }
              const results = [];
              for (const target of targets) {
                try {
                  const result = await this._relayPost('/send', {
                    from: this.channel.relayId,
                    from_display: this.channel.display,
                    from_path: this.channel.agentPath,
                    to: target,
                    message: args.message
                  });
                  results.push(result.sent ? `✓ ${result.to_display || target}` : `✗ ${target}: ${result.error}`);
                } catch (err) {
                  results.push(`✗ ${target}: ${err.message}`);
                }
              }
              if (args.status) {
                this._relayPost('/status', { from: this.channel.relayId, status: args.status }).catch(() => {});
              }
              const statusNote = args.status ? ` | status → ${args.status}` : '';
              return { content: [{ type: 'text', text: `Broadcast (${results.length}):\n${results.join('\n')}${statusNote}` }] };
            } catch (err) {
              return { content: [{ type: 'text', text: `Cannot reach relay: ${err.message}` }] };
            }
          }
          case 'roster': {
            try {
              const result = await this._relayGet('/agents');
              let agents = result.agents;
              if (!args.all && this.channel.active) {
                agents = agents.filter(a => a.project === this.channel.project);
              }
              if (agents.length === 0) {
                return { content: [{ type: 'text', text: args.all ? 'No agents connected' : `No agents in project "${this.channel.project}". Use roster(all=true) to see all.` }] };
              }
              const relativeTime = (ts) => {
                if (!ts) return 'never';
                const sec = Math.floor((Date.now() - ts) / 1000);
                if (sec < 60) return `${sec}s ago`;
                if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
                return `${Math.floor(sec / 3600)}h ago`;
              };
              const lines = agents.map(a => {
                const jobTag = a.job ? ` [${a.job}]` : '';
                const statusTag = a.status && a.status !== 'idle' ? ` {${a.status}}` : '';
                const lastActive = a.lastSentAt ? ` (active ${relativeTime(a.lastSentAt)})` : ` (silent since join)`;
                return `- ${a.display || a.name}${jobTag}${statusTag}${lastActive}`;
              });
              const header = args.all ? 'All online agents' : `Agents in ${this.channel.project}`;
              return { content: [{ type: 'text', text: `${header}:\n${lines.join('\n')}` }] };
            } catch (err) {
              return { content: [{ type: 'text', text: `Cannot reach relay: ${err.message}` }] };
            }
          }
          case 'history': {
            if (!this.channel.active) {
              return { content: [{ type: 'text', text: 'Channel inactive — no AGENT_NAME in CLAUDE.local.md' }] };
            }
            try {
              const last = Math.min(args.last || 20, 50);
              const project = encodeURIComponent(this.channel.project);
              const result = await this._relayGet(`/history/${project}?last=${last}`);
              if (!result.messages || result.messages.length === 0) {
                return { content: [{ type: 'text', text: 'No message history available' }] };
              }
              const lines = result.messages.map(m => {
                const time = new Date(m.timestamp).toLocaleTimeString();
                return `[${time}] ${m.from} → ${m.to}: ${m.message}`;
              });
              return { content: [{ type: 'text', text: `Recent messages (${result.messages.length}):\n${lines.join('\n')}` }] };
            } catch (err) {
              return { content: [{ type: 'text', text: `Cannot reach relay: ${err.message}` }] };
            }
          }
          default:
            // Check custom tools from tools.json
            const customTool = this.customTools.find(t => t.name === name);
            if (customTool) {
              return await this.handleCustomTool(customTool, args);
            }
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async run() {
    logLifecycle('run() starting — awaiting init...');
    await this.initPromise;
    logLifecycle('init complete — connecting transport...');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logLifecycle('transport connected — ensuring relay daemon...');

    // Start channel relay daemon if not already running
    await this.ensureRelayDaemon();
    logLifecycle('relay daemon checked — connecting SSE...');

    // Connect to relay for channel messaging
    this._connectSSE();
    logLifecycle('run() complete — server live');
  }

  async ensureRelayDaemon() {
    const RELAY_PORT = parseInt(process.env.RELAY_PORT || '7760', 10);

    // Check if relay is already listening
    const alive = await new Promise((resolve) => {
      const req = http.get(`http://localhost:${RELAY_PORT}/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });

    if (alive) {
      console.error(`[Pageant] Channel relay already running on :${RELAY_PORT}`);
      return;
    }

    // Spawn relay as detached daemon
    const relayPath = path.join(__dirname, 'relay.js');
    const child = spawn('node', [relayPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, RELAY_PORT: String(RELAY_PORT) }
    });
    child.unref();
    console.error(`[Pageant] Started channel relay daemon (PID ${child.pid}) on :${RELAY_PORT}`);
  }
}

const CRASH_LOG = path.join(__dirname, 'crash.log');
const LIFECYCLE_LOG = path.join(__dirname, 'lifecycle.log');

function logCrash(label, err) {
  const ts = new Date().toISOString();
  const stack = err instanceof Error ? err.stack : String(err);
  const line = `[${ts}] ${label}: ${stack}\n`;
  console.error(`[Pageant] ${label}:`, err);
  try { appendFileSync(CRASH_LOG, line); } catch (_) {}
}

function logLifecycle(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  console.error(`[Pageant] ${msg}`);
  try { appendFileSync(LIFECYCLE_LOG, line); } catch (_) {}
}

logLifecycle(`PROCESS START pid=${process.pid} cwd=${process.cwd()} argv=${process.argv.join(' ')}`);

// --- Lockfile: prevent double-spawn from Claude Code ---
// Uses O_EXCL (wx flag) for atomic create-or-fail — no race window.
const lockDir = path.join(__dirname, '.locks');
try { mkdirSync(lockDir, { recursive: true }); } catch(_) {}
const lockHash = createHash('md5').update(process.cwd()).digest('hex').slice(0, 12);
const lockFile = path.join(lockDir, `pageant-${lockHash}.lock`);

function acquireLock() {
  // Clean stale locks first (>30s old = dead process didn't clean up)
  try {
    const stat = statSync(lockFile);
    const age = Date.now() - stat.mtimeMs;
    if (age > 30000) {
      logLifecycle(`Stale lock found (${Math.round(age/1000)}s old), removing`);
      unlinkSync(lockFile);
    }
  } catch(_) {}

  // Atomic create — fails if file already exists
  try {
    const fd = openSync(lockFile, 'wx');
    writeSync(fd, `${process.pid}:${Date.now()}`);
    closeSync(fd);
    return true;
  } catch(err) {
    if (err.code === 'EEXIST') return false;
    // Some other error — proceed anyway
    return true;
  }
}

function releaseLock() {
  try {
    const content = readFileSync(lockFile, 'utf8').trim();
    if (content.startsWith(`${process.pid}:`)) {
      unlinkSync(lockFile);
    }
  } catch(_) {}
}

// Touch the lock periodically so stale detection works
let lockInterval = null;
function startLockHeartbeat() {
  lockInterval = setInterval(() => {
    try { writeFileSync(lockFile, `${process.pid}:${Date.now()}`); } catch(_) {}
  }, 10000);
  lockInterval.unref();
}

if (!acquireLock()) {
  logLifecycle(`DUPLICATE DETECTED — lock exists (EEXIST). Exiting immediately.`);
  process.exit(0);
}

logLifecycle(`Lock acquired: ${lockFile}`);
startLockHeartbeat();

process.on('unhandledRejection', (reason) => {
  logCrash('UNHANDLED REJECTION', reason);
});
process.on('uncaughtException', (err) => {
  logCrash('UNCAUGHT EXCEPTION', err);
});
process.on('exit', (code) => {
  releaseLock();
  logLifecycle(`PROCESS EXIT code=${code} pid=${process.pid}`);
});
process.on('SIGTERM', () => {
  logLifecycle('SIGTERM received');
});
process.on('SIGHUP', () => {
  logLifecycle('SIGHUP received');
});
process.on('SIGINT', () => {
  logLifecycle('SIGINT received');
});
let stdinDead = false;
process.stdin.on('end', () => {
  stdinDead = true;
  logLifecycle('STDIN END — Claude Code closed the pipe');
  // Give a moment for any pending writes, then exit cleanly
  setTimeout(() => {
    logLifecycle('Exiting after stdin end');
    process.exit(0);
  }, 500);
});
process.stdin.on('close', () => {
  logLifecycle('STDIN CLOSE');
});
process.stdin.on('error', (err) => {
  logLifecycle(`STDIN ERROR: ${err.message}`);
});
process.stdout.on('error', (err) => {
  logLifecycle(`STDOUT ERROR: ${err.message}`);
});

const server = new PersonaServer();
server.run().catch((err) => {
  logCrash('RUN FAILED', err);
});