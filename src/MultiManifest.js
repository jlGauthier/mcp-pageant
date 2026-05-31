import fs from 'fs/promises';
import path from 'path';
import { FuzzyMatch } from './FuzzyMatch.js';

/**
 * MultiManifest - Resolves manifest components across the public manifest
 * and an optional gitignored manifest.local overlay.
 *
 * Layout:
 *   <pageant>/manifest/         public, committed
 *   <pageant>/manifest.local/   private, gitignored, wins on collision
 */
export class MultiManifest {
  constructor(mainDir, localDir = null) {
    // Forgiving signature for tests and legacy callers:
    //   new MultiManifest('/a')                 → main only
    //   new MultiManifest('/a', '/b')           → main + local overlay
    //   new MultiManifest(['/a'])               → main only
    //   new MultiManifest(['/a', '/b', '/c'])   → ordered: index 0 lowest priority, last wins
    let dirs;
    if (Array.isArray(mainDir)) {
      dirs = mainDir.map(d => path.resolve(d));
    } else {
      dirs = [path.resolve(mainDir)];
      if (localDir) dirs.push(path.resolve(localDir));
    }
    this.manifestDirs = dirs;
  }

  /**
   * Find all files matching criteria across all manifests
   * Later directories (extensions) have priority
   * Recursively searches subdirectories (excluding those starting with 0-9)
   * @returns {Array} Files sorted by priority (later dirs first)
   */
  async findFiles(section, subsection = null, partial = null) {
    const results = [];
    const processedPaths = new Set();

    // Search in REVERSE order so extensions override main
    for (let i = this.manifestDirs.length - 1; i >= 0; i--) {
      const manifestDir = this.manifestDirs[i];

      try {
        const searchPath = subsection ?
          path.join(manifestDir, section, subsection) :
          path.join(manifestDir, section);

        const stats = await fs.stat(searchPath);
        if (!stats.isDirectory()) continue;

        // Recursively find all .md files
        const allFiles = await this._findFilesInDirectoryFlat(searchPath, searchPath);

        // Filter by partial if provided
        let filtered = allFiles;
        if (partial) {
          // Use fuzzy matching for partial
          filtered = FuzzyMatch.findAll(
            allFiles,
            partial,
            0.3,
            f => f.filename
          );
        }

        // Add to results with metadata
        for (const fileInfo of filtered) {
          const fileKey = `${section}/${fileInfo.relativePath}`;

          // Check if we already have this file from a later directory
          if (!processedPaths.has(fileKey)) {
            processedPaths.add(fileKey);
            results.push({
              path: fileInfo.fullPath,
              manifestDir,
              manifestIndex: i,
              filename: fileInfo.filename,
              section,
              subsection: fileInfo.subsection || subsection,
              relativePath: fileInfo.relativePath
            });
          }
        }
      } catch (error) {
        // Directory doesn't exist - this is normal, continue
        continue;
      }
    }

    return results;
  }

