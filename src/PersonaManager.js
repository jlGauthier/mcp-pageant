import fs from 'fs/promises';
import path from 'path';
import { PersonaCore } from './persona-core.js';
export class PersonaManager extends PersonaCore {
  constructor(baseDir) {
    super();
    this.baseDir = baseDir; // .
    this.variables = {};
    this.variablesLoaded = this.loadVariables();
  }
  async loadVariables() {
    this.variables = {};
    
    // First load global defaults
    try {
      const defaultVarsPath = path.join(this.baseDir, 'plans', 'default_vars.txt');
      const defaultContent = await fs.readFile(defaultVarsPath, 'utf8');
      this.parseVariables(defaultContent);
    } catch (error) {
      console.error('Warning: default_vars.txt not found');
    }
    
    // Then override with project-specific vars if they exist
    try {
      const projectVarsPath = path.join(this.baseDir, 'plans', this.getProjectDirName(), 'vars.txt');
      const projectContent = await fs.readFile(projectVarsPath, 'utf8');
      this.parseVariables(projectContent);
    } catch (error) {
      // Project vars are optional, no warning needed
    }
  }
  
  parseVariables(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, value] = trimmed.split('=');
        if (key && value) {
          this.variables[key.trim()] = value.trim();
        }
      }
    }
  }
  substituteVariables(text) {
    let result = text;
    for (const [key, value] of Object.entries(this.variables)) {
      const pattern = new RegExp(`\\$\\{${key}\\}`, 'g');
      result = result.replace(pattern, value);
    }
    return result;
  }
  getProjectDirName() {
    const projectPath = process.cwd();
    const pathParts = projectPath.replace(/^[A-Z]:/, (match) => match[0])
      .split(/[\\\/]/)
      .filter(part => part.length > 0);
    return pathParts.join('--');
  }
  getTemplatePath() {
    return path.join(this.baseDir, 'plans', this.getProjectDirName(), 'template.md');
  }
  getPersonaPath() {
    return path.join(this.baseDir, 'plans', this.getProjectDirName(), 'persona.md');
  }
  async findManifestDir(manifestPath, name) {
    const dirs = await fs.readdir(manifestPath);
    
    for (const dir of dirs) {
      const isList = dir.endsWith('_list');
      
      let dirName = '';
      let dirNumber = 0;
      
      const numMatch = dir.match(/^(\d+)[_-](.+)$/);
      if (numMatch) {
        dirNumber = parseInt(numMatch[1]);
        dirName = numMatch[2].toLowerCase();
      } else {
        dirName = dir.toLowerCase();
      }
      
      if (isList) {
        dirName = dirName.replace(/_list$/, '');
      }
      
      if (dirName === name.toLowerCase()) {
        return { dir, number: dirNumber, isList };
      }
    }
    
    return null;
  }
  async findSubsectionDir(sectionPath, subsection) {
    try {
      const items = await fs.readdir(sectionPath, { withFileTypes: true });
      
      for (const item of items) {
        if (!item.isDirectory()) continue;
        
        const parts = item.name.split('_');
        let subNumber = 0;
        let subName = item.name;
        
        if (parts.length > 1 && /^\d+$/.test(parts[0])) {
          subNumber = parseInt(parts[0]);
          subName = parts.slice(1).join('_');
        }
        
        if (subName.toLowerCase() === subsection.toLowerCase()) {
          return { dir: item.name, number: subNumber };
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
    
    return null;
  }
  async findMatchingFiles(dirPath, partial) {
    const matches = [];
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          const subMatches = await this.findMatchingFiles(fullPath, partial);
          matches.push(...subMatches);
        } else if (item.name.endsWith('.md')) {
          if (item.name.toLowerCase().includes(partial.toLowerCase())) {
            matches.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
    
    return matches;
  }
  parseReference(line) {
    const match = line.match(/@\.\/manifest\/([^\/]+)(?:\/([^\/]+))?(?:\/(.+))?/);
    if (!match) return null;
    
    const [, sectionDir, subsectionDir, filePath] = match;
    
    const sectionNumber = parseInt(sectionDir.split('-')[0]) || 0;
    
    let subsectionNumber = 0;
    if (subsectionDir) {
      const parts = subsectionDir.split('_');
      if (parts.length > 0 && /^\d+$/.test(parts[0])) {
        subsectionNumber = parseInt(parts[0]);
      }
    }
    
    return {
      line,
      sectionDir,
      sectionNumber,
      subsectionDir,
      subsectionNumber,
      filePath
    };
  }
  async compilePersona(projectPath) {
    // Ensure variables are loaded before compiling
    await this.variablesLoaded;
    
    const templatePath = this.getTemplatePath();
    const personaPath = this.getPersonaPath();
    const claudeLocalPath = path.join(projectPath, 'CLAUDE.local.md');
    
    try {
      const template = await fs.readFile(templatePath, 'utf8');
      const lines = template.split('\n');
      const compiled = [];
      const seenSections = new Set();
      
      for (const line of lines) {
        if (line.trim().startsWith('@')) {
          const refPath = line.trim().substring(1);
          
          if (refPath.endsWith('/')) {
            continue;
          } else {
            const filePath = path.join(this.baseDir, refPath);
            try {
              let content = await fs.readFile(filePath, 'utf8');
              // Apply variable substitution
              content = this.substituteVariables(content);
              
              // Remove dependency lines from content
              const contentLines = content.split('\n');
              const cleanLines = [];
              let foundHeader = false;
              
              for (const cLine of contentLines) {
                if (cLine.trim().startsWith('#')) {
                  foundHeader = true;
                }
                if (foundHeader || !cLine.trim().startsWith('@')) {
                  cleanLines.push(cLine);
                }
              }
              
              content = cleanLines.join('\n').trim();
              
              // Check if this is a subsection file
              const pathParts = refPath.split('/');
              if (pathParts.length >= 5) {
                const sectionDir = pathParts[2];

                // Look for the numbered subsection directory in the path
                let subsectionDir = null;
                let subsectionName = null;

                // Check each part of the path for numbered directories
                for (let i = 3; i < pathParts.length - 1; i++) {
                  const part = pathParts[i];
                  const matchUnderscore = part.match(/^\d+_(.+)$/);
                  const matchDash = part.match(/^\d+-(.+)$/);
                  const match = matchUnderscore || matchDash;

                  if (match) {
                    subsectionDir = part;
                    subsectionName = match[1].charAt(0).toUpperCase() + match[1].slice(1);

                    // For services, check if there's a subdirectory after it
                    if (match[1] === 'services' && i < pathParts.length - 2) {
                      const subdir = pathParts[i + 1];
                      subsectionName = `${subsectionName} - ${subdir.charAt(0).toUpperCase() + subdir.slice(1)}`;
                    }
                    break;
                  }
                }

                if (subsectionName && !content.includes('###') && !content.includes('##')) {
                  if (!seenSections.has(sectionDir)) {
                    seenSections.add(sectionDir);

                    let sectionName = '';
                    if (sectionDir.includes('_')) {
                      sectionName = sectionDir.split('_').slice(1).join('_');
                    } else if (sectionDir.includes('-')) {
                      sectionName = sectionDir.split('-').slice(1).join('-');
                    } else {
                      sectionName = sectionDir;
                    }
                    sectionName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);

                    content = `## ${sectionName}\n### ${subsectionName}\n${content}`;
                  } else {
                    content = `### ${subsectionName}\n${content}`;
                  }
                }
              }
              
              compiled.push(content);
            } catch (error) {
              console.error(`Warning: Could not read ${refPath}`);
            }
          }
        } else if (line.trim() !== '') {
          compiled.push(line);
        }
      }
      
      // Write compiled persona to plans directory
      await fs.writeFile(personaPath, compiled.join('\n'));
      
      // Create CLAUDE.local.md with reference to persona
      const relativePersonaPath = path.relative(projectPath, personaPath).replace(/\\/g, '/');
      const claudeLocalContent = `@${relativePersonaPath}`;
      await fs.writeFile(claudeLocalPath, claudeLocalContent);
      
      return true;
    } catch (error) {
      console.error('Compilation error:', error);
      return false;
    }
  }
  async handleAdd({ section, subsection, partial }) {
    const projectPath = process.cwd();
    const templatePath = this.getTemplatePath();
    const projectDir = path.dirname(templatePath);
    const manifestPath = path.join(this.baseDir, 'manifest');
    
    // Ensure project directory exists
    await fs.mkdir(projectDir, { recursive: true });
    
    // Find matching section directory
    const sectionInfo = await this.findManifestDir(manifestPath, section);
    if (!sectionInfo) {
      throw new Error(`Section '${section}' not found in manifest`);
    }
    
    const sectionPath = path.join(manifestPath, sectionInfo.dir);
    
    // Handle "random" keyword
    if (partial === 'random') {
      // If section has subsections and no specific subsection was specified
      if (!subsection) {
        const items = await fs.readdir(sectionPath, { withFileTypes: true });
        const subsectionDirs = [];
        
        for (const item of items) {
          if (item.isDirectory()) {
            const subPath = path.join(sectionPath, item.name);
            try {
              const subFiles = await fs.readdir(subPath);
              const mdFiles = subFiles.filter(f => f.endsWith('.md'));
              if (mdFiles.length > 0) {
                subsectionDirs.push(item.name);
              }
            } catch (e) {
              // Skip directories we can't read
            }
          }
        }
        
        // If this section has subsections, add random file from each
        if (subsectionDirs.length > 0) {
          const results = [];
          for (const subDir of subsectionDirs) {
            const subPath = path.join(sectionPath, subDir);
            const files = await fs.readdir(subPath);
            const mdFiles = files.filter(f => f.endsWith('.md'));
            
            if (mdFiles.length > 0) {
              const randomFile = mdFiles[Math.floor(Math.random() * mdFiles.length)];
              
              // Parse subsection name from directory
              let subsectionName = '';
              if (subDir.match(/^\d+[_-]/)) {
                subsectionName = subDir.replace(/^\d+[_-]/, '');
              } else {
                subsectionName = subDir;
              }
              
              // Recursively call handleAdd for this subsection
              await this.handleAdd({ 
                section, 
                subsection: subsectionName, 
                partial: randomFile.replace('.md', '') 
              });
              
              results.push(`${subsectionName}: ${randomFile}`);
            }
          }
          
          return {
            content: [
              {
                type: 'text',
                text: `Added random files from ${section}:\n${results.join('\n')}`
              }
            ]
          };
        }
      }
      
      // Otherwise select random file from current path
      let randomSearchPath = sectionPath;
      if (subsection) {
        const subInfo = await this.findSubsectionDir(sectionPath, subsection);
        if (!subInfo) {
          throw new Error(`Subsection '${subsection}' not found in section '${section}'`);
        }
        randomSearchPath = path.join(sectionPath, subInfo.dir);
      }
      
      const files = await fs.readdir(randomSearchPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      
      if (mdFiles.length === 0) {
        throw new Error(`No .md files found in ${subsection ? `${section}/${subsection}` : section}`);
      }
      
      const randomIndex = Math.floor(Math.random() * mdFiles.length);
      partial = mdFiles[randomIndex].replace('.md', '');
    }

    let searchPath = sectionPath;
    let subsectionInfo = null;
    
    // If subsection specified, find it
    if (subsection) {
      subsectionInfo = await this.findSubsectionDir(sectionPath, subsection);
      if (!subsectionInfo) {
        throw new Error(`Subsection '${subsection}' not found in section '${section}'`);
      }
      searchPath = path.join(sectionPath, subsectionInfo.dir);
    }
    
    // Find matching files
    const matchingFiles = await this.findMatchingFiles(searchPath, partial);
    
    if (matchingFiles.length === 0) {
      throw new Error(`No file matching '${partial}' found in ${subsection ? `${section}/${subsection}` : section}`);
    }
    
    if (matchingFiles.length > 1) {
      throw new Error(`Multiple files matching '${partial}' found. Please be more specific.`);
    }
    
    const matchingFile = matchingFiles[0];
    
    // Calculate relative path from MCP server root
    const relativePath = path.relative(this.baseDir, matchingFile).replace(/\\/g, '/');
    const newReference = `@./${relativePath}`;
    
    // Read current template
    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      // Create template if it doesn't exist
      template = '# Persona Configuration\n\n';
    }
    
    // Use inherited method to add file and dependencies
    const updatedTemplate = await this.addFileToTemplate(template, newReference, matchingFile);
    
    // Write updated template
    await fs.writeFile(templatePath, updatedTemplate);
    
    // Compile the persona
    await this.compilePersona(projectPath);
    
    return {
      content: [
        {
          type: 'text',
          text: `Added ${path.basename(matchingFile)} to ${subsection ? `${section}/${subsection}` : section} and compiled persona.`,
        },
      ],
    };
  }
  async handleRemove({ section, subsection, partial }) {
    const projectPath = process.cwd();
    const templatePath = this.getTemplatePath();
    const projectDir = path.dirname(templatePath);
    const manifestPath = path.join(this.baseDir, 'manifest');
    
    // Ensure project directory exists
    await fs.mkdir(projectDir, { recursive: true });
    
    // Read template
    const template = await fs.readFile(templatePath, 'utf8');
    const lines = template.split('\n');
    
    // Find the file(s) to remove
    let filesToRemove = [];
    let dependenciesToRemove = [];
    
    if (partial) {
      // Find specific file by partial name
      for (const line of lines) {
        if (line.trim().startsWith('@./manifest/') && line.includes(partial)) {
          filesToRemove.push(line.trim());
          break;
        }
      }
      if (filesToRemove.length === 0) {
        throw new Error(`File containing '${partial}' not found in template`);
      }
    } else {
      // Find all files in section/subsection
      const sectionInfo = await this.findManifestDir(manifestPath, section);
      if (!sectionInfo) {
        throw new Error(`Section '${section}' not found`);
      }
      
      let subsectionInfo = null;
      if (subsection) {
        const sectionPath = path.join(manifestPath, sectionInfo.dir);
        subsectionInfo = await this.findSubsectionDir(sectionPath, subsection);
        if (!subsectionInfo) {
          throw new Error(`Subsection '${subsection}' not found in section '${section}'`);
        }
      }
      
      // Find matching files
      for (const line of lines) {
        if (line.trim().startsWith('@./manifest/')) {
          const parsed = this.parseReference(line);
          if (parsed && parsed.sectionDir === sectionInfo.dir) {
            if (!subsection || (subsectionInfo && parsed.subsectionDir === subsectionInfo.dir)) {
              filesToRemove.push(line.trim());
            }
          }
        }
      }
      
      if (filesToRemove.length === 0) {
        throw new Error(`${subsection ? `${section}/${subsection}` : section} not found in template`);
      }
    }
    
    // Process each file to remove using inherited method
    let updatedTemplate = template;
    let totalDepsRemoved = 0;
    
    for (const fileRef of filesToRemove) {
      const filePath = fileRef.replace('@./', path.join(this.baseDir, '/').replace(/\\/g, '/'));
      const actualPath = filePath.replace(/\//g, path.sep);
      
      // Count dependencies before removal for reporting
      const deps = await this.extractDependencies(actualPath);
      const listDeps = deps.filter(dep => {
        const parts = dep.split('/');
        return parts[2] && parts[2].endsWith('_list');
      });
      totalDepsRemoved += listDeps.length;
      
      // Use inherited method to remove file and its LIST dependencies
      updatedTemplate = await this.removeFileFromTemplate(updatedTemplate, fileRef, actualPath);
    }
    
    // Write updated template
    await fs.writeFile(templatePath, updatedTemplate);
    
    // Compile the persona
    await this.compilePersona(projectPath);
    
    const message = partial 
      ? `Removed ${partial} and ${totalDepsRemoved} LIST dependencies`
      : `Removed ${subsection ? `${section}/${subsection}` : section} (${filesToRemove.length} files) and ${totalDepsRemoved} LIST dependencies`;
    
    return {
      content: [
        {
          type: 'text',
          text: `${message} from template and compiled persona.`,
        },
      ],
    };
  }
  async handleSetVar({ variable, value }) {
    const projectPath = process.cwd();
    const projectDirName = this.getProjectDirName();
    const projectVarsPath = path.join(this.baseDir, 'plans', projectDirName, 'vars.txt');
    
    // Ensure project directory exists
    const projectDir = path.join(this.baseDir, 'plans', projectDirName);
    try {
      await fs.mkdir(projectDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's ok
    }
    
    // Load existing project vars or start with empty
    let varsContent = '';
    try {
      varsContent = await fs.readFile(projectVarsPath, 'utf8');
    } catch (error) {
      // No existing vars file, create header
      varsContent = '# Project-specific Persona Variables\n# These override default_vars.txt\n# Format: KEY=value\n\n';
    }
    
    // Parse existing variables
    const lines = varsContent.split('\n');
    const newLines = [];
    let found = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key] = trimmed.split('=');
        if (key && key.trim() === variable) {
          newLines.push(`${variable}=${value}`);
          found = true;
        } else {
          newLines.push(line);
        }
      } else {
        newLines.push(line);
      }
    }
    
    // If variable wasn't found, add it
    if (!found) {
      // Add before the last empty line if there is one
      if (newLines[newLines.length - 1] === '') {
        newLines.splice(newLines.length - 1, 0, `${variable}=${value}`);
      } else {
        newLines.push(`${variable}=${value}`);
      }
    }
    
    // Write back the file
    await fs.writeFile(projectVarsPath, newLines.join('\n'));
    
    // Reload variables
    await this.loadVariables();
    
    // Recompile persona with new variables
    await this.compilePersona(projectPath);
    
    return {
      content: [
        {
          type: 'text',
          text: `Set ${variable}=${value} in project vars and recompiled persona.`
        }
      ]
    };
  }
  
  async handleList({ section, subsection } = {}) {
    const manifestPath = path.join(this.baseDir, 'manifest');
    const result = {
      sections: {},
      totalFiles: 0
    };
    try {
      // If no section specified, list all sections and their files
      if (!section) {
        const dirs = await fs.readdir(manifestPath);
        
        for (const dir of dirs) {
          const dirPath = path.join(manifestPath, dir);
          const stat = await fs.stat(dirPath);
          
          if (stat.isDirectory()) {
            // Parse section name from directory
            let sectionName = '';
            if (dir.includes('_')) {
              sectionName = dir.split('_').slice(1).join('_');
            } else if (dir.includes('-')) {
              sectionName = dir.split('-').slice(1).join('-');
            } else {
              sectionName = dir;
            }
            
            result.sections[sectionName] = {
              directory: dir,
              files: [],
              subsections: {}
            };
            
            // List files and subdirectories in this section
            const items = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const item of items) {
              if (item.isFile() && item.name.endsWith('.md')) {
                result.sections[sectionName].files.push(item.name);
                result.totalFiles++;
              } else if (item.isDirectory()) {
                // Check for files in subsection
                const subPath = path.join(dirPath, item.name);
                const subFiles = await fs.readdir(subPath);
                const mdFiles = subFiles.filter(f => f.endsWith('.md'));
                
                if (mdFiles.length > 0) {
                  // Parse subsection name
                  let subsectionName = '';
                  if (item.name.match(/^\d+[_-]/)) {
                    subsectionName = item.name.replace(/^\d+[_-]/, '');
                  } else {
                    subsectionName = item.name;
                  }
                  
                  result.sections[sectionName].subsections[subsectionName] = {
                    directory: item.name,
                    files: mdFiles
                  };
                  result.totalFiles += mdFiles.length;
                }
              }
            }
          }
        }
      } else {
        // List files in specific section
        const sectionInfo = await this.findManifestDir(manifestPath, section);
        if (!sectionInfo) {
          throw new Error(`Section '${section}' not found`);
        }
        
        const sectionPath = path.join(manifestPath, sectionInfo.dir);
        
        if (subsection) {
          // List files in specific subsection
          const subsectionInfo = await this.findSubsectionDir(sectionPath, subsection);
          if (!subsectionInfo) {
            throw new Error(`Subsection '${subsection}' not found in section '${section}'`);
          }
          
          const subsectionPath = path.join(sectionPath, subsectionInfo.dir);
          const files = await fs.readdir(subsectionPath);
          const mdFiles = files.filter(f => f.endsWith('.md'));
          
          result.sections[section] = {
            directory: sectionInfo.dir,
            subsections: {
              [subsection]: {
                directory: subsectionInfo.dir,
                files: mdFiles
              }
            }
          };
          result.totalFiles = mdFiles.length;
        } else {
          // List all files and subsections in this section
          result.sections[section] = {
            directory: sectionInfo.dir,
            files: [],
            subsections: {}
          };
          
          const items = await fs.readdir(sectionPath, { withFileTypes: true });
          
          for (const item of items) {
            if (item.isFile() && item.name.endsWith('.md')) {
              result.sections[section].files.push(item.name);
              result.totalFiles++;
            } else if (item.isDirectory()) {
              // Check for files in subsection
              const subPath = path.join(sectionPath, item.name);
              const subFiles = await fs.readdir(subPath);
              const mdFiles = subFiles.filter(f => f.endsWith('.md'));
              
              if (mdFiles.length > 0) {
                // Parse subsection name
                let subsectionName = '';
                if (item.name.match(/^\d+[_-]/)) {
                  subsectionName = item.name.replace(/^\d+[_-]/, '');
                } else {
                  subsectionName = item.name;
                }
                
                result.sections[section].subsections[subsectionName] = {
                  directory: item.name,
                  files: mdFiles
                };
                result.totalFiles += mdFiles.length;
              }
            }
          }
        }
      }
      
      // Format the output as readable text
      let output = [];
      
      if (!section) {
        output.push(`Found ${result.totalFiles} persona files across ${Object.keys(result.sections).length} sections:\n`);
      } else if (subsection) {
        output.push(`Files in ${section}/${subsection}:\n`);
      } else {
        output.push(`Files in section '${section}':\n`);
      }
      
      for (const [sectionName, sectionData] of Object.entries(result.sections)) {
        output.push(`\n## ${sectionName} (${sectionData.directory})`);
        
        // List direct files in section
        if (sectionData.files && sectionData.files.length > 0) {
          output.push('Files:');
          for (const file of sectionData.files) {
            output.push(`  - ${file}`);
          }
        }
        
        // List subsections and their files
        if (sectionData.subsections && Object.keys(sectionData.subsections).length > 0) {
          for (const [subName, subData] of Object.entries(sectionData.subsections)) {
            output.push(`\n### ${subName} (${subData.directory})`);
            for (const file of subData.files) {
              output.push(`  - ${file}`);
            }
          }
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: output.join('\n'),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',  
            text: `Error listing files: ${error.message}`,
          },
        ],
      };
    }
  }
}