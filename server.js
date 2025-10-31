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
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import { PersonaManager } from './src/PersonaManager.js';
import { WebEditor } from './src/WebEditor.js';
import { AgentBuilder } from './src/AgentBuilder.js';

class PersonaServer {
  constructor() {
    console.error('[DEBUG] MANIFEST_DIRS env:', process.env.MANIFEST_DIRS);
    this.manager = new PersonaManager(__dirname);
    console.error('[DEBUG] PersonaManager manifest dirs:', this.manager.multiManifest.getManifestDirs());
    this.webEditor = new WebEditor(this.manager);
    this.agentBuilder = new AgentBuilder(__dirname);

    this.variableNames = [];
    this.toolHints = {};
    this.manifestStructure = {};
    this.customTools = [];
    this.slotEnum = [];
    this.talentDescriptions = [];

    this.server = new Server(
      {
        name: 'mcp-pageant',
        version: '2.0.0',
      },
      {
        capabilities: {
          prompts: {},
          tools: {},
          resources: {}
        },
      }
    );

    this.initPromise = this.initialize();
  }

  async initialize() {
    await this.loadVariableNames();
    await this.loadToolHints();
    await this.loadManifestStructure();
    await this.loadCustomTools();
    await this.loadSlotEnum();
    await this.loadTalentDescriptions();

    this.setupToolHandlers();
    this.setupPromptHandlers();
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

    // Then load from plans directory
    try {
      const defaultVarsPath = path.join(__dirname, 'plans', 'default_vars.txt');
      const content = await fs.readFile(defaultVarsPath, 'utf8');
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
      // Plans default_vars.txt is optional
    }

    this.variableNames = Array.from(varSet);

    if (this.variableNames.length === 0) {
      this.variableNames = ['API_KEY', 'DEBUG_MODE', 'LOG_LEVEL', 'ENV'];
    }
  }

  getSectionDescription() {
    const sections = Object.keys(this.manifestStructure).sort();
    const sectionList = sections.map(s => {
      const name = s.replace(/^\d{3}_/, '');
      return `${s} (${name})`;
    }).join(', ');
    return `Section name. Available: ${sectionList}`;
  }

  getSubsectionDescription() {
    const subsections = new Set();
    for (const section of Object.values(this.manifestStructure)) {
      for (const sub of Object.keys(section)) {
        subsections.add(sub);
      }
    }
    const subList = Array.from(subsections).sort().join(', ');
    return `Optional subsection. Common: ${subList}. Required for 040_output (01_dialect, 02_narration, 03_tone)`;
  }