  /**
   * Recursively find all .md files in a directory (for findFiles)
   * Skips directories that start with numbers (0-9) which are section directories
   */
  async _findFilesInDirectoryFlat(dirPath, basePath, currentSubdir = '') {
    const files = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filename = entry.name.replace('.md', '');
        const relativePath = currentSubdir ?
          path.join(currentSubdir, entry.name) :
          entry.name;

        files.push({
          filename,
          fullPath,
          relativePath,
          subsection: currentSubdir || null
        });
      } else if (entry.isDirectory()) {
        // Always recurse into subdirectories - numbered subdirectories are valid
        const subdirPath = currentSubdir ?
          path.join(currentSubdir, entry.name) :
          entry.name;
        const subFiles = await this._findFilesInDirectoryFlat(fullPath, basePath, subdirPath);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Find a single file by partial match
   * Returns best match with priority to later directories
   */
  async findFile(section, subsection = null, partial) {
    const files = await this.findFiles(section, subsection, partial);
    return files.length > 0 ? files[0] : null;
  }

  /**
   * Read a file by section/subsection/partial
   * Returns null if not found (no throwing)
   */
  async readFile(section, subsection = null, partial) {
    const fileInfo = await this.findFile(section, subsection, partial);

    if (!fileInfo) {
      return null; // File not found is normal
    }

    try {
      const content = await fs.readFile(fileInfo.path, 'utf8');
      return {
        content,
        ...fileInfo
      };
    } catch (error) {
      return null; // Read failure returns null
    }
  }

  /**
   * Write a file to the correct manifest directory
   * Writes to LAST directory that has the parent section (or main if none exist)
   * @param {boolean} createDir - Whether to create directory if it doesn't exist
   */
  async writeFile(section, subsection = null, filename, content, createDir = false) {
    if (this.manifestDirs.length === 0) {
      return { success: false, error: 'No manifest directories configured' };
    }

    // Find the LAST directory that has this section, or use main (first)
    let targetDir = null;
    let targetManifestDir = this.manifestDirs[0]; // Default to main

    for (let i = this.manifestDirs.length - 1; i >= 0; i--) {
      const manifestDir = this.manifestDirs[i];
      const sectionPath = path.join(manifestDir, section);

      try {
        const stats = await fs.stat(sectionPath);
        if (stats.isDirectory()) {
          targetManifestDir = manifestDir;
          break; // Found the last one with this section
        }
      } catch {
        // Directory doesn't exist, continue searching
      }
    }

    targetDir = subsection ?
      path.join(targetManifestDir, section, subsection) :
      path.join(targetManifestDir, section);

    // Check if target directory exists
    try {
      await fs.stat(targetDir);
    } catch {
      if (!createDir) {
        return { success: false, error: 'Directory does not exist and createDir=false' };
      }
      // Create directory
      await fs.mkdir(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, filename);

    try {
      await fs.writeFile(filePath, content, 'utf8');
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file
   * Returns true if deleted, false if not found
   */
  async deleteFile(section, subsection = null, partial) {
    const fileInfo = await this.findFile(section, subsection, partial);

    if (!fileInfo) {
      return false; // Not found is not an error
    }

    try {
      await fs.unlink(fileInfo.path);
      return true;
    } catch {
      return false; // Delete failure
    }
  }

  /**
   * Internal helper: List directories at a given relative path across all manifests
   * @param {string} relativePath - Path relative to manifest root (empty for sections)
   * @returns {Array} Array of {name, manifestDirs[], manifestIndices[]}
   */
  async _listDirectoriesAtPath(relativePath = '') {
    const dirMap = new Map();

    for (let i = 0; i < this.manifestDirs.length; i++) {
      const manifestDir = this.manifestDirs[i];

      try {
        const targetPath = relativePath
          ? path.join(manifestDir, relativePath)
          : manifestDir;
        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            if (!dirMap.has(entry.name)) {
              dirMap.set(entry.name, {
                name: entry.name,
                manifestDirs: [],
                manifestIndices: []
              });
            }
            dirMap.get(entry.name).manifestDirs.push(manifestDir);
            dirMap.get(entry.name).manifestIndices.push(i);
          }
        }
      } catch {
        // Directory doesn't exist in this manifest - normal
      }
    }

    return Array.from(dirMap.values());
  }

  /**
   * List all sections across all manifest directories
   * Extensions can add new sections to main
   */
  async listSections() {
    return this._listDirectoriesAtPath('');
  }

  /**
   * List subsections for a given section
   */
  async listSubsections(section) {
    return this._listDirectoriesAtPath(section);
  }

  /**
   * Recursively find all files in a section (including subdirectories)
   * Used for building tree structures
   */
  async findAllFilesRecursive(section) {
    const allFiles = [];
    const processedPaths = new Set();

    // Search each manifest directory
    for (let i = this.manifestDirs.length - 1; i >= 0; i--) {
      const manifestDir = this.manifestDirs[i];
      const sectionPath = path.join(manifestDir, section);

      try {
        await this._findFilesRecursive(sectionPath, manifestDir, section, allFiles, processedPaths);
      } catch {
        // Section doesn't exist in this manifest
      }
    }

    return allFiles;
  }

  async _findFilesRecursive(dirPath, manifestDir, basePath, allFiles, processedPaths) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.md')) {
        const relPath = path.relative(path.join(manifestDir, basePath), fullPath);
        const fileKey = `${basePath}/${relPath}`;

        if (!processedPaths.has(fileKey)) {
          processedPaths.add(fileKey);
          allFiles.push({
            filename: entry.name,
            path: fullPath,
            manifestDir,
            relativePath: relPath
          });
        }
      } else if (entry.isDirectory()) {
        await this._findFilesRecursive(fullPath, manifestDir, basePath, allFiles, processedPaths);
      }
    }
  }

  /**
   * Get all manifest directories
   */
  getManifestDirs() {
    return [...this.manifestDirs];
  }

  /**
   * Resolve a manifest-relative path to an absolute path.
   * Accepts paths containing /manifest/ or /manifest.local/ (or legacy
   * external manifests under any name ending in /manifest/), plus
   * manifest-relative paths like "001_main/engineer.md".
   */
  async resolveManifestPath(refPath) {
    let manifestRelativePath = null;

    const manifestMatch = refPath.match(/\/manifest(?:\.local)?\/(.+)$/);
    if (manifestMatch) {
      manifestRelativePath = manifestMatch[1];
    } else if (!refPath.startsWith('./') && !refPath.startsWith('../')) {
      manifestRelativePath = refPath;
    }

    if (manifestRelativePath) {
      // Local overlay wins: try local first, then public
      for (let i = this.manifestDirs.length - 1; i >= 0; i--) {
        const candidatePath = path.join(this.manifestDirs[i], manifestRelativePath);
        try {
          await fs.stat(candidatePath);
          return candidatePath;
        } catch {
          // try next
        }
      }
    }

    return null;
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath) {
    try {
      await fs.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse a reference path to extract components.
   * Accepts /manifest/ and /manifest.local/ segments.
   */
  parsePath(refPath) {
    const cleanPath = refPath.startsWith('@') ? refPath.substring(1) : refPath;

    const manifestMatch = cleanPath.match(/\/manifest(?:\.local)?\/(.+)$/);
    if (!manifestMatch) {
      return null;
    }

    const manifestRelative = manifestMatch[1];
    const parts = manifestRelative.split('/');

    if (parts.length < 2) {
      return null; // Need at least section/file
    }

    const section = parts[0];
    let subsection = null;
    let filename = null;

    // Check if there's a subsection (middle parts that are directories)
    if (parts.length === 2) {
      // section/file.md
      filename = parts[1].replace('.md', '');
    } else {
      // section/subsection/file.md or deeper
      // Everything between section and last part is subsection path
      subsection = parts.slice(1, -1).join('/');
      filename = parts[parts.length - 1].replace('.md', '');
    }

    return {
      section,
      subsection,
      filename,
      manifestRelative,
      originalPath: refPath
    };
  }

  /**
   * Validate and clean a reference path
   * Fixes common issues like duplicate /manifest/ patterns
   * Returns: { valid, cleanedPath, warnings }
   */
  validatePath(refPath) {
    const warnings = [];
    let cleanedPath = refPath;

    // Collapse duplicate /manifest/ or /manifest.local/ segments
    const segCount = (refPath.match(/\/manifest(?:\.local)?\//g) || []).length;
    if (segCount > 1) {
      const parts = refPath.split(/\/manifest(?:\.local)?\//);
      cleanedPath = parts[0] + '/manifest/' + parts[parts.length - 1];
      warnings.push(`Fixed duplicate manifest segments: ${refPath} -> ${cleanedPath}`);
    }

    const parsed = this.parsePath(cleanedPath);
    const valid = parsed !== null;

    return { valid, cleanedPath, warnings, parsed };
  }

  /**
   * Extract all dependencies from a file
   * Reads the file and returns all @ references as absolute paths
   * Recursively processes dependencies (with cycle detection)
   */
  async extractDependencies(filePath, processed = new Set()) {
    const dependencies = [];

    // Avoid circular dependencies
    if (processed.has(filePath)) {
      return dependencies;
    }
    processed.add(filePath);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Stop at first header (dependencies must be at top)
        if (trimmed.startsWith('#')) {
          break;
        }

        if (trimmed.startsWith('@@') || trimmed.startsWith('@')) {
          const isOverride = trimmed.startsWith('@@');
          const depPath = isOverride ? trimmed.substring(2) : trimmed.substring(1);

          // Resolve to absolute path
          let absolutePath = null;

          // Check if it's a manifest-relative path
          if (/\/manifest(?:\.local)?\//.test(depPath)) {
            absolutePath = await this.resolveManifestPath(depPath);
          } else {
            // Relative to current file
            const fileDir = path.dirname(filePath);
            absolutePath = path.resolve(fileDir, depPath);
          }

          if (absolutePath && await this.fileExists(absolutePath)) {
            dependencies.push({
              originalRef: trimmed,
              absolutePath,
              relativePath: depPath,
              isOverride: isOverride
            });

            // Recursively process this dependency
            const nestedDeps = await this.extractDependencies(absolutePath, processed);
            dependencies.push(...nestedDeps);
          }
        }
      }
    } catch (error) {
      // File read error - return what we have
    }

    return dependencies;
  }

  /**
   * Resolve a full @ reference line to absolute path
   * Combines validation, parsing, and resolution
   */
  async resolveReference(refLine) {
    // Validate and clean the path
    const validation = this.validatePath(refLine);

    if (!validation.valid) {
      return null;
    }

    // Use the cleaned path for resolution
    return await this.resolveManifestPath(validation.cleanedPath);
  }
}