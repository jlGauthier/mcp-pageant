import fs from 'fs/promises';
import path from 'path';

export class PersonaCore {
  /**
   * Custom sort function for manifest references
   * Sorts by: section number, subsection number, then filename
   */
  sortReferences(refs) {
    return refs.sort((a, b) => {
      // Extract parts from both paths
      const parseRef = (ref) => {
        // Handle both local format (@./manifest/) and external format (@./../other_manifest/manifest/)
        const parts = ref.split('/');
        const manifestIndex = parts.findIndex(p => p === 'manifest' || p.includes('manifest'));

        if (manifestIndex < 0) return { section: 999, subsection: 999, file: ref };

        const sectionPart = parts[manifestIndex + 1] || '';
        const subsectionPart = parts[manifestIndex + 2] || '';
        const filePart = parts[parts.length - 1] || '';

        // Extract numbers from section (e.g., "001_main" -> 1)
        const sectionMatch = sectionPart.match(/^(\d+)/);
        const sectionNum = sectionMatch ? parseInt(sectionMatch[1]) : 999;

        // Extract numbers from subsection (e.g., "01_dialect" -> 1)
        const subsectionMatch = subsectionPart.match(/^(\d+)/);
        const subsectionNum = subsectionMatch ? parseInt(subsectionMatch[1]) : 999;

        return {
          section: sectionNum,
          subsection: subsectionNum,
          file: filePart,
          sectionName: sectionPart,
          subsectionName: subsectionPart
        };
      };

      const aParsed = parseRef(a);
      const bParsed = parseRef(b);

      // Sort by section number first
      if (aParsed.section !== bParsed.section) {
        return aParsed.section - bParsed.section;
      }

      // Then by subsection number
      if (aParsed.subsection !== bParsed.subsection) {
        return aParsed.subsection - bParsed.subsection;
      }

      // Then by section name (for same numbers)
      if (aParsed.sectionName !== bParsed.sectionName) {
        return aParsed.sectionName.localeCompare(bParsed.sectionName);
      }

      // Then by subsection name
      if (aParsed.subsectionName !== bParsed.subsectionName) {
        return aParsed.subsectionName.localeCompare(bParsed.subsectionName);
      }

      // Finally by filename
      return aParsed.file.localeCompare(bParsed.file);
    });
  }

  /**
   * Get the slot key for a reference path
   * Slot key = all numbered path components joined with dots
   * Examples:
   *   001_main/engineer.md                    -> "001"
   *   040_output/01_dialect/technical.md      -> "040.01"
   *   030_jobs/01_backend/05_database.md      -> "030.01.05"
   */
  getSlotKey(refPath) {
    const parts = refPath.split('/');
    const numberedParts = [];

    for (const part of parts) {
      // Match directories/files that start with numbers
      const match = part.match(/^(\d+)[_-]/);
      if (match) {
        numberedParts.push(match[1]);
      }
    }

    return numberedParts.length > 0 ? numberedParts.join('.') : null;
  }

  /**
   * Extract dependencies from a file
   * Returns array of dependency paths
   */
  async extractDependencies(filePath) {
    const deps = [];
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Dependencies are @ references before the first #
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
          break; // Stop at first header
        }
        if (trimmed.startsWith('@')) {
          deps.push(trimmed);
        }
      }
    } catch (error) {
      // File doesn't exist or can't be read
    }
    return deps;
  }

  /**
   * Add a file and its dependencies to the template
   */
  async addFileToTemplate(templateContent, newReference, filePath) {
    const lines = templateContent.split('\n');
    const fileRefs = [];
    const nonRefs = [];
    
    // Separate existing references from other content
    for (const line of lines) {
      if (line.trim().startsWith('@')) {
        fileRefs.push(line.trim());
      } else {
        nonRefs.push(line);
      }
    }
    
    // Add the new reference
    fileRefs.push(newReference);
    
    // Extract and add dependencies
    const dependencies = await this.extractDependencies(filePath);
    for (const dep of dependencies) {
      if (!fileRefs.includes(dep)) {
        fileRefs.push(dep);
      }
    }
    
    // Sort references using custom sort
    this.sortReferences(fileRefs);

    // Filter slot collisions - keep the winner for each slot key
    const slotWinners = new Map();
    const noSlotRefs = [];

    for (const ref of fileRefs) {
      const slotKey = this.getSlotKey(ref);

      if (!slotKey) {
        // No slot key - keep unique refs
        if (!noSlotRefs.includes(ref)) {
          noSlotRefs.push(ref);
        }
      } else {
        // Has slot key - winner takes the slot
        if (!slotWinners.has(slotKey)) {
          slotWinners.set(slotKey, ref);
        } else if (ref === newReference || dependencies.includes(ref)) {
          // New reference or its dependencies win
          slotWinners.set(slotKey, ref);
        }
      }
    }

    // Combine and sort
    const filteredRefs = [...noSlotRefs, ...slotWinners.values()];
    this.sortReferences(filteredRefs);
    
    // Rebuild template
    const newLines = [];
    let refInserted = false;
    
    for (const line of nonRefs) {
      newLines.push(line);
      if (line.startsWith('# ') && !refInserted) {
        newLines.push('');
        for (const ref of filteredRefs) {
          newLines.push(ref);
          newLines.push('');
        }
        refInserted = true;
      }
    }
    
    if (!refInserted) {
      for (const ref of filteredRefs) {
        newLines.push(ref);
        newLines.push('');
      }
    }
    
    return newLines.join('\n');
  }

  /**
   * Remove a file and its dependencies from template
   * With new slot system: all dependencies have slot keys, we keep dependencies that other files might need
   */
  async removeFileFromTemplate(templateContent, fileToRemove, filePath) {
    const lines = templateContent.split('\n');

    // Get dependencies of the file being removed
    const dependencies = await this.extractDependencies(filePath);

    // For now, just remove the main file
    // Dependencies will be removed by slot collision when adding new files
    const toRemove = [fileToRemove];
    
    // Build new template without removed items
    const newLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('@')) {
        // Check if this line should be removed
        let shouldKeep = true;
        for (const removeItem of toRemove) {
          // Handle both exact matches and dependency path matches
          // Dependencies have @ prefix, need to match against template lines
          const depWithoutAt = removeItem.startsWith('@') ? removeItem.substring(1) : removeItem;
          if (trimmed === removeItem || trimmed.endsWith(depWithoutAt.replace('./', '/'))) {
            shouldKeep = false;
            break;
          }
        }
        if (shouldKeep) {
          newLines.push(line);
        }
      } else {
        newLines.push(line);
      }
    }
    
    // Clean up empty lines
    const cleanedLines = [];
    for (let i = 0; i < newLines.length; i++) {
      if (i > 0 && newLines[i].trim() === '' && newLines[i-1].trim() === '') {
        continue;
      }
      cleanedLines.push(newLines[i]);
    }
    
    return cleanedLines.join('\n');
  }
}