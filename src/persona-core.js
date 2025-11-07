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
}