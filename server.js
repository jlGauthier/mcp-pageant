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
    this.loadVariableNames();
    this.loadToolHints();
    this.loadManifestStructure();
    this.loadCustomTools();
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

                // Check for organizational dirs (only in 070_look/4_attire for now)
                if (section === '070_look' && item === '4_attire') {
                  const orgDirs = await fs.readdir(itemPath);
                  for (const orgDir of orgDirs) {
                    const orgPath = path.join(itemPath, orgDir);
                    const orgStat = await fs.stat(orgPath);
                    if (orgStat.isDirectory()) {
                      structure[section][item].push(orgDir);
                    }
                  }
                }
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
    return `Optional subsection. Common: ${subList}. Required for 040_output (01_dialect, 02_narration, 03_tone) and 070_look (1_body, 3_hair, 4_attire, 5_style, 6_place)`;
  }

  getFilenameDescription() {
    return 'Filename (with optional directory for organizational purposes). For 070_look/4_attire, prefix with: casual/, fancy/, lingerie/, office/, etc. Always use .md extension';
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
            description: 'Add a persona component to template. SLOT sections (001_main, 030_jobs, 040_output): adding removes previous file - only ONE active. LIST sections (010_tech_list, 020_pattern_list): adding accumulates - MULTIPLE active. Use `inspect` to see current composition.' + this.toolHintsText,
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: 'Section name (fuzzy matched, e.g., "main", "tech", "pattern"). SLOT sections replace existing, LIST sections accumulate.'
                },
                subsection: {
                  type: 'string',
                  description: 'Optional subsection (fuzzy matched, e.g., "tone", "body", "attire")'
                },
                partial: {
                  type: 'string',
                  description: 'Partial filename to match, or "random" for random selection'
                }
              },
              required: ['section', 'partial']
            }
          },
          {
            name: 'remove',
            description: 'Remove persona components from template. For LIST sections: removes specific files. For SLOT sections: removes entire slot. Use `inspect` to see what\'s currently active.',
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: 'Section name to remove from (fuzzy matched)'
                },
                subsection: {
                  type: 'string',
                  description: 'Optional subsection to remove (fuzzy matched)'
                },
                partial: {
                  type: 'string',
                  description: 'Optional partial filename to remove specific file from LIST sections'
                }
              },
              required: ['section']
            }
          },
          {
            name: 'list',
            description: 'List available persona components in manifest. Shows all files you can add to your template. SLOT sections (main, jobs, output) = mutually exclusive choices. LIST sections (tech_list, pattern_list) = can add multiple.',
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: 'Optional section name to filter results (fuzzy matched)'
                },
                subsection: {
                  type: 'string',
                  description: 'Optional subsection name to filter (fuzzy matched, requires section)'
                }
              },
              required: []
            }
          },
          {
            name: 'set_var',
            description: 'Set a persona variable value for the current project',
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
            description: 'Build a new agent with directory structure and MCPs',
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
          {
            name: 'create',
            description: 'Create a new persona section with guided content',
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: this.getSectionDescription()
                },
                subsection: {
                  type: 'string',
                  description: this.getSubsectionDescription()
                },
                filename: {
                  type: 'string',
                  description: this.getFilenameDescription()
                },
                secondperson_prompt_from_system_to_assistant: {
                  type: 'string',
                  description: 'Write persona content in second person ("You are...", "You must...", "You always..."). Length: 200 chars for quick reminders, 700 chars for complex instructions, 1k-6k chars for primary roles (main personality, front-end engineer, etc). Be concise.'
                }
              },
              required: ['section', 'filename', 'secondperson_prompt_from_system_to_assistant']
            }
          },
          ...this.customTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'add':
            return await this.manager.handleAdd(args);
          case 'remove':
            return await this.manager.handleRemove(args);
          case 'list':
            return await this.manager.handleList(args);
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
          case 'create':
            return await this.manager.handleCreate(args);
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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Pageant server running (enhanced version with build_agent)');
  }
}

const server = new PersonaServer();
server.run().catch(console.error);