  getFilenameDescription() {
    return 'Filename (with optional directory for organizational purposes). Always use .md extension';
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
            const sectionName = section.replace(/^\d{3}[_-]/, '');

            // Always add the section itself (for root-level files)
            slots.push(sectionName);

            // Check for numbered subsections and add them too
            const items = await fs.readdir(sectionPath);

            for (const item of items) {
              const itemPath = path.join(sectionPath, item);
              const itemStat = await fs.stat(itemPath);

              if (itemStat.isDirectory() && item.match(/^\d+[_-]/)) {
                const subName = item.replace(/^\d+[_-]/, '');
                slots.push(`${sectionName}/${subName}`);
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

  async handleCustomTool(tool, args) {
    const handler = tool.handler;

    if (handler.type === 'add') {
      // Custom add handler - forwards to PersonaManager.handleAdd with modified args
      const addArgs = {
        section: handler.section,
        subsection: handler.useSubsectionParam ? args.subsection : handler.subsection,
        partial: args.partial
      };
      return await this.manager.handleAdd(addArgs);
    } else if (handler.type === 'inspect_template') {
      // Inspect handler - shows current template composition
      return await this.manager.handleInspect();
    } else if (handler.type === 'thrift') {
      // Thrift handler - inline text override
      return await this.manager.handleThrift(args);
    } else if (handler.type === 'talent') {
      // Talent handler - temporary component with timer
      return await this.manager.handleTalent(args);
    }

    throw new Error(`Unknown custom tool handler type: ${handler.type}`);
  }

  setupResourceHandlers() {
    // Handle list resources request
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'pageant://cross-agent/messages',
            name: 'Cross-Agent Messages',
            mimeType: 'text/markdown',
            description: 'Shared messages between all agent instances (rolling 50 messages)'
          }
        ]
      };
    });

    // Handle read resource request
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'pageant://cross-agent/messages') {
        const content = await this.crossAgentMessages.getMessagesAsMarkdown();
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: content
            }
          ]
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'add',
            description: `Adds Pageant persona components to your system context, modifying who you are.

Pageant defines your identity through composable markdown components organized in manifest directories. Components in the same slot replace each other. Your compiled template is written to ${process.cwd()}/CLAUDE.local.md

Usage notes:
- Specify \`partial\` to match a component filename (e.g., "athletic" matches "athletic_fit")
- Use \`partial=random\` to add a random component from the specified slot
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
                  description: 'Partial filename to match, or "random" for random selection'
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
- Slot keys indicate replacement behavior: components with the same slot key replace each other`,
            inputSchema: {
              type: 'object',
              properties: {
                slot: {
                  type: 'string',
                  enum: [...this.slotEnum, ''],
                  description: 'Optional slot to filter results. Leave empty for all.'
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
                }
              },
              required: ['variable', 'value']
            }
          },
          {
            name: 'web_editor',
            description: 'Open web-based persona editor in browser',
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['open', 'close'],
                  description: 'Open or close the web editor'
                }
              },
              required: []
            }
          },
          {
            name: 'build_agent',
            description: `Creates a new Pageant agent subdirectory within your current project for parallel work.

Usage notes:
- Generates agent directory with manifest, template, and configuration files
- Allows multiple agents with different personas to work on the same project
- Optionally installs specified MCP servers for the new agent
- Use this tool to add specialized agents (e.g., QA agent, docs agent) alongside your primary agent`,
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Name for the new agent (alphanumeric with underscores or hyphens)'
                },
                mcps: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of MCPs to install (default: pageant)'
                }
              },
              required: ['name']
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
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'add': {
            const { section, subsection } = this.slotToSectionSubsection(args.slot);
            return await this.manager.handleAdd({ section, subsection, partial: args.partial });
          }
          case 'remove': {
            const { section, subsection } = this.slotToSectionSubsection(args.slot);
            return await this.manager.handleRemove({ section, subsection, partial: args.partial });
          }
          case 'list': {
            if (args.slot && args.slot !== '') {
              const { section, subsection } = this.slotToSectionSubsection(args.slot);
              return await this.manager.handleList({ section, subsection });
            }
            return await this.manager.handleList({});
          }
          case 'set_var':
            return await this.manager.handleSetVar(args);
          case 'web_editor':
            const action = args.action || 'open';
            if (action === 'open') {
              const result = await this.webEditor.start();
              return {
                content: [
                  {
                    type: 'text',
                    text: result.message,
                  },
                ],
              };
            } else if (action === 'close') {
              const result = await this.webEditor.stop();
              return {
                content: [
                  {
                    type: 'text',
                    text: result.message,
                  },
                ],
              };
            }
            break;
          case 'build_agent':
            const buildResult = await this.agentBuilder.buildAgent(args.name, {
              mcps: args.mcps || ['pageant']
            });
            return {
              content: [
                {
                  type: 'text',
                  text: buildResult.success
                    ? `Agent '${args.name}' created successfully!\n\nPath: ${buildResult.agentPath}\n\nSteps completed:\n${buildResult.results.join('\n')}`
                    : `Failed to create agent: ${buildResult.error}\n\nPartial progress:\n${buildResult.results.join('\n')}`,
                },
              ],
            };
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

  setupPromptHandlers() {
    // Handle prompt listing
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'build',
            description: 'Build a new agent with the specified name',
            arguments: [
              {
                name: 'agent_name',
                description: 'Name for the new agent',
                required: true
              }
            ]
          },
          {
            name: 'browser',
            description: 'Open the persona web editor in browser',
            arguments: []
          }
        ]
      };
    });

    // Handle prompt execution
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'build':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Build a new agent named "${args?.agent_name}" using the mcp__persona__build_agent tool`
                }
              }
            ]
          };

        case 'browser':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Open the persona web editor using the mcp__persona__web_editor tool with action "open"'
                }
              }
            ]
          };

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });
  }

  async run() {
    await this.initPromise;
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Pageant server running (enhanced version with build_agent)');
  }
}

const server = new PersonaServer();
server.run().catch(console.error);