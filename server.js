#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { PersonaManager } from './src/PersonaManager.js';
import { WebEditor } from './src/WebEditor.js';
import { AgentBuilder } from './src/AgentBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PersonaServer {
  constructor() {
    this.manager = new PersonaManager(__dirname);
    this.webEditor = new WebEditor(this.manager);
    this.agentBuilder = new AgentBuilder(__dirname);
    this.variableNames = [];
    this.loadVariableNames();
    this.server = new Server(
      {
        name: 'mcp-pageant',
        version: '2.0.0',
      },
      {
        capabilities: {
          prompts: {},
          tools: {}
        },
      }
    );

    this.setupToolHandlers();
    this.setupPromptHandlers();
    this.setupErrorHandling();
  }

  async loadVariableNames() {
    try {
      const defaultVarsPath = path.join(__dirname, 'plans', 'default_vars.txt');
      const content = await fs.readFile(defaultVarsPath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key] = trimmed.split('=');
          if (key) {
            this.variableNames.push(key.trim());
          }
        }
      }
    } catch (error) {
      console.error('Warning: Could not load variable names from default_vars.txt');
      this.variableNames = ['API_KEY', 'DEBUG_MODE', 'LOG_LEVEL', 'ENV'];
    }
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
            description: 'Add a persona segment to the template',
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: 'Section name (e.g., main, tech, config)'
                },
                subsection: {
                  type: 'string',
                  description: 'Optional subsection (e.g., database, services, auth)'
                },
                partial: {
                  type: 'string',
                  description: 'Partial filename to match'
                }
              },
              required: ['section', 'partial']
            }
          },
          {
            name: 'remove',
            description: 'Remove a persona section from the template',
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: 'Section name to remove'
                },
                subsection: {
                  type: 'string',
                  description: 'Optional subsection to remove'
                },
                partial: {
                  type: 'string',
                  description: 'Optional partial filename to remove specific file'
                }
              },
              required: ['section']
            }
          },
          {
            name: 'list',
            description: 'List available persona files in manifest',
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: 'Optional section name to filter results'
                },
                subsection: {
                  type: 'string',
                  description: 'Optional subsection name (requires section)'
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
          }
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