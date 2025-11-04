import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class AgentBuilder {
  constructor(baseDir) {
    this.baseDir = baseDir;
    // Use HOME for both macOS/Linux and USERPROFILE for Windows
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    this.claudeConfigPath = path.join(homeDir, '.claude.json');
  }

  async buildAgent(agentName, options = {}) {
    const results = [];

    try {
      // Like, totally validate the agent name
      if (!agentName || !agentName.match(/^[a-zA-Z0-9_-]+$/)) {
        throw new Error('Agent name must be alphanumeric with underscores or hyphens');
      }

      // Create agent in project's .pageant directory
      const projectPath = process.cwd();
      const projectName = path.basename(projectPath);
      const pageantDir = path.join(projectPath, '.pageant');
      const agentPath = path.join(pageantDir, agentName);

      // 1. Create .pageant directory structure
      results.push(`Creating agent in .pageant directory: ${agentPath}`);
      await fs.mkdir(agentPath, { recursive: true });

      // Create or update .pageant/CLAUDE.md if it doesn't exist
      const pageantClaudePath = path.join(pageantDir, 'CLAUDE.md');
      const pageantClaudeExists = await fs.access(pageantClaudePath).then(() => true).catch(() => false);

      if (!pageantClaudeExists) {
        const pageantClaudeContent = `# Multi-Agent Configuration for ${projectName}

## Overview
This directory contains specialized agents for the ${projectName} project.
Each subdirectory is an independent agent with its own persona and instructions.

## Agent Organization
Agents in .pageant/ work as a team on the parent project.
They inherit the main project context and add specialized capabilities.

## Main Project
The parent project is at: ../
`;
        await fs.writeFile(pageantClaudePath, pageantClaudeContent);
        results.push('Created .pageant/CLAUDE.md');
      }

      // Add .pageant to .gitignore if not already there
      const gitignorePath = path.join(projectPath, '.gitignore');
      try {
        const gitignoreExists = await fs.access(gitignorePath).then(() => true).catch(() => false);
        if (gitignoreExists) {
          const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
          if (!gitignoreContent.includes('.pageant')) {
            await fs.appendFile(gitignorePath, '\n# Agent directories (auto-added by mcp_pageant)\n.pageant/\n');
            results.push('Added .pageant to .gitignore');
          }
        } else {
          await fs.writeFile(gitignorePath, '# Agent directories (auto-added by mcp_pageant)\n.pageant/\n');
          results.push('Created .gitignore with .pageant');
        }
      } catch (e) {
        results.push('Could not update .gitignore: ' + e.message);
      }

      // 2. Create .mcp.json in agent directory (project-scoped MCPs)
      const coreMcps = options.mcps || ['pageant'];
      const mcpConfig = {
        mcpServers: {}
      };

      // Define MCP servers with absolute paths
      const mcpDefinitions = {
        pageant: {
          type: "stdio",
          command: "bun",
          args: [path.join(this.baseDir, "server.js")],
          env: {}
        },
        lace: {
          type: "stdio",
          command: "bun",
          args: [path.join(this.baseDir, "..", "mcp_lace", "server.js")],
          env: {}
        },
        selfie: {
          type: "stdio",
          command: "bun",
          args: [path.join(this.baseDir, "..", "selfie", "server.js")],
          env: {}
        },
        utils: {
          type: "stdio",
          command: "bun",
          args: [path.join(this.baseDir, "..", "mcp_utils", "server.js")],
          env: {}
        }
      };

      // Add requested MCPs
      for (const mcpName of coreMcps) {
        if (mcpDefinitions[mcpName]) {
          mcpConfig.mcpServers[mcpName] = mcpDefinitions[mcpName];
          results.push(`Added MCP to agent: ${mcpName}`);
        } else {
          results.push(`Warning: Unknown MCP '${mcpName}', skipped`);
        }
      }

      // Write .mcp.json to agent directory
      const mcpJsonPath = path.join(agentPath, '.mcp.json');
      await fs.writeFile(
        mcpJsonPath,
        JSON.stringify(mcpConfig, null, 2)
      );
      results.push(`Created .mcp.json at: ${mcpJsonPath}`);

      // 5. Create agent-specific persona
      const personaPlanDir = path.join(
        this.baseDir,
        'plans',
        this.getProjectDirName(agentPath)
      );
      await fs.mkdir(personaPlanDir, { recursive: true });

      // Create light persona template
      const lightPersona = this.getLightPersonaTemplate(agentName);
      const templatePath = path.join(personaPlanDir, 'template.md');
      await fs.writeFile(templatePath, lightPersona);
      results.push(`Created persona template: ${templatePath}`);

      // 6. Create CLAUDE.md for the agent
      const mainProjectClaudePath = path.join(projectPath, 'CLAUDE.md');
      const pageantContextPath = path.join(pageantDir, 'CLAUDE.md');
      const mainRelativePath = path.relative(agentPath, mainProjectClaudePath).split(path.sep).join('/');
      const pageantRelativePath = path.relative(agentPath, pageantContextPath).split(path.sep).join('/');

      const claudeMdContent = `# Agent: ${agentName}

You are a specialized agent working on the ${projectName} project.

## Multi-Agent Context
@${pageantRelativePath}

## Main Project Instructions
@${mainRelativePath}

## Agent-Specific Role
This agent specializes in ${agentName} tasks as part of the ${projectName} team.

## Working Directory
- Your agent directory: .pageant/${agentName}
- Main project: ../../
- Other agents: ../ (sibling directories in .pageant)
`;

      await fs.writeFile(
        path.join(agentPath, 'CLAUDE.md'),
        claudeMdContent
      );
      results.push('Created CLAUDE.md');

      // 7. Create CLAUDE.local.md pointing to persona
      const relativePersonaPath = path.relative(
        agentPath,
        path.join(personaPlanDir, 'persona.md')
      ).split(path.sep).join('/');

      await fs.writeFile(
        path.join(agentPath, 'CLAUDE.local.md'),
        `@${relativePersonaPath}`
      );
      results.push('Created CLAUDE.local.md');

      // 8. Compile the persona
      await this.compilePersona(personaPlanDir, agentPath);
      results.push('Compiled persona');

      return {
        success: true,
        agentPath,
        results
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  getLightPersonaTemplate(agentName) {
    // Template paths are relative to the plans directory where template.md lives
    // PersonaManager will resolve these from its baseDir (repo root)
    return `# ${agentName} Agent Configuration

@./manifest/001_main/agent.md

@./manifest/040_output/02_narration/tactile_digital_world.md

`;
  }

  getProjectDirName(projectPath) {
    // Must match PersonaManager.generatePathId() - lowercase for case-insensitive consistency
    const isWindows = process.platform === 'win32';
    let normalizedPath = projectPath.toLowerCase();

    if (isWindows) {
      // Windows: C:\Users\name -> c--users--name
      normalizedPath = normalizedPath
        .replace(/^([a-z]):/, '$1') // Remove colon from drive letter
        .replace(/\\/g, path.sep); // Normalize backslashes
    } else {
      // Unix: /Users/name -> users--name
      // Remove leading slash as it creates empty string in split
      if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.substring(1);
      }
    }

    const pathParts = normalizedPath
      .split(path.sep)
      .filter(part => part.length > 0);

    return pathParts.join('--');
  }

  async compilePersona(personaPlanDir, agentPath) {
    // Like, use the PersonaManager to properly compile!
    const { PersonaManager } = await import('./PersonaManager.js');
    const manager = new PersonaManager(this.baseDir);

    // Set the project path for proper compilation
    const originalCwd = process.cwd();
    process.chdir(agentPath);

    try {
      await manager.compilePersona(agentPath);
    } finally {
      process.chdir(originalCwd);
    }
  }
}