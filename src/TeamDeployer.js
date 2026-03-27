import fs from 'fs/promises';
import path from 'path';
import { PersonaManager } from './PersonaManager.js';

export class TeamDeployer {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.templatesDir = path.join(baseDir, '..', 'team-templates');
  }

  async listTemplates() {
    try {
      const entries = await fs.readdir(this.templatesDir, { withFileTypes: true });
      const templates = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      return templates;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async validateTemplate(templatePath) {
    const errors = [];

    // Check template directory exists
    try {
      await fs.access(templatePath);
    } catch {
      errors.push(`Template directory not found: ${templatePath}`);
      return { valid: false, errors };
    }

    // Find agent directories (those with CLAUDE.local.md)
    const entries = await fs.readdir(templatePath, { withFileTypes: true });
    const agentDirs = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const claudeLocalPath = path.join(templatePath, entry.name, 'CLAUDE.local.md');
        try {
          await fs.access(claudeLocalPath);
          agentDirs.push(entry.name);
        } catch {
          // Not an agent directory, skip
        }
      }
    }

    if (agentDirs.length === 0) {
      errors.push('No agent directories found (directories with CLAUDE.local.md)');
    }

    // Validate each agent has required files
    for (const agentName of agentDirs) {
      const agentPath = path.join(templatePath, agentName);

      // Check for .mcp.json
      try {
        await fs.access(path.join(agentPath, '.mcp.json'));
      } catch {
        errors.push(`Agent '${agentName}' missing .mcp.json`);
      }

      // Check for CLAUDE.local.md
      try {
        await fs.access(path.join(agentPath, 'CLAUDE.local.md'));
      } catch {
        errors.push(`Agent '${agentName}' missing CLAUDE.local.md`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      agentCount: agentDirs.length,
      agents: agentDirs
    };
  }

  async deployTeam(templateName, projectPath) {
    const results = [];

    // 1. Validate template
    const templatePath = path.join(this.templatesDir, templateName);
    const validation = await this.validateTemplate(templatePath);

    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        results
      };
    }

    results.push(`Found template '${templateName}' with ${validation.agentCount} agents: ${validation.agents.join(', ')}`);

    // 2. Create .pageant directory in project
    const pageantDir = path.join(projectPath, '.pageant');
    await fs.mkdir(pageantDir, { recursive: true });
    results.push(`Created .pageant directory: ${pageantDir}`);

    // 3. Copy all agent directories
    for (const agentName of validation.agents) {
      const sourceAgent = path.join(templatePath, agentName);
      const destAgent = path.join(pageantDir, agentName);

      await this.copyDirectory(sourceAgent, destAgent);
      results.push(`Copied agent: ${agentName}`);
    }

    // 4. Copy team CLAUDE.md if it exists
    const teamClaudePath = path.join(templatePath, 'CLAUDE.md');
    try {
      await fs.access(teamClaudePath);
      await fs.copyFile(teamClaudePath, path.join(pageantDir, 'CLAUDE.md'));
      results.push('Copied team CLAUDE.md');
    } catch {
      // Team CLAUDE.md is optional
    }

    // 5. Compile each agent's persona (generates IDs)
    results.push('Compiling agent personas...');
    const personaManager = new PersonaManager(this.baseDir);

    for (const agentName of validation.agents) {
      const agentPath = path.join(pageantDir, agentName);

      try {
        // Initialize PersonaManager for this agent's directory
        const agentManager = new PersonaManager(this.baseDir, { initialCwd: agentPath });
        await agentManager.projectDirNameInitialized;
        await agentManager.compilePersona(agentPath);
        results.push(`  ✓ Compiled ${agentName} persona with new ID`);
      } catch (error) {
        results.push(`  ✗ Failed to compile ${agentName}: ${error.message}`);
      }
    }

    // 6. Add .pageant to .gitignore
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
      results.push(`Could not update .gitignore: ${e.message}`);
    }

    return {
      success: true,
      agentCount: validation.agentCount,
      agents: validation.agents,
      deployPath: pageantDir,
      results
    };
  }

  async copyDirectory(source, dest) {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }
}
