import fs from 'fs/promises';
import path from 'path';
import { PersonaCore } from './persona-core.js';
import { MultiManifest } from './MultiManifest.js';
import { FuzzyMatch } from './FuzzyMatch.js';
import { formatMarkdown } from './formatMarkdown.js';
export class PersonaManager extends PersonaCore {
  // Delegate to FuzzyMatch for consistency
  fuzzyMatch(options, search) {
    const result = FuzzyMatch.findBest(options, search);
    return result || ''; // Return empty string instead of null for backward compatibility
  }

  constructor(baseDir) {
    super();
    this.baseDir = baseDir; // .

    // Load configuration from environment
    this.plansDir = process.env.PLANS_DIR ?
      path.resolve(baseDir, process.env.PLANS_DIR) :
      path.join(baseDir, 'plans');

    // Parse manifest directories from env
    const manifestDirs = process.env.MANIFEST_DIRS ?
      process.env.MANIFEST_DIRS.split(',').map(dir =>
        path.resolve(baseDir, dir.trim())
      ) :
      [path.join(baseDir, 'manifest')];

    // Initialize MultiManifest with all directories
    this.multiManifest = new MultiManifest(manifestDirs);
    this.manifestDirs = manifestDirs; // Keep for backward compatibility

    this.variables = {};
    this.variablesLoaded = this.loadVariables();
  }
  async loadVariables() {
    this.variables = {};

    // First load default_vars.txt from ALL manifest directories (cascade)
    for (const manifestDir of this.manifestDirs) {
      try {
        const manifestVarsPath = path.join(manifestDir, 'default_vars.txt');
        const manifestContent = await fs.readFile(manifestVarsPath, 'utf8');
        this.parseVariables(manifestContent);
        console.log(`Loaded variables from ${manifestVarsPath}`);
      } catch (error) {
        // No default_vars.txt in this manifest dir is fine
      }
    }

    // Then load global defaults from plans dir
    try {
      const defaultVarsPath = path.join(this.plansDir, 'default_vars.txt');
      const defaultContent = await fs.readFile(defaultVarsPath, 'utf8');
      this.parseVariables(defaultContent);
    } catch (error) {
      // Plans default_vars.txt is optional
    }

    // Finally override with project-specific vars if they exist
    try {
      const projectVarsPath = path.join(this.plansDir, this.getProjectDirName(), 'vars.txt');
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
    return path.join(this.plansDir, this.getProjectDirName(), 'template.md');
  }
  getPersonaPath() {
    return path.join(this.plansDir, this.getProjectDirName(), 'persona.md');
  }

  // Helper methods using MultiManifest
  async findFileWithMultiManifest(section, subsection, partial) {
    // If partial includes .md, remove it
    if (partial && partial.endsWith('.md')) {
      partial = partial.replace('.md', '');
    }

    const fileInfo = await this.multiManifest.findFile(section, subsection, partial);
    if (fileInfo) {
      return fileInfo.path;
    }
    return null;
  }

  async findFilesWithMultiManifest(section, subsection, partial) {
    const files = await this.multiManifest.findFiles(section, subsection, partial);
    return files.map(f => f.path);
  }

  async readFileWithMultiManifest(section, subsection, partial) {
    const result = await this.multiManifest.readFile(section, subsection, partial);
    return result ? result.content : null;
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
  isListDirectory(dirName) {
    // LIST directories end with _list
    return dirName.endsWith('_list');
  }

  isSlotDirectory(dirName) {
    // SLOT directories start with numbers and don't end with _list
    return /^\d{3}_/.test(dirName) && !dirName.endsWith('_list');
  }

  async cleanAndSortTemplate(templatePath) {
    // Read template
    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch {
      return; // No template to clean
    }

    const lines = template.split('\n');
    const references = [];
    const nonRefs = [];

    // Extract all @ references and fix malformed paths
    for (const line of lines) {
      if (line.trim().startsWith('@')) {
        let fullPath = line.trim().substring(1);

        // Fix malformed paths with duplicate /manifest/ patterns
        // e.g., "./../mcp_persona/manifest/050_story/turned_hot/manifest/060_play_list/..."
        // should be "./../mcp_persona/manifest/060_play_list/..."
        if (fullPath.includes('/manifest/') && fullPath.split('/manifest/').length > 2) {
          // Find all occurrences of /manifest/
          const parts = fullPath.split('/manifest/');
          // Keep only the first occurrence and the last part
          fullPath = parts[0] + '/manifest/' + parts[parts.length - 1];
          console.warn(`Fixed malformed path: ${line.trim()} -> @${fullPath}`);
        }

        // Extract the manifest-relative part (everything after /manifest/)
        const manifestIdx = fullPath.lastIndexOf('/manifest/');
        const manifestRelative = manifestIdx >= 0
          ? fullPath.substring(manifestIdx + 10) // Skip "/manifest/"
          : fullPath;

        references.push({
          manifestRelative,
          fullPath,
          line: `@${fullPath}` // Use the cleaned path
        });
      } else {
        nonRefs.push(line);
      }
    }

    // Sort by manifest relative path
    references.sort((a, b) => a.manifestRelative.localeCompare(b.manifestRelative));

    // Process sorted refs, dropping slot collisions
    const finalRefs = [];
    const occupiedSlots = new Set();

    for (const ref of references) {
      // Find the last numbered directory to determine slot
      const parts = ref.manifestRelative.split('/');
      let slotKey = null;

      for (let i = 0; i < parts.length - 1; i++) {
        if (/^\d{3}_/.test(parts[i])) {
          // This is a numbered directory
          if (parts[i].endsWith('_list')) {
            // It's a list - no slot collision possible
            slotKey = null;
            break;
          } else {
            // It's a slot section
            // Check if next part is also a numbered subsection
            if (i + 1 < parts.length - 1 && /^\d+[_-]/.test(parts[i + 1])) {
              // Include the subsection in the slot key
              slotKey = parts.slice(0, i + 2).join('/');
            } else {
              // Just the section itself is the slot
              slotKey = parts.slice(0, i + 1).join('/');
            }
          }
        }
      }

      if (slotKey && occupiedSlots.has(slotKey)) {
        // Slot collision - skip this ref
        continue;
      }

      if (slotKey) {
        occupiedSlots.add(slotKey);
      }

      finalRefs.push(ref.line);
    }

    // Rebuild template with sorted, deduped refs
    const cleanTemplate = [...nonRefs.filter(l => l.trim() !== ''), ...finalRefs].join('\n');
    await fs.writeFile(templatePath, cleanTemplate, 'utf8');
  }

  toTitleCase(str) {
    return str.replace(/[_-]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatCompiledContent(content) {
    const lines = content.split('\n');
    const formatted = [];
    let currentMainSection = null; // Track # level section
    let currentSubSection = null;  // Track ## level section
    let lastLineWasBlank = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#{1,6})\s*(.+)/);

      if (headerMatch) {
        const level = headerMatch[1].length;
        const title = headerMatch[2].trim();

        // Handle section headers that were added during compilation
        // Only treat as main section if it matches known section patterns
        const knownSections = ['Main', 'Pattern List', 'Output', 'Story', 'Play List', 'Look', 'User', 'Jail', 'End'];
        const isMainSection = level === 1 && knownSections.includes(title);

        if (isMainSection) {
          // Main section header
          // Add blank line BEFORE section (not after), except at very start
          if (formatted.length > 0) {
            // Always add blank line before main sections except the first one
            if (!lastLineWasBlank) {
              formatted.push('');
            }
          }
          currentMainSection = title;
          currentSubSection = null;
          formatted.push(`# ${title}`);
          lastLineWasBlank = false;
        } else if (level === 2 && currentMainSection) {
          // Subsection header under main section
          // Add blank line before ## headers too (except at start)
          if (formatted.length > 0 && !lastLineWasBlank) {
            formatted.push('');
          }
          // But DON'T treat story subsections like "Learning From The Hub" as affecting hierarchy
          if (currentMainSection !== 'Story') {
            currentSubSection = title;
          }
          formatted.push(`## ${title}`);
          lastLineWasBlank = false;
        } else {
          // Content headers that need adjustment
          let adjustedLevel = level;

          // If we're inside a main section, adjust the level
          if (currentMainSection) {
            if (currentSubSection) {
              // We're in a ## subsection, so content headers start at ###
              // All content headers become ### under a subsection
              adjustedLevel = 3;
            } else {
              // We're directly under a # section
              // All content headers should become ##
              adjustedLevel = 2; // All headers become ## under main section
            }
          } else {
            // Not in a section, keep original level
            adjustedLevel = level;
          }

          // Cap at ### for deeply nested headers
          adjustedLevel = Math.min(3, adjustedLevel);

          // Fix spacing (like ###Emojis -> ### Emojis)
          formatted.push(`${'#'.repeat(adjustedLevel)} ${title}`);
          lastLineWasBlank = false;
        }
      } else if (line.trim() === '') {
        // Track blank lines
        formatted.push(line);
        lastLineWasBlank = true;
      } else {
        // Regular content
        formatted.push(line);
        lastLineWasBlank = false;
      }
    }

    // Second pass: Remove duplicate headers and fix specific issues
    const finalFormatted = [];
    let previousHeader = null;

    for (let i = 0; i < formatted.length; i++) {
      const line = formatted[i];
      const headerMatch = line.match(/^(#{1,3})\s+(.+)/);

      if (headerMatch) {
        const level = headerMatch[1].length;
        const title = headerMatch[2];

        // Skip duplicate consecutive headers at same level with same title
        if (previousHeader &&
            previousHeader.level === level &&
            previousHeader.title === title) {
          continue;
        }

        // Special handling for misplaced headers
        // Don't add subsection headers that don't belong to current section
        if (level === 2 && currentMainSection) {
          // Check if this ## belongs under the current #
          const belongsHere = ['Narration', 'Body'].includes(title);
          if (!belongsHere && currentMainSection === 'Pattern List' && title === 'Narration') {
            continue; // Skip ## Narration under Pattern List
          }
        }

        previousHeader = { level, title };
      } else {
        previousHeader = null;
      }

      finalFormatted.push(line);
    }

    return finalFormatted.join('\n');
  }

  async compilePersona(projectPath) {
    // Ensure variables are loaded before compiling
    await this.variablesLoaded;

    const templatePath = this.getTemplatePath();
    const personaPath = this.getPersonaPath();
    const claudeLocalPath = path.join(projectPath, 'CLAUDE.local.md');

    // Clean and sort template before compiling
    await this.cleanAndSortTemplate(templatePath);

    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      // If template doesn't exist, create empty one
      const projectDir = path.dirname(templatePath);
      await fs.mkdir(projectDir, { recursive: true });
      template = '# Persona Configuration\n';
      await fs.writeFile(templatePath, template, 'utf8');
    }

    try {
      const lines = template.split('\n');
      const compiled = [];
      const seenSections = new Set();

      for (const line of lines) {
        // Skip any header lines in the template file itself
        if (line.trim().startsWith('#') && !line.trim().startsWith('@')) {
          continue;
        }

        if (line.trim().startsWith('@')) {
          const refPath = line.trim().substring(1);

          if (refPath.endsWith('/')) {
            continue;
          } else {
            // Try to resolve using MultiManifest first (for manifest-relative paths)
            let filePath = await this.multiManifest.resolveManifestPath(refPath);

            // If not found in manifests, try resolving relative to baseDir
            if (!filePath) {
              filePath = path.resolve(this.baseDir, refPath);
              // Check if this resolved path exists
              try {
                await fs.access(filePath);
              } catch {
                console.warn(`File not found: ${refPath}`);
                continue;
              }
            }

            // Validate the path doesn't contain invalid patterns (multiple /manifest/ occurrences)
            const manifestCount = (refPath.match(/\/manifest\//g) || []).length;
            if (manifestCount > 1) {
              console.warn(`Skipping malformed path with duplicate /manifest/: ${refPath}`);
              continue;
            }

            try {
              let content = await fs.readFile(filePath, 'utf8');
              // Apply variable substitution
              content = this.substituteVariables(content);
              
              // Remove dependency lines and the first main title header only
              const contentLines = content.split('\n');
              const cleanLines = [];
              let skippedFirstHeader = false;

              // Process lines
              for (let i = 0; i < contentLines.length; i++) {
                const cLine = contentLines[i];

                // Skip @ dependencies
                if (cLine.trim().startsWith('@')) {
                  continue;
                }

                // Skip the first # header only (the main title)
                if (!skippedFirstHeader && cLine.match(/^#\s+/)) {
                  skippedFirstHeader = true;
                  // Also skip blank lines immediately after
                  while (i + 1 < contentLines.length && contentLines[i + 1].trim() === '') {
                    i++;
                  }
                  continue;
                }

                // Add all other lines
                cleanLines.push(cLine);
              }

              content = cleanLines.join('\n').trim();

              // Check if content has no headers and add one based on filename
              if (content && !content.match(/^#{1,3}\s+/m)) {
                // For numbered subsections in 070_look, use the subsection name instead of filename
                const pathParts = refPath.split('/');
                const manifestIdx = pathParts.indexOf('manifest');
                let headerName;

                if (manifestIdx >= 0 && manifestIdx + 2 < pathParts.length - 1) {
                  const sectionDir = pathParts[manifestIdx + 1];
                  const subsectionDir = pathParts[manifestIdx + 2];

                  // Check if this is a 070_look numbered subsection
                  if (sectionDir === '070_look' && /^\d+[_-]/.test(subsectionDir)) {
                    // Use the subsection name (without number) as header
                    headerName = this.toTitleCase(subsectionDir.replace(/^\d+[_-]/, ''));
                  }
                }

                // Fallback to filename if not a special case
                if (!headerName) {
                  const filename = path.basename(refPath, '.md');
                  headerName = this.toTitleCase(filename);
                }

                content = `## ${headerName}\n${content}`;
              }

              // Add section headers for organization
              const pathParts = refPath.split('/');

              // Find the manifest index to properly locate section directory
              const manifestIdx = pathParts.indexOf('manifest');
              if (manifestIdx >= 0 && manifestIdx + 1 < pathParts.length) {
                const sectionDir = pathParts[manifestIdx + 1];

                // Check if this is a numbered section directory
                if (/^\d{3}_/.test(sectionDir)) {
                  // Add section header if we haven't seen this section yet
                  if (!seenSections.has(sectionDir)) {
                    seenSections.add(sectionDir);

                    // Extract section name from directory (remove numbers and clean up)
                    let sectionName = '';
                    if (sectionDir.includes('_')) {
                      sectionName = sectionDir.split('_').slice(1).join('_');
                    } else if (sectionDir.includes('-')) {
                      sectionName = sectionDir.split('-').slice(1).join('-');
                    } else {
                      sectionName = sectionDir;
                    }
                    // Convert to title case
                    sectionName = this.toTitleCase(sectionName);

                    // Add section header with newline separator before content
                    content = compiled.length > 0 ? `\n# ${sectionName}\n${content}` : `# ${sectionName}\n${content}`;
                  }

                  // Don't add subsection headers for 040_output subdirectories
                  // or 070_look subdirectories - these files already contain their own headers
                  const skipSubsectionHeaders = ['040_output', '070_look'];

                  if (!skipSubsectionHeaders.includes(sectionDir) && manifestIdx + 2 < pathParts.length - 1) {
                    const subsectionDir = pathParts[manifestIdx + 2];

                    // Check if this is a numbered subsection
                    if (/^\d+[_-]/.test(subsectionDir)) {
                      const subsectionKey = `${sectionDir}/${subsectionDir}`;

                      if (!seenSections.has(subsectionKey)) {
                        seenSections.add(subsectionKey);

                        // Extract subsection name and convert to title case
                        let subsectionName = subsectionDir.replace(/^\d+[_-]/, '');
                        subsectionName = this.toTitleCase(subsectionName);

                        // Add subsection header
                        content = `## ${subsectionName}\n${content}`;
                      }
                    }
                  }
                }
              }
              
              compiled.push(content);
            } catch (error) {
              console.error(`ERROR: Could not read required file: ${refPath}`);
              throw new Error(`Template references missing file: ${refPath}`);
            }
          }
        } else if (line.trim() !== '') {
          // Add any other non-empty, non-header lines
          compiled.push(line);
        }
      }

      // Format the compiled content using the pure function
      const formattedContent = formatMarkdown(compiled);

      // Write formatted persona to plans directory (for backup/reference)
      await fs.writeFile(personaPath, formattedContent);

      // Write the formatted persona directly to CLAUDE.local.md for real-time updates
      // No more @ import - write the actual content
      await fs.writeFile(claudeLocalPath, formattedContent);
      
      return true;
    } catch (error) {
      console.error('Compilation error:', error);
      throw error;
    }
  }
  async handleAdd({ section, subsection, partial }) {
    const projectPath = process.cwd();
    const templatePath = this.getTemplatePath();
    const projectDir = path.dirname(templatePath);

    // Ensure project directory exists
    await fs.mkdir(projectDir, { recursive: true });

    // Get all available sections using MultiManifest
    const sections = await this.multiManifest.listSections();
    const sectionNames = sections.map(s => s.name);

    // Fuzzy match the section - prefer exact match
    let matchedSection = sectionNames.find(s => s === section);
    if (!matchedSection) {
      matchedSection = this.fuzzyMatch(sectionNames, section);
      if (!matchedSection) {
        throw new Error(`No section matching '${section}' found. Available: ${sectionNames.join(', ')}`);
      }
    }

    // Fuzzy match subsection BEFORE handling random
    let matchedSubsection = subsection;
    if (subsection) {
      const subsections = await this.multiManifest.listSubsections(matchedSection);
      const subsectionNames = subsections.map(s => s.name);
      matchedSubsection = this.fuzzyMatch(subsectionNames, subsection);

      if (!matchedSubsection) {
        throw new Error(`No subsection matching '${subsection}' found in ${matchedSection}`);
      }
    }

    // Handle "random" partial
    if (partial === 'random') {
      let files;

      if (matchedSubsection) {
        // Get random file from specific subsection
        files = await this.multiManifest.findFiles(matchedSection, matchedSubsection);
      } else {
        // Check if section has subsections
        const subsections = await this.multiManifest.listSubsections(matchedSection);

        if (subsections.length > 0) {
          // Add random file from each subsection
          const results = [];
          for (const sub of subsections) {
            const subFiles = await this.multiManifest.findFiles(matchedSection, sub.name);
            if (subFiles.length > 0) {
              const randomFile = subFiles[Math.floor(Math.random() * subFiles.length)];

              // Build reference path
              const relativePath = path.relative(this.baseDir, randomFile.path).replace(/\\/g, '/');
              const newReference = `@./${relativePath}`;

              // Add to template
              await this.addReferenceToTemplate(templatePath, newReference);
              results.push(`${sub.name}: ${randomFile.filename}`);
            }
          }

          // Compile after adding all
          await this.compilePersona(projectPath);

          return {
            content: [{
              type: 'text',
              text: `Added random files from ${matchedSection}:\n${results.join('\n')}`
            }]
          };
        } else {
          // Get random from section root
          files = await this.multiManifest.findFiles(matchedSection, null);
        }
      }

      if (!files || files.length === 0) {
        throw new Error(`No files found in ${matchedSection}${subsection ? '/' + subsection : ''}`);
      }

      const randomFile = files[Math.floor(Math.random() * files.length)];
      partial = randomFile.filename;
    }

    // Find the specific file
    const fileInfo = await this.multiManifest.findFile(matchedSection, matchedSubsection, partial);
    if (!fileInfo) {
      throw new Error(`No file matching '${partial}' found in ${matchedSection}${matchedSubsection ? '/' + matchedSubsection : ''}`);
    }

    // If no subsection was specified but the file is in one, use it
    if (!matchedSubsection && fileInfo.subsection) {
      matchedSubsection = fileInfo.subsection.split(/[\/\\]/)[0]; // Get top-level subsection
    }

    // Build reference path
    const relativePath = path.relative(this.baseDir, fileInfo.path).replace(/\\/g, '/');
    const newReference = `@./${relativePath}`;

    // Extract dependencies recursively
    const allDependencies = new Set();
    const processedFiles = new Set();

    async function extractDepsRecursive(filePath) {
      if (processedFiles.has(filePath)) return; // Avoid circular deps
      processedFiles.add(filePath);

      try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        const fileDir = path.dirname(filePath);

        for (const line of lines) {
          if (line.trim().startsWith('@')) {
            const depPath = line.trim().substring(1);
            let fullDepPath;

            // Check if the dependency starts with ./manifest/ - these are root-relative
            if (depPath.startsWith('./manifest/')) {
              // Find the manifest root (could be in either manifest directory)
              const manifestRelativePath = depPath.replace('./manifest/', '');

              // Try to find the file in any of our manifest directories
              let found = false;
              for (const manifestDir of this.manifestDirs) {
                const candidatePath = path.join(manifestDir, manifestRelativePath);
                try {
                  await fs.access(candidatePath);
                  fullDepPath = candidatePath;
                  found = true;
                  break;
                } catch {
                  // Try next manifest dir
                }
              }

              if (!found) {
                console.warn(`Dependency not found in any manifest: ${depPath}`);
                continue;
              }
            } else {
              // Regular relative path
              fullDepPath = path.resolve(fileDir, depPath);
            }

            // Convert back to a reference path relative to base
            const relativeDepPath = path.relative(this.baseDir, fullDepPath).replace(/\\/g, '/');
            allDependencies.add(`./${relativeDepPath}`);

            // Recursively process this dependency
            await extractDepsRecursive.call(this, fullDepPath);
          } else if (line.trim().startsWith('#')) {
            break; // Stop at first header
          }
        }
      } catch (error) {
        console.warn(`Could not read dependency: ${filePath}`);
      }
    }

    // Extract all dependencies recursively
    await extractDepsRecursive.call(this, fileInfo.path);

    // Check if this is a SLOT directory or subsection
    // For subsections, we only want to remove from that specific subsection slot
    // For main sections without subsections, remove the whole section
    if (matchedSubsection) {
      // Adding to a subsection - only remove that subsection's slot
      await this.removeSlotReferencesFromTemplate(templatePath, matchedSection, matchedSubsection);
    } else if (this.isSlotDirectory(matchedSection)) {
      // Adding to main section slot - remove whole section
      await this.removeSlotReferencesFromTemplate(templatePath, matchedSection, null);
    }

    // Add all dependencies first
    for (const dep of allDependencies) {
      const depRef = `@${dep}`;
      await this.addReferenceToTemplate(templatePath, depRef);
    }

    // Then add the main file
    await this.addReferenceToTemplate(templatePath, newReference);

    // Compile the persona
    await this.compilePersona(projectPath);

    // Return the filename without extension for the response
    const displayName = path.basename(fileInfo.path, '.md');

    return {
      content: [{
        type: 'text',
        text: `Added ${displayName} to ${matchedSection}${matchedSubsection ? '/' + matchedSubsection : ''} and compiled persona.`
      }]
    };
  }

  async removeSlotReferencesFromTemplate(templatePath, section, subsection = null) {
    // Read current template
    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      return; // No template to clean
    }

    const lines = template.split('\n');
    const cleanedLines = [];

    for (const line of lines) {
      if (line.trim().startsWith('@')) {
        // Check if this reference is for the same SLOT
        const refPath = line.trim();

        // Build pattern to match - handles both manifest dirs
        const slotPattern = subsection
          ? `/${section}/${subsection}/`
          : `/${section}/`;

        if (refPath.includes(slotPattern)) {
          // Skip this line - it's in the same SLOT we're about to fill
          console.log(`Removing existing SLOT reference: ${refPath}`);
          continue;
        }
      }
      cleanedLines.push(line);
    }

    // Write cleaned template
    await fs.writeFile(templatePath, cleanedLines.join('\n'), 'utf8');
  }

  async addReferenceToTemplate(templatePath, newReference) {
    // Read current template
    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      // Create template if it doesn't exist
      template = '# Persona Configuration\n';
      await fs.writeFile(templatePath, template, 'utf8');
    }

    // Check if reference already exists
    if (!template.includes(newReference)) {
      // Add new reference
      template = template.trimEnd() + '\n' + newReference;
      await fs.writeFile(templatePath, template, 'utf8');

      // Clean and sort the template after adding
      await this.cleanAndSortTemplate(templatePath);
    }
  }

  async handleRemove({ section, subsection, partial }) {
    const projectPath = process.cwd();
    const templatePath = this.getTemplatePath();
    const projectDir = path.dirname(templatePath);

    // Ensure project directory exists
    await fs.mkdir(projectDir, { recursive: true });

    // Read template
    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: 'No template file exists to remove from.'
        }]
      };
    }

    const lines = template.split('\n');
    let filesToRemove = [];

    if (partial) {
      // Find specific file by partial name in template
      for (const line of lines) {
        if (line.trim().startsWith('@') && line.includes(partial)) {
          filesToRemove.push(line.trim());
          break;
        }
      }
      if (filesToRemove.length === 0) {
        throw new Error(`File containing '${partial}' not found in template`);
      }
    } else {
      // Use MultiManifest to verify section exists
      const sections = await this.multiManifest.listSections();
      const sectionNames = sections.map(s => s.name);

      // Prefer exact match
      let matchedSection = sectionNames.find(s => s === section);
      if (!matchedSection) {
        matchedSection = this.fuzzyMatch(sectionNames, section);
        if (!matchedSection) {
          throw new Error(`Section '${section}' not found`);
        }
      }

      let matchedSubsection = subsection;
      if (subsection) {
        const subsections = await this.multiManifest.listSubsections(matchedSection);
        matchedSubsection = this.fuzzyMatch(subsections.map(s => s.name), subsection);
        if (!matchedSubsection) {
          throw new Error(`Subsection '${subsection}' not found in ${matchedSection}`);
        }
      }

      // Find matching files in template
      for (const line of lines) {
        if (line.trim().startsWith('@')) {
          // Check if this line matches the section/subsection
          if (line.includes(`/${matchedSection}/`)) {
            if (!matchedSubsection || line.includes(`/${matchedSection}/${matchedSubsection}/`)) {
              filesToRemove.push(line.trim());
            }
          }
        }
      }

      if (filesToRemove.length === 0) {
        throw new Error(`${matchedSubsection ? `${matchedSection}/${matchedSubsection}` : matchedSection} not found in template`);
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
  async handleCreate({ section, subsection, filename, secondperson_prompt_from_system_to_assistant }) {
    // Strip _list suffix if present for fuzzy matching
    if (section && section.endsWith('_list')) {
      section = section.slice(0, -5); // Remove '_list'
    }

    // Get all available sections using MultiManifest
    const sections = await this.multiManifest.listSections();
    const sectionNames = sections.map(s => s.name);

    // Fuzzy match the section - prefer exact match
    let matchedSection = sectionNames.find(s => s === section);
    if (!matchedSection) {
      matchedSection = this.fuzzyMatch(sectionNames, section);
      if (!matchedSection) {
        return {
          content: [{
            type: 'text',
            text: `Error: Section '${section}' does not exist. Available: ${sectionNames.join(', ')}`
          }]
        };
      }
    }

    // Ensure .md extension
    const fullFilename = filename.endsWith('.md') ? filename : `${filename}.md`;

    // Format the content with a header
    const sectionName = matchedSection.replace(/^\\d{3}_/, '');
    const header = subsection
      ? `# ${sectionName}/${subsection}\\n## ${path.basename(filename, '.md')}`
      : `# ${sectionName}\\n## ${path.basename(filename, '.md')}`;

    const content = `${header}

${secondperson_prompt_from_system_to_assistant}`;

    // Use MultiManifest to write the file
    const result = await this.multiManifest.writeFile(
      matchedSection,
      subsection,
      fullFilename,
      content,
      true // createDir
    );

    if (!result.success) {
      return {
        content: [{
          type: 'text',
          text: `Error creating file: ${result.error}`
        }]
      };
    }

    // Create the partial name for the add command
    const partialName = path.basename(filename, '.md');

    // Build the add command example - use original section name for user clarity
    const addCommand = subsection
      ? `mcp__pageant__add section:"${section}" subsection:"${subsection}" partial:"${partialName}"`
      : `mcp__pageant__add section:"${section}" partial:"${partialName}"`;

    return {
      content: [{
        type: 'text',
        text: `Created new persona section at ${result.path}\\n\\nContent:\\n${content}\\n\\n✅  File created but NOT added to current persona yet.\\n\\nTo add this to your persona, use:\\n${addCommand}`
      }]
    };
  }

  async handleSetVar({ variable, value }) {
    const projectPath = process.cwd();
    const projectDirName = this.getProjectDirName();
    const projectVarsPath = path.join(this.plansDir, projectDirName, 'vars.txt');

    // Ensure project directory exists
    const projectDir = path.join(this.plansDir, projectDirName);
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
    const result = {
      sections: {},
      totalFiles: 0
    };

    try {
      if (!section) {
        // List all sections
        const sections = await this.multiManifest.listSections();

        for (const sectionInfo of sections) {
          const sectionName = sectionInfo.name;
          result.sections[sectionName] = {
            directory: sectionName,
            files: [],
            subsections: {}
          };

          // Get all files in this section
          const files = await this.multiManifest.findFiles(sectionName);

          // Separate root files from subsection files
          for (const fileInfo of files) {
            if (!fileInfo.subsection) {
              // Direct section file
              result.sections[sectionName].files.push(fileInfo.filename + '.md');
              result.totalFiles++;
            } else {
              // File in a subsection (could be nested deeply)
              // Extract the top-level subsection from the path
              const subsectionParts = fileInfo.subsection.split(/[\/\\]/);
              const topLevelSubsection = subsectionParts[0];

              if (!result.sections[sectionName].subsections[topLevelSubsection]) {
                result.sections[sectionName].subsections[topLevelSubsection] = {
                  directory: topLevelSubsection,
                  files: []
                };
              }
              // Include the relative path to show nested structure
              const displayPath = subsectionParts.length > 1
                ? `${subsectionParts.slice(1).join('/')}/${fileInfo.filename}.md`
                : `${fileInfo.filename}.md`;
              result.sections[sectionName].subsections[topLevelSubsection].files.push(displayPath);
              result.totalFiles++;
            }
          }
        }
      } else {
        // List files in specific section
        const sections = await this.multiManifest.listSections();
        const sectionNames = sections.map(s => s.name);

        // Prefer exact match
        let matchedSection = sectionNames.find(s => s === section);
        if (!matchedSection) {
          matchedSection = this.fuzzyMatch(sectionNames, section);
        }

        if (!matchedSection) {
          throw new Error(`Section '${section}' not found`);
        }

        if (subsection) {
          // List files in specific subsection
          const subsections = await this.multiManifest.listSubsections(matchedSection);
          const matchedSubsection = this.fuzzyMatch(subsections.map(s => s.name), subsection);

          if (!matchedSubsection) {
            throw new Error(`Subsection '${subsection}' not found in section '${matchedSection}'`);
          }

          const files = await this.multiManifest.findFiles(matchedSection, matchedSubsection);
          const mdFiles = files.map(f => f.filename + '.md');

          result.sections[matchedSection] = {
            subsections: {
              [matchedSubsection]: {
                directory: matchedSubsection,
                files: mdFiles
              }
            },
            files: []
          };
          result.totalFiles = mdFiles.length;
        } else {
          // List all files and subsections in the section
          result.sections[matchedSection] = {
            directory: matchedSection,
            files: [],
            subsections: {}
          };

          const files = await this.multiManifest.findFiles(matchedSection);
          const subsections = await this.multiManifest.listSubsections(matchedSection);

          // Process all files using the subsection field from fileInfo
          for (const fileInfo of files) {
            if (!fileInfo.subsection) {
              // Direct section file
              result.sections[matchedSection].files.push(fileInfo.filename + '.md');
              result.totalFiles++;
            } else {
              // File in a subsection (could be nested deeply)
              const subsectionParts = fileInfo.subsection.split(/[\/\\]/);
              const topLevelSubsection = subsectionParts[0];

              if (!result.sections[matchedSection].subsections[topLevelSubsection]) {
                result.sections[matchedSection].subsections[topLevelSubsection] = {
                  directory: topLevelSubsection,
                  files: []
                };
              }
              // Include the relative path to show nested structure
              const displayPath = subsectionParts.length > 1
                ? `${subsectionParts.slice(1).join('/')}/${fileInfo.filename}.md`
                : `${fileInfo.filename}.md`;
              result.sections[matchedSection].subsections[topLevelSubsection].files.push(displayPath);
              result.totalFiles++;
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
        output.push(`Files in ${section}:\n`);
      }

      for (const [sectionName, sectionData] of Object.entries(result.sections)) {
        // We always process because when section is specified, result.sections
        // only contains the matched section
        if (true) {
          if (section && subsection && sectionData.subsections[subsection]) {
            // Show specific subsection
            for (const file of sectionData.subsections[subsection].files) {
              output.push(`  - ${file.replace('.md', '')}`);
            }
          } else if (!subsection) {
            // Show section with all subsections
            output.push(`\n${sectionName}:`);

            if (sectionData.files.length > 0) {
              for (const file of sectionData.files) {
                output.push(`  - ${file.replace('.md', '')}`);
              }
            }

            for (const [subName, subData] of Object.entries(sectionData.subsections)) {
              output.push(`  ${subName}:`);
              for (const file of subData.files) {
                output.push(`    - ${file.replace('.md', '')}`);
              }
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

  async handleInspect() {
    try {
      const templatePath = this.getTemplatePath();

      // Read template
      let template = '';
      try {
        template = await fs.readFile(templatePath, 'utf8');
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: 'No template found for this project. Use `add` to start building your persona.'
          }]
        };
      }

      const lines = template.split('\n');
      const references = [];

      // Parse all @ references
      for (const line of lines) {
        if (line.trim().startsWith('@')) {
          const refPath = line.trim().substring(1);

          // Extract section from path
          const manifestMatch = refPath.match(/\/manifest\/([^\/]+)/);
          if (manifestMatch) {
            const sectionDir = manifestMatch[1];

            // Determine if SLOT or LIST
            const isSlot = /^\d{3}_/.test(sectionDir) && !sectionDir.endsWith('_list');
            const isList = sectionDir.endsWith('_list');

            references.push({
              path: refPath,
              section: sectionDir,
              type: isSlot ? 'SLOT' : (isList ? 'LIST' : 'UNKNOWN')
            });
          }
        }
      }

      if (references.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'Template is empty. Use `add` to start building your persona.'
          }]
        };
      }

      // Group by section
      const grouped = {};
      for (const ref of references) {
        if (!grouped[ref.section]) {
          grouped[ref.section] = {
            type: ref.type,
            files: []
          };
        }
        // Extract filename from path
        const filename = path.basename(ref.path, '.md');
        grouped[ref.section].files.push(filename);
      }

      // Format output
      const projectPath = process.cwd();
      const projectName = this.getProjectDirName();

      let output = [`Current Template (${projectName}):\n`];

      for (const [section, data] of Object.entries(grouped)) {
        const sectionName = section.replace(/^\d{3}_/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const typeLabel = data.type === 'SLOT' ? ' (SLOT - only one active)' : (data.type === 'LIST' ? ' (LIST - accumulates)' : '');

        output.push(`\n# ${sectionName}${typeLabel}`);
        for (const file of data.files) {
          output.push(`  @${file}`);
        }
      }

      output.push(`\n\nTotal: ${references.length} active references`);
      output.push(`\nSLOT sections: Only one file can be active at a time (adding removes previous)`);
      output.push(`LIST sections: Multiple files accumulate (adding keeps existing files)`);

      return {
        content: [{
          type: 'text',
          text: output.join('\n')
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error inspecting template: ${error.message}`
        }]
      };
    }
  }
}