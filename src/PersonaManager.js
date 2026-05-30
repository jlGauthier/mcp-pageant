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

  constructor(baseDir, options = {}) {
    super();
    this.baseDir = baseDir;
    this.testMode = options.testMode || false;

    const manifestDirs = process.env.MANIFEST_DIRS ?
      process.env.MANIFEST_DIRS.split(',').map(dir =>
        path.resolve(baseDir, dir.trim())
      ) :
      [path.join(baseDir, 'manifest')];

    this.multiManifest = new MultiManifest(manifestDirs);
    this.manifestDirs = manifestDirs;

    this.variables = {};
    this.variablesLoaded = this.loadVariables();

    this._sectionMapCache = null;
    this.sectionMapInitialized = this.buildSectionMap();
  }

  // Load global default variables. Per-project vars come from
  // <projectPath>/pageant.template.md and are merged in compilePersona().
  async loadVariables() {
    this.variables = {};

    for (const manifestDir of this.manifestDirs) {
      try {
        const manifestVarsPath = path.join(manifestDir, 'default_vars.txt');
        const manifestContent = await fs.readFile(manifestVarsPath, 'utf8');
        this.parseVariables(manifestContent);
        console.log(`Loaded variables from ${manifestVarsPath}`);
      } catch {
        // missing default_vars.txt is fine
      }
    }
  }

  async loadProjectVariables(projectPath) {
    const templatePath = this.getTemplatePath(projectPath);
    try {
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const templateVars = this.extractVariablesFromTemplate(templateContent);
      this.parseVariables(templateVars);
    } catch {
      // No template yet
    }
  }

  extractVariablesFromTemplate(templateContent) {
    // Extract variables from top of template (before first @ line)
    // Variable lines match: ALPHANUMERIC_KEY=value (e.g., AGENT_NAME=Grey)
    // Skip inline override lines which start with digits (e.g., "005 - jobs/file_name: content")
    const lines = templateContent.split('\n');
    const varLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('@')) {
        // Hit first reference, stop parsing vars
        break;
      }
      // Skip inline override lines (format: "NNN.NNN - path: content")
      if (/^\d+/.test(trimmed) && trimmed.includes(' - ')) {
        continue;
      }
      if (trimmed && !trimmed.startsWith('#')) {
        // Variable lines must be IDENTIFIER=value format
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) {
          varLines.push(line);
        }
      }
    }

    return varLines.join('\n');
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

  /**
   * Extract $VAR=value lines from component content.
   * These are variable declarations at the top of component files.
   * Returns an object with { variables: {key: value}, cleanedContent: string }
   */
  extractComponentVariables(content) {
    const lines = content.split('\n');
    const variables = {};
    const cleanedLines = [];
    let pastPreamble = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Once we hit a # header or @ dependency, we're past the preamble
      if (trimmed.startsWith('#') || trimmed.startsWith('@')) {
        pastPreamble = true;
      }

      // Only parse $VAR=value lines in the preamble
      if (!pastPreamble && trimmed.startsWith('$') && trimmed.includes('=')) {
        const withoutPrefix = trimmed.substring(1); // Remove $
        const eqIndex = withoutPrefix.indexOf('=');
        if (eqIndex > 0) {
          const key = withoutPrefix.substring(0, eqIndex).trim();
          const value = withoutPrefix.substring(eqIndex + 1).trim();
          if (key && value) {
            variables[key] = value;
            continue; // Don't add to cleaned lines
          }
        }
      }

      cleanedLines.push(line);
    }

    return {
      variables,
      cleanedContent: cleanedLines.join('\n')
    };
  }

  substituteVariables(text) {
    let result = text;
    for (const [key, value] of Object.entries(this.variables)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\$\\{${escapedKey}\\}`, 'g');
      result = result.replace(pattern, value);
    }
    return result;
  }

  // Write AGENT_NAME as HTML comment to CLAUDE.local.md for proxy variable extraction
  async writeAgentName(targetDir = null) {
    if (this.testMode) {
      return;
    }

    const agentName = this.variables['AGENT_NAME'];
    if (!agentName) {
      return; // No AGENT_NAME variable defined
    }

    if (!targetDir) throw new Error('writeAgentName requires targetDir');
    const claudeLocalPath = path.join(targetDir, 'CLAUDE.local.md');
    try {
      let content = await fs.readFile(claudeLocalPath, 'utf8');
      const comment = `<!-- AGENT_NAME: ${agentName} -->`;

      if (content.match(/<!--\s*AGENT_NAME:/)) {
        content = content.replace(/<!--\s*AGENT_NAME:\s*.+?\s*-->/, comment);
      } else {
        content = `${comment}\n\n${content}`;
      }

      await fs.writeFile(claudeLocalPath, content, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      console.error('Error writing AGENT_NAME:', error);
      throw error;
    }
  }

  // Write AGENT_JOB as HTML comment to CLAUDE.local.md.
  // Falls back to deriving from the agent directory name suffix (e.g. red_fs → fs).
  async writeAgentJob(targetDir = null) {
    if (this.testMode) return;
    if (!targetDir) throw new Error('writeAgentJob requires targetDir');

    let job = this.variables['AGENT_JOB'];
    if (!job || job === 'general') {
      const dirName = path.basename(targetDir);
      const underIdx = dirName.indexOf('_');
      if (underIdx > 0) {
        job = dirName.slice(underIdx + 1);
      }
    }

    const claudeLocalPath = path.join(targetDir, 'CLAUDE.local.md');
    try {
      let content = await fs.readFile(claudeLocalPath, 'utf8');

      if (!job || job === 'general') {
        if (content.match(/<!--\s*AGENT_JOB:/)) {
          content = content.replace(/<!--\s*AGENT_JOB:\s*.+?\s*-->\n?/, '');
          await fs.writeFile(claudeLocalPath, content, 'utf8');
        }
        return;
      }

      const comment = `<!-- AGENT_JOB: ${job} -->`;
      if (content.match(/<!--\s*AGENT_JOB:/)) {
        content = content.replace(/<!--\s*AGENT_JOB:\s*.+?\s*-->/, comment);
      } else {
        const nameMatch = content.match(/<!--\s*AGENT_NAME:\s*.+?\s*-->/);
        if (nameMatch) {
          content = content.replace(nameMatch[0], `${nameMatch[0]}\n${comment}`);
        } else {
          content = `${comment}\n\n${content}`;
        }
      }

      await fs.writeFile(claudeLocalPath, content, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      console.error('Error writing AGENT_JOB:', error);
      throw error;
    }
  }

  // Write AGENT_PROJECT as HTML comment to CLAUDE.local.md.
  // Falls back to deriving from the project directory above .pageant.
  async writeAgentProject(targetDir = null) {
    if (this.testMode) return;
    if (!targetDir) throw new Error('writeAgentProject requires targetDir');

    let project = this.variables['AGENT_PROJECT'];
    if (!project || project === 'standalone') {
      project = this.deriveProjectFromPath(targetDir);
    }

    const claudeLocalPath = path.join(targetDir, 'CLAUDE.local.md');
    try {
      let content = await fs.readFile(claudeLocalPath, 'utf8');

      if (!project || project === 'standalone') {
        if (content.match(/<!--\s*AGENT_PROJECT:/)) {
          content = content.replace(/<!--\s*AGENT_PROJECT:\s*.+?\s*-->\n?/, '');
          await fs.writeFile(claudeLocalPath, content, 'utf8');
        }
        return;
      }

      const comment = `<!-- AGENT_PROJECT: ${project} -->`;
      if (content.match(/<!--\s*AGENT_PROJECT:/)) {
        content = content.replace(/<!--\s*AGENT_PROJECT:\s*.+?\s*-->/, comment);
      } else {
        const jobMatch = content.match(/<!--\s*AGENT_JOB:\s*.+?\s*-->/);
        const nameMatch = content.match(/<!--\s*AGENT_NAME:\s*.+?\s*-->/);
        const anchor = jobMatch || nameMatch;
        if (anchor) {
          content = content.replace(anchor[0], `${anchor[0]}\n${comment}`);
        } else {
          content = `${comment}\n\n${content}`;
        }
      }

      await fs.writeFile(claudeLocalPath, content, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      console.error('Error writing AGENT_PROJECT:', error);
      throw error;
    }
  }

  // Derive the project name from an absolute agent path.
  // For a path like C:\Foo\.pageant\backend → 'foo'.
  // For a flat agent (no .pageant), use the parent directory name.
  deriveProjectFromPath(agentDir) {
    const parts = agentDir.split(/[\\/]/).filter(Boolean);
    const pageantIdx = parts.lastIndexOf('.pageant');
    if (pageantIdx > 0) {
      return parts[pageantIdx - 1].toLowerCase();
    }
    return (parts[parts.length - 1] || 'standalone').toLowerCase();
  }

  getTemplatePath(projectPath) {
    if (!projectPath) throw new Error('getTemplatePath requires projectPath');
    return path.join(projectPath, 'pageant.template.md');
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


  // Parse inline text override
  // Format: SLOT_KEY - virtual/path/name [expires:timestamp]: content text here
  // Example: 040.01 - output/dialect/friendly: Warm conversational tone
  // Example with expiration: 020.5.override - pattern/temp_rule [expires:1762005000000]: Always verify edge cases
  // Note: Newlines in content are escaped as \\n to preserve multiline content during template re-sorts
  parseInlineOverride(line) {
    const match = line.match(/^(\d+(?:\.\d+)*(?:\.\w+)?)\s*-\s*([^:]+?)(?:\s*\[expires:(\d+)\])?\s*:\s*(.+)$/);
    if (!match) return null;

    const expiresAt = match[3] ? parseInt(match[3], 10) : null;

    // Check if expired
    if (expiresAt && Date.now() > expiresAt) {
      return { expired: true, slotKey: match[1] };
    }

    // Unescape newlines in content
    const content = match[4].trim().replace(/\\n/g, '\n');

    return {
      slotKey: match[1],
      virtualPath: match[2].trim(),
      content,
      expiresAt
    };
  }

  // Map section name (from inline path) to directory format for grouping
  // Resolves dynamically from manifest directories (e.g., "main" → "001_main")
  mapSectionNameToDir(sectionName) {
    const lower = sectionName.toLowerCase();
    if (this._sectionMapCache) {
      return this._sectionMapCache[lower] || `000_${sectionName}`;
    }
    return `000_${sectionName}`;
  }

  // Build section name → directory map from manifest structure
  async buildSectionMap() {
    const sections = await this.multiManifest.listSections();
    this._sectionMapCache = {};
    for (const section of sections) {
      // "070_look" → "look" = "070_look"
      const shortName = section.name.replace(/^\d+[_-]/, '').toLowerCase();
      this._sectionMapCache[shortName] = section.name;
    }
  }

  // Process a single component reference: resolve file, extract vars/deps, recurse into deps
  async processComponentRef(refPath, isOverride, fileDataList, refMap, processed) {
    if (processed.has(refPath)) return;
    processed.add(refPath);

    const filePath = await this.multiManifest.resolveReference(`@${refPath}`);
    if (!filePath) {
      console.warn(`File not found: ${refPath}`);
      return;
    }

    let content = await fs.readFile(filePath, 'utf8');

    // Extract and apply $VAR=value declarations from preamble
    // Component vars override defaults — they are identity declarations
    const { variables } = this.extractComponentVariables(content);
    for (const [key, value] of Object.entries(variables)) {
      this.variables[key] = value;
    }

    // Extract @ dependency lines from preamble and process them first
    const deps = await this.multiManifest.extractDependencies(filePath);
    for (const dep of deps) {
      const depRefPath = path.relative(this.baseDir, dep.absolutePath).split(path.sep).join('/');
      const depRef = `./${depRefPath}`;
      const depSlotKey = this.getSlotKey(depRef, dep.isOverride);
      if (depSlotKey && !refMap.has(depSlotKey)) {
        refMap.set(depSlotKey, { path: depRef, isOverride: dep.isOverride });
        await this.processComponentRef(depRef, dep.isOverride, fileDataList, refMap, processed);
      }
    }

    // Now substitute variables (after deps may have added more vars)
    content = this.substituteVariables(content);

    // Clean: remove @ lines and $VAR= preamble lines
    const contentLines = content.split('\n');
    const cleanLines = [];
    let pastPreamble = false;

    for (const cLine of contentLines) {
      const trimmed = cLine.trim();

      if (trimmed.startsWith('#')) {
        pastPreamble = true;
      }

      if (trimmed.startsWith('@')) {
        continue;
      }

      if (!pastPreamble && trimmed.startsWith('$') && trimmed.includes('=')) {
        continue;
      }

      cleanLines.push(cLine);
    }

    const cleanedContent = cleanLines.join('\n').trim();
    const slotKey = this.getSlotKey(refPath, isOverride);
    const filename = path.basename(refPath, '.md');

    fileDataList.push([slotKey, refPath, filename, cleanedContent]);
  }

  // Pure compilation: takes template content, returns formatted persona
  async compileFromTemplate(templateContent) {
    // Ensure variables and section map are loaded
    await this.variablesLoaded;
    await this.sectionMapInitialized;

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
    const processed = new Set();

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
        let refPath = isOverride ? trimmed.substring(2) : trimmed.substring(1);

        // Check for expiration metadata [expires:timestamp]
        const expiresMatch = refPath.match(/^(.+?)\s+\[expires:(\d+)\]$/);
        if (expiresMatch) {
          const expiresAt = parseInt(expiresMatch[2], 10);
          if (Date.now() > expiresAt) {
            // Expired - mark for removal
            const slotKey = this.getSlotKey(expiresMatch[1], isOverride);
            if (slotKey) {
              expiredSlots.push(slotKey);
            }
            continue;
          }
          // Not expired - strip expiration metadata and continue
          refPath = expiresMatch[1];
        }

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

        await this.processComponentRef(refPath, isOverride, fileDataList, refMap, processed);
      }
    }

    // Sort by slot key so sections appear in correct order (001 before 020, etc.)
    fileDataList.sort((a, b) => a[0].localeCompare(b[0]));

    // PHASE 2: Format with look-ahead context
    const formatted = await formatWithContext(fileDataList, this.multiManifest);

    return { formatted, expiredSlots };
  }

  async compilePersona(projectPath) {
    await this.loadVariables();
    await this.loadProjectVariables(projectPath);

    const templatePath = this.getTemplatePath(projectPath);
    const claudeLocalPath = path.join(projectPath, 'CLAUDE.local.md');

    await this.cleanAndSortTemplate(templatePath);

    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch {
      template = '# Persona Configuration\n';
      await fs.writeFile(templatePath, template, 'utf8');
    }

    try {
      const { formatted, expiredSlots } = await this.compileFromTemplate(template);

      if (expiredSlots && expiredSlots.length > 0) {
        for (const slotKey of expiredSlots) {
          await this.removeSlotByKey(templatePath, slotKey);
        }
        console.log(`Removed ${expiredSlots.length} expired component(s): ${expiredSlots.join(', ')}`);
      }

      await fs.writeFile(claudeLocalPath, formatted);

      await this.writeAgentName(projectPath);
      await this.writeAgentJob(projectPath);
      await this.writeAgentProject(projectPath);

      return true;
    } catch (error) {
      console.error('Compilation error:', error);
      throw error;
    }
  }
  async handleAdd({ section, subsection, partial, projectPath }) {
    if (!projectPath) throw new Error('handleAdd requires projectPath');
    const templatePath = this.getTemplatePath(projectPath);

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

              // Build reference path (always use forward slashes for cross-platform compatibility)
              const relativePath = path.relative(this.baseDir, randomFile.path).split(path.sep).join('/');
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

    // Extract and apply component variables ($VAR=value lines)
    try {
      const fileContent = await fs.readFile(fileInfo.path, 'utf8');
      const { variables } = this.extractComponentVariables(fileContent);

      // Apply each variable to the project
      for (const [key, value] of Object.entries(variables)) {
        await this.handleSetVar({ variable: key, value });
        console.log(`Set ${key}=${value} from component ${path.basename(fileInfo.path)}`);
      }
    } catch (error) {
      console.log(`Could not extract component variables: ${error.message}`);
    }

    // If no subsection was specified but the file is in one, use it
    if (!matchedSubsection && fileInfo.subsection) {
      matchedSubsection = fileInfo.subsection.split(/[\/\\]/)[0]; // Get top-level subsection
    }

    // Build reference path (always use forward slashes for cross-platform compatibility)
    const relativePath = path.relative(this.baseDir, fileInfo.path).split(path.sep).join('/');
    const newReference = `@./${relativePath}`;

    // Extract dependencies using MultiManifest
    const deps = await this.multiManifest.extractDependencies(fileInfo.path);

    // Convert to reference paths relative to base, preserving override flag
    const allDependencies = [];
    for (const dep of deps) {
      const relativePath = path.relative(this.baseDir, dep.absolutePath).split(path.sep).join('/');
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
                const oldDepPath = path.relative(this.baseDir, oldDep.absolutePath).split(path.sep).join('/');
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

  /**
   * Adds a component as a temporary inline override with expiration.
   * Used for duration-based component adds.
   * @param {Object} params - { section, subsection, partial, slotKey, expiresAt }
   * @returns {Object} MCP response
   */
  async handleTemporaryAdd({ section, subsection, partial, slotKey, expiresAt, projectPath }) {
    if (!projectPath) throw new Error('handleTemporaryAdd requires projectPath');

    // Use handleAdd logic to resolve and find the file
    const sections = await this.multiManifest.listSections();
    const sectionNames = sections.map(s => s.name);

    let matchedSection = sectionNames.find(s => s === section);
    if (!matchedSection) {
      matchedSection = this.fuzzyMatch(sectionNames, section);
      if (!matchedSection) {
        throw new Error(`No section matching '${section}' found. Available: ${sectionNames.join(', ')}`);
      }
    }

    let matchedSubsection = subsection;
    if (subsection) {
      const subsections = await this.multiManifest.listSubsections(matchedSection);
      const subsectionNames = subsections.map(s => s.name);
      matchedSubsection = this.fuzzyMatch(subsectionNames, subsection);

      if (!matchedSubsection) {
        throw new Error(`No subsection matching '${subsection}' found in ${matchedSection}`);
      }
    }

    // Find the file
    const fileInfo = await this.multiManifest.findFile(matchedSection, matchedSubsection, partial);
    if (!fileInfo) {
      throw new Error(`No file matching '${partial}' found in ${matchedSection}${matchedSubsection ? '/' + matchedSubsection : ''}`);
    }

    // For files with duration, add as override reference with expiration tracking
    const templatePath = this.getTemplatePath(projectPath);

    // Build reference path
    const relativePath = path.relative(this.baseDir, fileInfo.path).replace(/\\/g, '/');

    // Add expiration metadata as comment before the reference
    const expiresPart = expiresAt ? ` [expires:${expiresAt}]` : '';
    const overrideRef = `@@${relativePath}${expiresPart}`;

    // Remove any existing component in this slot
    await this.removeSlotByKey(templatePath, `${slotKey}.override`);

    // Add the override reference to template
    await this.addReferenceToTemplate(templatePath, overrideRef);

    // Compile the persona
    await this.compilePersona(projectPath);

    const fileName = path.basename(fileInfo.path, '.md');

    return {
      content: [{
        type: 'text',
        text: `Added "${fileName}" as override with expiration and compiled persona.`
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

  async removeByLiteralRef(templatePath, refLine) {
    // Remove a template line by exact/fuzzy match (for unnumbered directories)
    let template = '';
    try {
      template = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      return; // No template to clean
    }

    const lines = template.split('\n');
    const cleanedLines = [];
    const targetRef = refLine.trim();

    for (const line of lines) {
      const trimmed = line.trim();
      // Match exact reference or with/without leading @/@@
      if (trimmed === targetRef ||
          trimmed === '@' + targetRef ||
          trimmed === '@@' + targetRef ||
          '@' + trimmed === targetRef ||
          '@@' + trimmed === targetRef) {
        console.log(`Removing literal ref: ${trimmed}`);
        continue;
      }
      cleanedLines.push(line);
    }

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

  async handleRemove({ section, subsection, partial, projectPath }) {
    if (!projectPath) throw new Error('handleRemove requires projectPath');
    const templatePath = this.getTemplatePath(projectPath);

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
      // Build list of candidates with fuzzy scores
      const candidates = [];

      for (const line of lines) {
        const trimmed = line.trim();

        // Check inline overrides
        const inlineOverride = this.parseInlineOverride(trimmed);
        if (inlineOverride && !inlineOverride.expired) {
          // Extract just the filename from virtual path for matching
          const filename = path.basename(inlineOverride.virtualPath, '.md');
          const cleanedPartial = FuzzyMatch.clean(partial);
          const score = FuzzyMatch.score(filename, cleanedPartial);
          if (score > 0.3) {
            candidates.push({ line: trimmed, score, matchTarget: filename });
          }
        }

        // Check file references
        if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
          // Extract filename from path for better matching
          // Example: @./manifest/040_output/01_dialect/component.md → component
          const pathMatch = trimmed.match(/([^/]+)\.md\s*$/);
          if (pathMatch) {
            const filename = pathMatch[1];
            const cleanedPartial = FuzzyMatch.clean(partial);
            const score = FuzzyMatch.score(filename, cleanedPartial);
            if (score > 0.3) {
              candidates.push({ line: trimmed, score, matchTarget: filename });
            }
          }
        }
      }

      if (candidates.length === 0) {
        throw new Error(`File or override matching '${partial}' not found in template`);
      }

      // Use best match
      candidates.sort((a, b) => b.score - a.score);
      filesToRemove.push(candidates[0].line);
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

      // Find matching files and inline overrides in template
      for (const line of lines) {
        const trimmed = line.trim();

        // Check inline overrides — match by virtual path starting with section name
        const inlineOverride = this.parseInlineOverride(trimmed);
        if (inlineOverride && !inlineOverride.expired) {
          const pathParts = inlineOverride.virtualPath.split('/');
          if (pathParts[0] === section) {
            if (!matchedSubsection || (pathParts.length > 1 && pathParts[1] === matchedSubsection)) {
              filesToRemove.push(trimmed);
            }
          }
        }

        // Check file references
        if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
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
          const depPath = path.relative(this.baseDir, dep.absolutePath).split(path.sep).join('/');
          const depSlotKey = this.getSlotKey(depPath, dep.isOverride || false);

          if (depSlotKey) {
            await this.removeSlotByKey(templatePath, depSlotKey);
            totalDepsRemoved++;
          } else {
            // Unnumbered dependency - remove by literal reference
            const depRef = (dep.isOverride ? '@@' : '@') + './' + depPath;
            await this.removeByLiteralRef(templatePath, depRef);
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
      } else {
        // Unnumbered directory - remove by literal reference line
        await this.removeByLiteralRef(templatePath, fileRef);
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

  async handleTalent({ talent_name, time_minutes = 5, projectPath }) {
    if (!projectPath) throw new Error('handleTalent requires projectPath');

    // Add the talent from 015_talents section
    const addResult = await this.handleAdd({
      section: '015_talents',
      subsection: null,
      partial: talent_name,
      projectPath
    });

    // Set up timer to auto-remove
    const timeoutMs = time_minutes * 60 * 1000;
    setTimeout(async () => {
      try {
        await this.handleRemove({
          section: '015_talents',
          subsection: null,
          partial: talent_name,
          projectPath
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


  async handleSetVar({ variable, value, projectPath }) {
    if (!projectPath) throw new Error('handleSetVar requires projectPath');
    const templatePath = this.getTemplatePath(projectPath);

    // Load existing template or start with empty
    let templateContent = '';
    try {
      templateContent = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      // No existing template, start fresh
      templateContent = '';
    }

    // Split into variable section and references section
    const lines = templateContent.split('\n');
    const varLines = [];
    const refLines = [];
    let inRefs = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('@')) {
        inRefs = true;
      }

      if (inRefs) {
        refLines.push(line);
      } else {
        varLines.push(line);
      }
    }

    // Update or add variable in var section
    const newVarLines = [];
    let found = false;

    for (const line of varLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key] = trimmed.split('=');
        if (key && key.trim() === variable) {
          newVarLines.push(`${variable}=${value}`);
          found = true;
        } else {
          newVarLines.push(line);
        }
      } else {
        newVarLines.push(line);
      }
    }

    // If variable wasn't found, add it to var section
    if (!found) {
      // Remove trailing empty lines from var section
      while (newVarLines.length > 0 && newVarLines[newVarLines.length - 1].trim() === '') {
        newVarLines.pop();
      }
      newVarLines.push(`${variable}=${value}`);
      newVarLines.push(''); // Blank line before refs
    }

    // Rebuild template
    const newTemplate = [...newVarLines, ...refLines].join('\n');

    await fs.writeFile(templatePath, newTemplate);
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

  async handleInspect(projectPath) {
    if (!projectPath) {
      throw new Error(`handleInspect requires projectPath. Got: ${projectPath}`);
    }
    try {
      const templatePath = this.getTemplatePath(projectPath);

      // Trigger compilation to clean expired components before reading template
      await this.compilePersona(projectPath);

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

      // Parse all @ and @@ references AND inline overrides
      for (const line of lines) {
        const trimmed = line.trim();

        // Check for inline overrides first (format: "010.1 - section/sub/name: content")
        const inlineOverride = this.parseInlineOverride(trimmed);
        if (inlineOverride && !inlineOverride.expired) {
          // Extract section from virtual path (e.g., "tech/sub/name" -> "010_tech")
          const pathParts = inlineOverride.virtualPath.split('/');
          const sectionName = pathParts[0] || 'inline';
          // Map section name to section directory format
          const sectionDir = this.mapSectionNameToDir(sectionName);

          references.push({
            path: inlineOverride.virtualPath,
            section: sectionDir,
            slotKey: inlineOverride.slotKey,
            isOverride: false,
            isInline: true,
            content: inlineOverride.content
          });
          continue;
        }

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
          isOverride: ref.isOverride,
          isInline: ref.isInline || false,
          content: ref.content
        });
      }

      const projectName = path.basename(projectPath);
      let output = [`Current Template (${projectName}):\n`];

      for (const [section, files] of Object.entries(grouped)) {
        const sectionName = section.replace(/^\d{3}_/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        output.push(`\n# ${sectionName}`);
        for (const file of files) {
          if (file.isInline) {
            // Format inline override with truncated content preview
            const preview = file.content.length > 40
              ? file.content.substring(0, 40) + '...'
              : file.content;
            output.push(`  ${file.filename} [slot: ${file.slotKey}] (inline: "${preview}")`);
          } else {
            const prefix = file.isOverride ? '@@' : '@';
            output.push(`  ${prefix}${file.filename} [slot: ${file.slotKey}]`);
          }
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

  async handleThrift({ slot_key, virtual_path, content, expiresAt, projectPath }) {
    if (!projectPath) throw new Error('handleThrift requires projectPath');
    const templatePath = this.getTemplatePath(projectPath);

    // Escape newlines in content to preserve multiline content during template re-sorts
    const escapedContent = content.replace(/\n/g, '\\n');

    // Build the inline override line with optional expiration
    const expiresPart = expiresAt ? ` [expires:${expiresAt}]` : '';
    const inlineLine = `${slot_key} - ${virtual_path}${expiresPart}: ${escapedContent}`;

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
