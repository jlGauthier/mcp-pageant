import fs from 'fs/promises';
import path from 'path';

export class PersonaCore {
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