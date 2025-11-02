import fs from 'fs/promises';
import path from 'path';
import { PersonaCore } from './persona-core.js';
import { MultiManifest } from './MultiManifest.js';
import { FuzzyMatch } from './FuzzyMatch.js';
import { formatMarkdown, formatWithContext } from './formatMarkdown.js';
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

    // Override for web editor project switching
    this.overrideProjectDirName = null;

    // Cache project directory name - calculated once at startup
    this.projectDirName = null;
    this.projectDirNameInitialized = this.initializeProjectDirName();
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
  // Generate lowercase path-based ID from a directory path
  generatePathId(projectPath) {
    const pathParts = projectPath
      .toLowerCase()
      .replace(/^[a-z]:/, (match) => match[0])
      .split(/[\\\/]/)
      .filter(part => part.length > 0);
    return pathParts.join('--');
  }

  // Extract PAGEANT_ID from CLAUDE.local.md
  async extractPageantId() {
    try {
      const claudeLocalPath = path.join(process.cwd(), 'CLAUDE.local.md');
      const content = await fs.readFile(claudeLocalPath, 'utf8');
      const match = content.match(/<!--\s*PAGEANT_ID:\s*(.+?)\s*-->/);
      return match ? match[1].trim() : null;
    } catch (error) {
      // CLAUDE.local.md doesn't exist yet
      return null;
    }
  }

  // Write PAGEANT_ID to CLAUDE.local.md
  async writePageantId(id) {
    const claudeLocalPath = path.join(process.cwd(), 'CLAUDE.local.md');
    try {
      let content = await fs.readFile(claudeLocalPath, 'utf8');

      // Check if ID already exists
      if (content.match(/<!--\s*PAGEANT_ID:/)) {
        // Replace existing ID
        content = content.replace(
          /<!--\s*PAGEANT_ID:\s*.+?\s*-->/,
          `<!-- PAGEANT_ID: ${id} -->`
        );
      } else {
        // Prepend ID to top of file
        content = `<!-- PAGEANT_ID: ${id} -->\n\n${content}`;
      }

      await fs.writeFile(claudeLocalPath, content, 'utf8');
    } catch (error) {
      console.error('Error writing PAGEANT_ID:', error);
      throw error;
    }
  }

  // Find plan directory with case-insensitive matching
  async findPlanDirectory(targetId) {
    try {
      const entries = await fs.readdir(this.plansDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.toLowerCase() === targetId.toLowerCase()) {
          return entry.name; // Return actual directory name (preserves case)
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // Initialize project directory name once at startup
  async initializeProjectDirName() {
    const currentPath = process.cwd();
    const currentPathId = this.generatePathId(currentPath);

    // Try to read existing ID from CLAUDE.local.md
    const existingId = await this.extractPageantId();

    if (!existingId) {
      // No ID exists - check if a plan directory exists with case-insensitive match
      const matchingDir = await this.findPlanDirectory(currentPathId);
      if (matchingDir) {
        // Found existing directory with different case - use it
        await this.writePageantId(currentPathId);
        this.projectDirName = matchingDir;
        return;
      }
      // No existing directory - new project, use current path ID
      await this.writePageantId(currentPathId);
      this.projectDirName = currentPathId;
      return;
    }

    if (existingId.toLowerCase() === currentPathId.toLowerCase()) {
      // ID matches current path (case-insensitive) - find actual directory
      const matchingDir = await this.findPlanDirectory(currentPathId);
      this.projectDirName = matchingDir || currentPathId;
      return;
    }

    // ID doesn't match current path - detect move or copy
    // Try case-insensitive lookup for old ID
    const oldPlanDir = await this.findPlanDirectory(existingId);
    const oldTemplateExists = oldPlanDir ?
      await fs.access(path.join(this.plansDir, oldPlanDir, 'template.md')).then(() => true).catch(() => false) :
      false;

    if (oldTemplateExists) {
      // Old template exists - this is a MOVE
      const oldPlanPath = path.join(this.plansDir, oldPlanDir);
      const newPlanPath = path.join(this.plansDir, currentPathId);

      // Move the entire plan directory
      await fs.rename(oldPlanPath, newPlanPath);

      // Update ID in CLAUDE.local.md
      await this.writePageantId(currentPathId);

      console.error(`[Pageant] Moved plan: ${oldPlanDir} → ${currentPathId}`);
      this.projectDirName = currentPathId;
      return;
    } else {
      // Old template doesn't exist - this is a COPY or orphaned ID
      // Check if current path already has a directory
      const matchingDir = await this.findPlanDirectory(currentPathId);
      if (matchingDir) {
        await this.writePageantId(currentPathId);
        this.projectDirName = matchingDir;
        return;
      }

      // Create new plan directory with current path ID
      await this.writePageantId(currentPathId);

      console.error(`[Pageant] New instance: ${currentPathId} (previous ID: ${existingId})`);
      this.projectDirName = currentPathId;
      return;
    }
  }

  getProjectDirName() {
    // Check for web editor override first
    if (this.overrideProjectDirName) {
      return this.overrideProjectDirName;
    }
    return this.projectDirName;
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
  // Extract slot key from a reference path
  // Slot key = all numbered path components joined with dots
  // Examples:
  //   001_main/engineer.md                    -> "001"
  //   040_output/01_dialect/technical.md      -> "040.01"
  //   030_jobs/01_backend/05_database.md      -> "030.01.05"
  // Override syntax (@@) appends .override:
  //   @@./manifest/040_output/02_narration/casual.md -> "040.02.override"
  getSlotKey(refPath, isOverride = false) {
    const parts = refPath.split('/');
    const numberedParts = [];

    for (const part of parts) {
      // Match directories/files that start with numbers
      const match = part.match(/^(\d+)[_-]/);
      if (match) {
        numberedParts.push(match[1]);
      }
    }

    if (numberedParts.length === 0) {
      return null;
    }

    const baseKey = numberedParts.join('.');
    return isOverride ? `${baseKey}.override` : baseKey;
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

    // Extract all @ and @@ references and inline overrides
    for (const line of lines) {
      const trimmed = line.trim();

      // Check for inline text override
      const inlineOverride = this.parseInlineOverride(trimmed);
      if (inlineOverride) {
        references.push({
          slotKey: inlineOverride.slotKey,
          line: trimmed,
          isInline: true
        });
        continue;
      }

      if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
        const isOverride = trimmed.startsWith('@@');
        const refToValidate = isOverride ? '@' + trimmed.substring(2) : trimmed;

        const validation = this.multiManifest.validatePath(refToValidate);

        // Log any warnings
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(w => console.warn(w));
        }

        if (validation.valid && validation.parsed) {
          const fullPath = validation.cleanedPath.substring(1); // Remove @
          references.push({
            manifestRelative: validation.parsed.manifestRelative,
            fullPath: fullPath,
            line: isOverride ? '@' + validation.cleanedPath : validation.cleanedPath, // Use cleaned path with proper prefix
            isOverride: isOverride
          });
        }
      } else {
        nonRefs.push(line);
      }
    }

    // Sort by slot key for predictable ordering
    references.sort((a, b) => {
      // For inline overrides, use stored slot key; for files, compute from path
      const slotA = a.isInline ? a.slotKey : (this.getSlotKey(a.fullPath, a.isOverride) || '');
      const slotB = b.isInline ? b.slotKey : (this.getSlotKey(b.fullPath, b.isOverride) || '');

      // Compare slot keys (e.g., "001" < "010" < "010.01" < "040" < "040.override")
      if (slotA && slotB) {
        return slotA.localeCompare(slotB, undefined, { numeric: true });
      }

      // Files without slot keys sort by path (inline overrides always have slots)
      if (!a.isInline && !b.isInline) {
        return a.manifestRelative.localeCompare(b.manifestRelative);
      }

      return 0;
    });

    // Process sorted refs, dropping slot collisions
    const finalRefs = [];
    const occupiedSlots = new Set();

    for (const ref of references) {
      const slotKey = ref.isInline ? ref.slotKey : this.getSlotKey(ref.fullPath, ref.isOverride);

      if (slotKey && occupiedSlots.has(slotKey)) {
        // Slot collision - skip this ref (already have something in this slot)
        const identifier = ref.isInline ? ref.line : ref.fullPath;
        console.warn(`Slot collision: ${slotKey} already occupied, skipping ${identifier}`);
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
        const knownSections = ['Main', 'Pattern List', 'Output', 'User', 'End'];
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
          currentSubSection = title;
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
        // Skip ## Narration if it appears under wrong section
        if (level === 2 && currentMainSection === 'Pattern List' && title === 'Narration') {
          continue; // Skip ## Narration under Pattern List
        }

        previousHeader = { level, title };
      } else {
        previousHeader = null;
      }

      finalFormatted.push(line);
    }

    return finalFormatted.join('\n');
  }

  // Parse inline text override
  // Format: SLOT_KEY - virtual/path/name [expires:timestamp]: content text here
  // Example: 040.01 - output/dialect/friendly: Warm conversational tone
  // Example with expiration: 020.5.override - pattern/temp_rule [expires:1762005000000]: Always verify edge cases
  parseInlineOverride(line) {
    const match = line.match(/^(\d+(?:\.\d+)*(?:\.\w+)?)\s*-\s*([^:]+?)(?:\s*\[expires:(\d+)\])?\s*:\s*(.+)$/);
    if (!match) return null;

    const expiresAt = match[3] ? parseInt(match[3], 10) : null;

    // Check if expired
    if (expiresAt && Date.now() > expiresAt) {
      return { expired: true, slotKey: match[1] };
    }

    return {
      slotKey: match[1],
      virtualPath: match[2].trim(),
      content: match[4].trim(),
      expiresAt
    };
  }

  // Pure compilation: takes template content, returns formatted persona
  async compileFromTemplate(templateContent) {
    // Ensure variables are loaded
    await this.variablesLoaded;

    const lines = templateContent.split('\n');

    // Track expired items to remove from template
    const expiredSlots = [];

    // Build a map of all references: slot key -> { path, isOverride, inline }
    const refMap = new Map();
    for (const line of lines) {
      const trimmed = line.trim();

      // Check for inline text override first
      const inlineOverride = this.parseInlineOverride(trimmed);
      if (inlineOverride) {
        if (inlineOverride.expired) {
          // Mark for removal
          expiredSlots.push(inlineOverride.slotKey);
          continue;
        }

        refMap.set(inlineOverride.slotKey, {
          inline: true,
          virtualPath: inlineOverride.virtualPath,
          content: inlineOverride.content
        });
        continue;
      }

      if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
        const isOverride = trimmed.startsWith('@@');
        const refPath = isOverride ? trimmed.substring(2) : trimmed.substring(1);

        if (!refPath.endsWith('/')) {
          const slotKey = this.getSlotKey(refPath, isOverride);
          if (slotKey) {
            refMap.set(slotKey, { path: refPath, isOverride });
          }
        }
      }
    }

    // PHASE 1: Collect all file data [slotKey, fullPath, filename, content]
    const fileDataList = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') && !trimmed.startsWith('@')) {
        continue;
      }

      // Handle inline text overrides
      const inlineOverride = this.parseInlineOverride(trimmed);
      if (inlineOverride) {
        // Skip expired overrides
        if (inlineOverride.expired) {
          continue;
        }

        // Extract filename from virtual path (last component)
        const pathParts = inlineOverride.virtualPath.split('/');
        const filename = pathParts[pathParts.length - 1];

        // Add to file data list with virtual path as fullPath
        fileDataList.push([
          inlineOverride.slotKey,
          inlineOverride.virtualPath,
          filename,
          inlineOverride.content
        ]);
        continue;
      }

      if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
        const isOverride = trimmed.startsWith('@@');
        const refPath = isOverride ? trimmed.substring(2) : trimmed.substring(1);

        if (refPath.endsWith('/')) {
          continue;
        }

        // Check if this is a base file that has an override
        if (!isOverride) {
          const baseSlotKey = this.getSlotKey(refPath);
          const overrideSlotKey = baseSlotKey ? `${baseSlotKey}.override` : null;

          if (overrideSlotKey && refMap.has(overrideSlotKey)) {
            console.log(`Skipping base file ${refPath} - override exists`);
            continue;
          }
        }

        const filePath = await this.multiManifest.resolveReference(`@${refPath}`);
        if (!filePath) {
          console.warn(`File not found: ${refPath}`);
          continue;
        }

        try {
          let content = await fs.readFile(filePath, 'utf8');
          content = this.substituteVariables(content);

          // Remove dependency lines only
          const contentLines = content.split('\n');
          const cleanLines = [];

          for (const cLine of contentLines) {
            if (cLine.trim().startsWith('@')) {
              continue;
            }
            cleanLines.push(cLine);
          }

          const cleanedContent = cleanLines.join('\n').trim();
          const slotKey = this.getSlotKey(refPath, isOverride);
          const filename = path.basename(refPath, '.md');

          fileDataList.push([slotKey, refPath, filename, cleanedContent]);
        } catch (error) {
          console.error(`ERROR: Could not read required file: ${refPath}`);
          throw new Error(`Template references missing file: ${refPath}`);
        }
      }
    }

    // PHASE 2: Format with look-ahead context
    const formatted = await formatWithContext(fileDataList, this.multiManifest);

    return { formatted, expiredSlots };
  }

  async compilePersona(projectPath) {
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
      const { formatted: formattedContent, expiredSlots } = await this.compileFromTemplate(template);

      // Remove expired slots from template
      if (expiredSlots && expiredSlots.length > 0) {
        for (const slotKey of expiredSlots) {
          await this.removeSlotByKey(templatePath, slotKey);
        }
        console.log(`Removed ${expiredSlots.length} expired component(s): ${expiredSlots.join(', ')}`);
      }

      // Write formatted persona to plans directory (for backup/reference)
      await fs.writeFile(personaPath, formattedContent);

      // Write the formatted persona directly to CLAUDE.local.md for real-time updates
      await fs.writeFile(claudeLocalPath, formattedContent);

      // Add PAGEANT_ID to CLAUDE.local.md
      await this.writePageantId(this.projectDirName);

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

    // Extract dependencies using MultiManifest
    const deps = await this.multiManifest.extractDependencies(fileInfo.path);

    // Convert to reference paths relative to base, preserving override flag
    const allDependencies = [];
    for (const dep of deps) {
      const relativePath = path.relative(this.baseDir, dep.absolutePath).replace(/\\/g, '/');
      allDependencies.push({
        path: `./${relativePath}`,
        isOverride: dep.isOverride || false
      });
    }

    // Check if this is a SLOT directory or subsection
    // IMPORTANT: We need to remove dependencies from the OLD file before adding new ones
    // Get slot key for the main file we're adding
    const mainSlotKey = this.getSlotKey(relativePath);

    // Read template to find existing file in this slot
    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      // No template exists, nothing to remove
    }

    // Check if there's an existing file in this slot that has dependencies we need to remove
    if (template && mainSlotKey) {
      const lines = template.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('@')) {
          const refPath = line.trim().substring(1); // Remove @
          const refSlotKey = this.getSlotKey(refPath);

          if (refSlotKey === mainSlotKey) {
            // Found existing file in this slot - remove its dependencies first
            const absoluteOldPath = path.join(this.baseDir, refPath.replace(/^\.\//, ''));

            try {
              const oldDeps = await this.multiManifest.extractDependencies(absoluteOldPath);

              // Remove each old dependency's slot (with correct override flag)
              for (const oldDep of oldDeps) {
                const oldDepPath = path.relative(this.baseDir, oldDep.absolutePath).replace(/\\/g, '/');
                const oldDepSlotKey = this.getSlotKey(oldDepPath, oldDep.isOverride || false);

                if (oldDepSlotKey) {
                  await this.removeSlotByKey(templatePath, oldDepSlotKey);
                }
              }
            } catch (error) {
              // Old file might not exist anymore, that's ok
              console.log(`Could not extract dependencies from old file: ${error.message}`);
            }
            break; // Only one file per slot
          }
        }
      }
    }

    // Remove existing file in this slot
    if (mainSlotKey) {
      await this.removeSlotByKey(templatePath, mainSlotKey);
    }

    // Add all dependencies first
    // For overrides (@@), DON'T remove base files - they should coexist
    // For base files (@), remove existing base files in same slot
    for (const dep of allDependencies) {
      const depSlotKey = this.getSlotKey(dep.path, dep.isOverride);

      if (depSlotKey) {
        // Only remove the exact slot we're adding to (not base when adding override)
        await this.removeSlotByKey(templatePath, depSlotKey);
      }

      const prefix = dep.isOverride ? '@@' : '@';
      await this.addReferenceToTemplate(templatePath, `${prefix}${dep.path}`);
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

  async removeSlotByKey(templatePath, slotKey) {
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
      const trimmed = line.trim();

      // Check for inline text override
      const inlineOverride = this.parseInlineOverride(trimmed);
      if (inlineOverride && inlineOverride.slotKey === slotKey) {
        // Skip this line - it's in the same slot we're replacing
        const pathInfo = inlineOverride.expired ? '(expired)' : inlineOverride.virtualPath;
        console.log(`Removing slot ${slotKey}: ${pathInfo}`);
        continue;
      }

      if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
        const isOverride = trimmed.startsWith('@@');
        const refPath = isOverride ? trimmed.substring(2) : trimmed.substring(1); // Remove @ or @@
        const refSlotKey = this.getSlotKey(refPath, isOverride);

        if (refSlotKey === slotKey) {
          // Skip this line - it's in the same slot we're replacing
          console.log(`Removing slot ${slotKey}: ${refPath}`);
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
      // Find specific file or inline override by partial name in template
      for (const line of lines) {
        const trimmed = line.trim();

        // Check inline overrides
        const inlineOverride = this.parseInlineOverride(trimmed);
        if (inlineOverride && !inlineOverride.expired && inlineOverride.virtualPath.includes(partial)) {
          filesToRemove.push(trimmed);
          break;
        }

        // Check file references
        if ((trimmed.startsWith('@@') || trimmed.startsWith('@')) && trimmed.includes(partial)) {
          filesToRemove.push(trimmed);
          break;
        }
      }
      if (filesToRemove.length === 0) {
        throw new Error(`File or override containing '${partial}' not found in template`);
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
        const trimmed = line.trim();
        if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
          // Check if this line matches the section/subsection
          if (trimmed.includes(`/${matchedSection}/`)) {
            if (!matchedSubsection || trimmed.includes(`/${matchedSection}/${matchedSubsection}/`)) {
              filesToRemove.push(trimmed);
            }
          }
        }
      }

      if (filesToRemove.length === 0) {
        throw new Error(`${matchedSubsection ? `${matchedSection}/${matchedSubsection}` : matchedSection} not found in template`);
      }
    }
    
    // Process each file to remove
    let totalDepsRemoved = 0;

    for (const fileRef of filesToRemove) {
      // Check if this is an inline override
      const inlineOverride = this.parseInlineOverride(fileRef);
      if (inlineOverride) {
        // Inline overrides have no dependencies, just remove by slot key
        await this.removeSlotByKey(templatePath, inlineOverride.slotKey);
        continue;
      }

      // Handle file references
      const isOverride = fileRef.startsWith('@@');
      const cleanRef = isOverride ? fileRef.substring(2) : fileRef.substring(1);
      const filePath = cleanRef.replace(/^\.\//, '');
      const absolutePath = path.join(this.baseDir, filePath);

      // Extract and remove dependencies first (with correct override flag)
      try {
        const deps = await this.multiManifest.extractDependencies(absolutePath);

        for (const dep of deps) {
          const depPath = path.relative(this.baseDir, dep.absolutePath).replace(/\\/g, '/');
          const depSlotKey = this.getSlotKey(depPath, dep.isOverride || false);

          if (depSlotKey) {
            await this.removeSlotByKey(templatePath, depSlotKey);
            totalDepsRemoved++;
          }
        }
      } catch (error) {
        // File might not exist, that's ok
        console.log(`Could not extract dependencies: ${error.message}`);
      }

      // Remove the main file's slot
      const mainSlotKey = this.getSlotKey(filePath, isOverride);
      if (mainSlotKey) {
        await this.removeSlotByKey(templatePath, mainSlotKey);
      }
    }

    // Compile the persona
    await this.compilePersona(projectPath);

    const message = partial
      ? `Removed ${partial}` + (totalDepsRemoved > 0 ? ` and ${totalDepsRemoved} dependencies` : '')
      : `Removed ${subsection ? `${section}/${subsection}` : section} (${filesToRemove.length} files)` + (totalDepsRemoved > 0 ? ` and ${totalDepsRemoved} dependencies` : '');

    return {
      content: [
        {
          type: 'text',
          text: `${message} from template and compiled persona.`,
        },
      ],
    };
  }

  async handleTalent({ talent_name, time_minutes = 5 }) {
    const projectPath = process.cwd();

    // Add the talent from 015_talents section
    const addResult = await this.handleAdd({
      section: '015_talents',
      subsection: null,
      partial: talent_name
    });

    // Set up timer to auto-remove
    const timeoutMs = time_minutes * 60 * 1000;
    setTimeout(async () => {
      try {
        await this.handleRemove({
          section: '015_talents',
          subsection: null,
          partial: talent_name
        });
        console.log(`Auto-removed talent: ${talent_name} after ${time_minutes} minutes`);
      } catch (error) {
        console.error(`Failed to auto-remove talent ${talent_name}:`, error.message);
      }
    }, timeoutMs);

    return {
      content: [
        {
          type: 'text',
          text: `Talent '${talent_name}' loaded. Will auto-remove in ${time_minutes} minutes.\n\n${addResult.content[0].text}`,
        },
      ],
    };
  }

  async handleCreate({ section, subsection, filename, secondperson_prompt_from_system_to_assistant }) {
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

    let matchedSubsection = null; // Declare here for use in output formatting

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
          matchedSubsection = this.fuzzyMatch(subsections.map(s => s.name), subsection);

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
          if (section && subsection && sectionData.subsections[matchedSubsection]) {
            // Show specific subsection - use matchedSubsection not subsection
            for (const file of sectionData.subsections[matchedSubsection].files) {
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

      // Parse all @ and @@ references
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
          const isOverride = trimmed.startsWith('@@');
          const refPath = isOverride ? trimmed.substring(2) : trimmed.substring(1);
          const slotKey = this.getSlotKey(refPath, isOverride);

          // Extract section from path for grouping
          const manifestMatch = refPath.match(/\/manifest\/([^\/]+)/);
          if (manifestMatch) {
            const sectionDir = manifestMatch[1];

            references.push({
              path: refPath,
              section: sectionDir,
              slotKey: slotKey || 'none',
              isOverride: isOverride
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
          grouped[ref.section] = [];
        }
        // Extract filename from path
        const filename = path.basename(ref.path, '.md');
        grouped[ref.section].push({
          filename,
          slotKey: ref.slotKey,
          isOverride: ref.isOverride
        });
      }

      // Format output
      const projectPath = process.cwd();
      const projectName = this.getProjectDirName();

      let output = [`Current Template (${projectName}):\n`];

      for (const [section, files] of Object.entries(grouped)) {
        const sectionName = section.replace(/^\d{3}_/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        output.push(`\n# ${sectionName}`);
        for (const file of files) {
          const prefix = file.isOverride ? '@@' : '@';
          output.push(`  ${prefix}${file.filename} [slot: ${file.slotKey}]`);
        }
      }

      output.push(`\n\nTotal: ${references.length} active references`);
      output.push(`\nSlot system: Path depth determines slot granularity`);
      output.push(`  @001_main/file.md               → slot: 001`);
      output.push(`  @040_output/01_dialect/file.md  → slot: 040.01`);
      output.push(`  @@030_jobs/02_engineer/file.md  → slot: 030.02.override (overrides slot 030.02)`);

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

  async handleThrift({ slot_key, virtual_path, content, expiresAt }) {
    const projectPath = process.cwd();
    const templatePath = this.getTemplatePath();
    const projectDir = path.dirname(templatePath);

    // Ensure project directory exists
    await fs.mkdir(projectDir, { recursive: true });

    // Build the inline override line with optional expiration
    const expiresPart = expiresAt ? ` [expires:${expiresAt}]` : '';
    const inlineLine = `${slot_key} - ${virtual_path}${expiresPart}: ${content}`;

    // Remove any existing component in this slot
    await this.removeSlotByKey(templatePath, slot_key);

    // Add the inline override to template
    await this.addReferenceToTemplate(templatePath, inlineLine);

    // Compile the persona
    await this.compilePersona(projectPath);

    // Extract name from virtual path for response
    const pathParts = virtual_path.split('/');
    const name = pathParts[pathParts.length - 1];

    return {
      content: [{
        type: 'text',
        text: `Added inline override "${name}" to slot ${slot_key} and compiled persona.`
      }]
    };
  }
}