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

  async detectTechStack(projectPath) {
    const stack = {
      frontend: null,
      backend: null,
      database: null,
      frameworks: []
    };

    // Detect frontend from package.json
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps.quasar) {
        stack.frontend = { framework: 'Vue/Quasar', version: deps.quasar };
        stack.frameworks.push(`Quasar ${deps.quasar}`);
      } else if (deps.react) {
        stack.frontend = { framework: 'React', version: deps.react };
        stack.frameworks.push(`React ${deps.react}`);
      } else if (deps.vue) {
        stack.frontend = { framework: 'Vue', version: deps.vue };
        stack.frameworks.push(`Vue ${deps.vue}`);
      }

      // Detect other common frameworks
      if (deps['@tanstack/router'] || deps['@tanstack/react-router']) {
        stack.frameworks.push(`TanStack Router ${deps['@tanstack/router'] || deps['@tanstack/react-router']}`);
      }
      if (deps.axios) {
        stack.frameworks.push(`Axios ${deps.axios}`);
      }
      if (deps['@mui/material']) {
        stack.frameworks.push(`Material UI ${deps['@mui/material']}`);
      }
    } catch (e) {
      // No package.json or parse error
    }

    // Detect backend from pom.xml
    try {
      const pomPath = path.join(projectPath, 'pom.xml');
      const pomContent = await fs.readFile(pomPath, 'utf8');

      // Extract Spring Boot version
      const springBootMatch = pomContent.match(/<artifactId>spring-boot-starter.*?<\/artifactId>[\s\S]*?<version>(.*?)<\/version>/);
      if (springBootMatch) {
        stack.backend = { framework: 'Spring Boot', version: springBootMatch[1] };
        stack.frameworks.push(`Spring Boot ${springBootMatch[1]}`);
      }

      // Extract Javalin version
      const javalinMatch = pomContent.match(/<artifactId>javalin<\/artifactId>[\s\S]*?<version>(.*?)<\/version>/);
      if (javalinMatch) {
        stack.backend = { framework: 'Javalin', version: javalinMatch[1] };
        stack.frameworks.push(`Javalin ${javalinMatch[1]}`);
      }

      // Extract Java version
      const javaMatch = pomContent.match(/<maven\.compiler\.source>(.*?)<\/maven\.compiler\.source>/);
      if (javaMatch) {
        stack.frameworks.push(`Java ${javaMatch[1]}`);
      }
    } catch (e) {
      // No pom.xml or parse error
    }

    return stack;
  }

  async extractBusinessDomain(projectPath) {
    const domain = {
      description: null,
      entities: [],
      repos: []
    };

    // Try to read root CLAUDE.md for business context
    try {
      const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
      const claudeMdContent = await fs.readFile(claudeMdPath, 'utf8');

      // Extract first paragraph as description
      const lines = claudeMdContent.split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (line.startsWith('#')) continue;
        if (line.length > 20) {
          domain.description = line;
          break;
        }
      }

      // Look for entity mentions (common patterns)
      const entityPatterns = /(?:User|Account|Customer|Order|Product|Invoice|Payment|Transaction|Team|Project|Task|Comment|Post|Message)/g;
      const matches = claudeMdContent.match(entityPatterns);
      if (matches) {
        domain.entities = [...new Set(matches)];
      }
    } catch (e) {
      // No CLAUDE.md
    }

    return domain;
  }

  async buildAgent(agentName, options = {}) {
    const results = [];

    try {
      // Like, totally validate the agent name
      if (!agentName || !agentName.match(/^[a-zA-Z0-9_-]+$/)) {
        throw new Error('Agent name must be alphanumeric with underscores or hyphens');
      }

      // Create agent in project's .pageant directory
      if (!options.projectPath) throw new Error('projectPath is required');
      const projectPath = options.projectPath;
      const projectName = path.basename(projectPath);
      const pageantDir = path.join(projectPath, '.pageant');
      const agentPath = path.join(pageantDir, agentName);

      // Discover tech stack and business domain
      results.push('Discovering tech stack...');
      const techStack = await this.detectTechStack(projectPath);
      results.push('Extracting business domain...');
      const businessDomain = await this.extractBusinessDomain(projectPath);

      // 1. Create .pageant directory structure
      results.push(`Creating agent in .pageant directory: ${agentPath}`);
      await fs.mkdir(agentPath, { recursive: true });

      // Create or update .pageant/CLAUDE.md if it doesn't exist
      const pageantClaudePath = path.join(pageantDir, 'CLAUDE.md');
      const pageantClaudeExists = await fs.access(pageantClaudePath).then(() => true).catch(() => false);

      if (!pageantClaudeExists) {
        const pageantClaudeContent = `# Multi-Agent Team for ${projectName}

You are an agent on a team. The root project is at \`../\`

Read \`/CLAUDE.md\` for business domain and repository structure.

## The Team

**${agentName}** - \`.pageant/${agentName}\` - [Agent role - customize this]
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

      // 2. Create .claude/settings.local.json with permissions
      const claudeSettingsDir = path.join(agentPath, '.claude');
      await fs.mkdir(claudeSettingsDir, { recursive: true });
      const settingsLocalPath = path.join(claudeSettingsDir, 'settings.local.json');
      const settingsLocalExists = await fs.access(settingsLocalPath).then(() => true).catch(() => false);

      if (!settingsLocalExists) {
        // Agent CWD is .pageant/<agent>/ — it needs access to the project root
        const projectRelative = path.relative(agentPath, projectPath).split(path.sep).join('/');
        const settingsLocal = {
          permissions: {
            additionalDirectories: [
              projectRelative
            ],
            allow: [],
            deny: [],
            ask: []
          },
          enableAllProjectMcpServers: true
        };
        await fs.writeFile(settingsLocalPath, JSON.stringify(settingsLocal, null, 2) + '\n');
        results.push(`Created .claude/settings.local.json with additionalDirectories: ["${projectRelative}"]`);
      } else {
        results.push('.claude/settings.local.json already exists, skipping');
      }

      // 3. Create .mcp.json in agent directory (project-scoped MCPs)
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

      // Create dynamic persona template based on discovered tech stack and role
      const role = options.role || '';
      const dynamicPersona = await this.buildDynamicPersonaTemplate(agentName, techStack, role);
      const templatePath = path.join(personaPlanDir, 'template.md');
      await fs.writeFile(templatePath, dynamicPersona);
      results.push(`Created persona template with job role and tech components: ${templatePath}`);

      // 6. Create CLAUDE.md for the agent with discovered tech stack
      const mainProjectClaudePath = path.join(projectPath, 'CLAUDE.md');
      const pageantContextPath = path.join(pageantDir, 'CLAUDE.md');
      const mainRelativePath = path.relative(agentPath, mainProjectClaudePath).split(path.sep).join('/');
      const pageantRelativePath = path.relative(agentPath, pageantContextPath).split(path.sep).join('/');

      // Build tech stack section
      let techStackSection = '';
      if (techStack.frameworks.length > 0) {
        techStackSection = `## Tech Stack

${techStack.frameworks.map(f => `- ${f}`).join('\n')}

`;
      }

      // Build domain section
      let domainSection = '';
      if (businessDomain.description) {
        domainSection = `## Business Domain

${businessDomain.description}

`;
      }
      if (businessDomain.entities.length > 0) {
        domainSection += `**Key Entities:** ${businessDomain.entities.join(', ')}\n\n`;
      }

      const claudeMdContent = `# ${agentName}

## Role

[Customize this agent's specific role and responsibilities]

## Your Focus

- [Specific responsibilities]
- [Tech stack focus areas]

${techStackSection}${domainSection}## Multi-Agent Context
@${pageantRelativePath}

## Main Project Instructions
@${mainRelativePath}

## Working Directory
- Your agent directory: .pageant/${agentName}
- Main project: ../../
- Other agents: ../ (sibling directories in .pageant)

## Collaboration

[Other agents this one works with]
`;

      await fs.writeFile(
        path.join(agentPath, 'CLAUDE.md'),
        claudeMdContent
      );
      results.push('Created CLAUDE.md with discovered tech stack');

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

  async buildDynamicPersonaTemplate(agentName, techStack, role) {
    const components = [];

    // Always include base agent personality
    components.push('@./manifest/001_main/agent.md');

    // Scan manifest for job/role components
    const jobsDir = path.join(this.baseDir, 'manifest', '005_jobs');
    try {
      const jobFiles = await fs.readdir(jobsDir);

      // Map common agent names to job roles
      const roleMap = {
        'fs': /full.*stack|fullstack/i,
        'fe': /frontend|front.*end/i,
        'be': /backend|back.*end/i,
        'qc': /qa|quality|test/i,
        'tw': /tech.*writer|technical.*writer|docs|documentation/i,
        'ux': /ux|user.*experience|design/i,
        'devops': /devops|ops|deploy/i,
        'data': /data|analyst/i
      };

      // Try to match agent name or role to job files
      const agentLower = agentName.toLowerCase();
      const roleLower = role ? role.toLowerCase() : '';

      for (const [key, pattern] of Object.entries(roleMap)) {
        if (agentLower.includes(key) || pattern.test(roleLower)) {
          const matchingFile = jobFiles.find(f =>
            pattern.test(f.toLowerCase()) && f.endsWith('.md')
          );

          if (matchingFile) {
            const componentRef = `@./manifest/005_jobs/${matchingFile}`;
            if (!components.includes(componentRef)) {
              components.push(componentRef);
            }
          }
        }
      }
    } catch (e) {
      // Jobs dir doesn't exist
    }

    // Scan manifest for tech-specific components
    const manifestDir = path.join(this.baseDir, 'manifest', '010_tech');

    try {
      const techFiles = await fs.readdir(manifestDir);

      // Map discovered frameworks to manifest files
      const frameworkMap = {
        'react': /react/i,
        'vue': /vue/i,
        'quasar': /quasar/i,
        'spring': /spring/i,
        'javalin': /javalin/i,
        'java': /java(?!lin)/i,
        'node': /node/i,
        'postgres': /postgres/i,
        'mysql': /mysql/i
      };

      for (const framework of techStack.frameworks) {
        const frameworkLower = framework.toLowerCase();

        for (const [key, pattern] of Object.entries(frameworkMap)) {
          if (pattern.test(frameworkLower)) {
            // Find matching file in manifest
            const matchingFile = techFiles.find(f =>
              f.toLowerCase().includes(key) && f.endsWith('.md')
            );

            if (matchingFile) {
              const componentRef = `@./manifest/010_tech/${matchingFile}`;
              if (!components.includes(componentRef)) {
                components.push(componentRef);
              }
            }
          }
        }
      }
    } catch (e) {
      // Manifest tech dir doesn't exist or can't read
    }

    // Add output style
    components.push('@./manifest/040_output/02_narration/tactile_digital_world.md');

    return `# ${agentName} Agent Configuration

${components.join('\n')}

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
    const { PersonaManager } = await import('./PersonaManager.js');
    const manager = new PersonaManager(this.baseDir, { initialCwd: agentPath });
    await manager.projectDirNameInitialized;
    await manager.compilePersona(agentPath);
  }
}