import path from 'path';

/**
 * FORMATTING RULES:
 *
 * 1. Section hierarchy should be relative to the main document. Component hierarchies will be rewritten.
 * 2. Section names are either the first header in the file, or the file name.
 * 3. Slot sections are named: slot : section name (e.g., "Dialect: Technical")
 * 4. If the file IS the slot (file started with a number), the header is just the section name
 *    (since slot and section name would be the same or very similar)
 */

/**
 * Analyze section structure to find sections with single subsections
 * @param {string[]} lines - Array of markdown lines
 * @returns {Object} - Map of sections to their subsections
 */
function analyzeSectionStructure(lines) {
  const structure = {};
  let currentMainSection = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s*(.+)/);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      const knownSections = ['Main', 'Pattern List', 'Output', 'User', 'End'];
      const isMainSection = level === 1 && knownSections.includes(title);

      if (isMainSection) {
        currentMainSection = title;
        structure[title] = { subsections: [] };
      } else if (level >= 2 && level <= 3 && currentMainSection) {
        // Count both ## and ### as subsections
        structure[currentMainSection].subsections.push(title);
      }
    }
  }

  return structure;
}

/**
 * Format markdown sections with proper hierarchy and spacing
 * @param {string[]} sections - Array of markdown section strings
 * @returns {string} - Properly formatted markdown
 */
export function formatMarkdown(sections) {
  if (!Array.isArray(sections)) {
    throw new TypeError('Input must be an array of sections');
  }

  // Process all sections as a single block
  const allLines = sections.join('\n').split('\n');

  // First pass: analyze structure to find single-subsection sections
  const sectionStructure = analyzeSectionStructure(allLines);

  // Second pass: format with combining logic
  const formatted = [];
  let currentMainSection = null;
  let currentSubSection = null;
  let lastLineWasBlank = false;
  let lastLineWasHeader = false;
  let skipNextSubsection = false;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const headerMatch = line.match(/^(#{1,6})\s*(.+)/);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      // Determine if this is a known main section
      const knownSections = ['Main', 'Pattern List', 'Output', 'User', 'End'];
      const isMainSection = level === 1 && knownSections.includes(title);

      if (isMainSection) {
        // Check if this section has only one subsection
        const hasSingleSubsection = sectionStructure[title]?.subsections?.length === 1;

        // Add blank line before main sections (except at start)
        if (formatted.length > 0 && !lastLineWasBlank) {
          formatted.push('');
        }

        currentMainSection = title;
        currentSubSection = null;

        if (hasSingleSubsection) {
          // Combine the section with its single subsection
          const subsectionTitle = sectionStructure[title].subsections[0];
          formatted.push(`# ${title}: ${subsectionTitle}`);
          skipNextSubsection = true;
        } else {
          formatted.push(`# ${title}`);
          skipNextSubsection = false;
        }
        lastLineWasBlank = false;
        lastLineWasHeader = true;
      } else if (level === 2 && currentMainSection) {
        // Skip this subsection header if it was combined with main section
        if (skipNextSubsection) {
          skipNextSubsection = false;
          lastLineWasHeader = true; // Still mark as header to skip following blank
          continue;
        }

        // Add blank line before ALL ## headers
        if (formatted.length > 0 && !lastLineWasBlank) {
          formatted.push('');
        }

        currentSubSection = title;
        formatted.push(`## ${title}`);
        lastLineWasBlank = false;
        lastLineWasHeader = true;
      } else {
        // Handle content headers that need adjustment
        let adjustedLevel = level;

        if (currentMainSection) {
          if (currentSubSection) {
            // Under a subsection, content headers start at ###
            adjustedLevel = Math.max(3, level);
          } else {
            // Directly under main section, all headers become ##
            adjustedLevel = 2;
          }
        }

        // Cap at ### max
        adjustedLevel = Math.min(3, adjustedLevel);

        // Add blank line before content headers too
        if (formatted.length > 0 && !lastLineWasBlank) {
          formatted.push('');
        }

        // Fix spacing issues (###Emojis -> ### Emojis)
        formatted.push(`${'#'.repeat(adjustedLevel)} ${title}`);
        lastLineWasBlank = false;
        lastLineWasHeader = true;
      }
    } else if (line.trim() === '') {
      // Skip blank lines immediately after headers
      if (!lastLineWasHeader) {
        formatted.push(line);
        lastLineWasBlank = true;
      }
      lastLineWasHeader = false;
    } else {
      formatted.push(line);
      lastLineWasBlank = false;
      lastLineWasHeader = false;
    }
  }

  return formatted.join('\n');
}

// Helper functions for formatWithContext
function toTitleCase(str) {
  return str.replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function sectionChange(slotA, slotB) {
  if (!slotA || !slotB) return true;
  const partsA = slotA.split('.');
  const partsB = slotB.split('.');
  return partsA[0] !== partsB[0];
}

function getSlotName(fullPath) {
  const pathParts = fullPath.split('/');
  const manifestIdx = pathParts.indexOf('manifest');

  if (manifestIdx >= 0 && manifestIdx + 2 < pathParts.length) {
    const subsectionDir = pathParts[manifestIdx + 2];
    // Only use this if there's another level after it (not the filename itself)
    if (/^\d+[_-]/.test(subsectionDir) && manifestIdx + 3 < pathParts.length) {
      return toTitleCase(subsectionDir.replace(/^\d+[_-]/, ''));
    }
  }

  // Handle virtual paths
  if (pathParts.length >= 2 && !fullPath.includes('manifest')) {
    const subsection = pathParts[pathParts.length - 2];
    return toTitleCase(subsection);
  }

  return null;
}

async function getSectionName(fullPath, slotKey, multiManifest) {
  // For virtual paths (inline overrides), derive section from slot key
  if (slotKey && !fullPath.includes('manifest')) {
    const firstSlotPart = slotKey.split('.')[0];
    const sections = await multiManifest.listSections();

    for (const sectionInfo of sections) {
      const sectionName = sectionInfo.name;
      const match = sectionName.match(/^(\d+)[_-]/);
      if (match && match[1] === firstSlotPart) {
        return toTitleCase(sectionName.replace(/^\d+[_-]/, ''));
      }
    }

    return 'Unknown';
  }

  // Extract section name from path
  const pathParts = fullPath.split('/');
  const manifestIdx = pathParts.indexOf('manifest');

  if (manifestIdx >= 0 && manifestIdx + 1 < pathParts.length) {
    const sectionDir = pathParts[manifestIdx + 1];
    return toTitleCase(sectionDir.replace(/^\d{3}[_-]/, ''));
  }

  return 'Unknown';
}

function extractFirstHeader(content) {
  // Extract first # header text for use as section name (Rule 2)
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function determineContent(current, firstHeaderMatchesSection, stripFirstHeader) {
  let content = current[3];

  // Strip first header (# or ##) and demote remaining headers
  const lines = content.split('\n');
  const cleanLines = [];
  let skippedFirstHeader = false;
  let strippedDoubleHash = false; // Track if we stripped ## instead of #

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip first header if flagged (for combined headers or filename usage)
    if (!skippedFirstHeader && stripFirstHeader) {
      if (line.match(/^##\s+/)) {
        // Strip first ## header (don't demote remaining)
        skippedFirstHeader = true;
        strippedDoubleHash = true;
        // Skip blank lines after header
        while (i + 1 < lines.length && lines[i + 1].trim() === '') {
          i++;
        }
        continue;
      } else if (line.match(/^#\s+/)) {
        // Strip first # header (demote remaining)
        skippedFirstHeader = true;
        // Skip blank lines after header
        while (i + 1 < lines.length && lines[i + 1].trim() === '') {
          i++;
        }
        continue;
      }
    } else if (!skippedFirstHeader && line.match(/^#\s+/)) {
      // Strip first # header (when not using filename)
      skippedFirstHeader = true;
      // Skip blank lines after header
      while (i + 1 < lines.length && lines[i + 1].trim() === '') {
        i++;
      }
      continue;
    }

    // If we skipped a # header AND it didn't match section name, demote remaining headers
    // If we stripped ## header, DON'T demote (it's already at the right level)
    // If it matched section name, keep headers as-is
    if (skippedFirstHeader && !firstHeaderMatchesSection && !strippedDoubleHash) {
      const headerMatch = line.match(/^(#+)(\s+.+)$/);
      if (headerMatch) {
        cleanLines.push(`#${headerMatch[1]}${headerMatch[2]}`);
      } else {
        cleanLines.push(line);
      }
    } else {
      cleanLines.push(line);
    }
  }

  return cleanLines.join('\n').trim();
}

async function determineHeader(lastSlot, current, nextSlot, multiManifest) {
  const slot = current[0];
  const fullPath = current[1];
  const filename = current[2];
  const content = current[3];

  const depth = slot ? slot.split('.').length : 0;
  const fileIsNumbered = /^\d+[_-]/.test(path.basename(fullPath));

  // Get section name for comparison
  const sectionName = sectionChange(lastSlot, slot)
    ? await getSectionName(fullPath, slot, multiManifest)
    : null;

  // Extract first header from content
  const firstHeader = extractFirstHeader(content);

  // Determine file title
  let fileTitle;
  let firstHeaderMatchesSection = false;

  // Rule 4: If file started with a number, use filename (not first header)
  let usedFilename = false;
  if (fileIsNumbered && firstHeader) {
    // Use first header but title-case it for consistency
    fileTitle = toTitleCase(firstHeader.toLowerCase());
    // Don't mark as section match - we want normal stripping and demotion
    firstHeaderMatchesSection = false;
  } else if (fileIsNumbered) {
    // No # header found, use filename
    const cleanFilename = filename.replace(/^\d+[_-]/, '').replace(/\.(md|txt)$/, '');
    fileTitle = toTitleCase(cleanFilename);
    firstHeaderMatchesSection = false;
    usedFilename = true;
  } else if (firstHeader) {
    // Check if first header matches section name (e.g., "# Main" in Main section)
    firstHeaderMatchesSection = sectionName && firstHeader === sectionName;

    if (firstHeaderMatchesSection) {
      // Use filename as title when first header is just the section name
      const cleanFilename = filename.replace(/\.(md|txt)$/, '');
      fileTitle = toTitleCase(cleanFilename);
    } else {
      // Use first header as title
      fileTitle = firstHeader;
    }
  } else {
    // No header in content, use filename
    const cleanFilename = filename.replace(/\.(md|txt)$/, '');
    fileTitle = toTitleCase(cleanFilename);
  }

  // For depth-2+ slots, prefix with subsection name
  let headerName;
  if (depth >= 2) {
    const slotName = getSlotName(fullPath);
    headerName = slotName ? `${slotName}: ${fileTitle}` : fileTitle;
  } else {
    headerName = fileTitle;
  }

  // Generate section header if this is a new section
  let header;
  let stripFirstHeader = usedFilename; // Already set to strip if we used filename

  if (sectionChange(lastSlot, slot)) {
    // Check if this is a single-file section (next slot is different section or end)
    const isSingleFileSection = !nextSlot || sectionChange(slot, nextSlot);

    if (isSingleFileSection) {
      // Combine section and file name: # Main: Agent
      header = `# ${sectionName}: ${headerName}\n`;
      // For combined headers, strip the first header from content (it's already in the combined header)
      stripFirstHeader = true;
    } else {
      // Multiple files in section: # Main\n\n## Agent
      header = `# ${sectionName}\n\n## ${headerName}\n`;
    }
  } else {
    header = `## ${headerName}\n`;
  }

  return { header, firstHeaderMatchesSection, stripFirstHeader };
}

/**
 * Format file data list with context-aware headers
 * @param {Array} fileDataList - Array of [slotKey, filePath, filename, content]
 * @param {Object} multiManifest - MultiManifest instance for section lookup
 * @returns {Promise<string>} - Formatted markdown
 */
export async function formatWithContext(fileDataList, multiManifest) {
  let lastSlot = '';
  let output = '';

  for (let i = 0; i < fileDataList.length; i++) {
    const current = fileDataList[i];
    const nextSlot = i < fileDataList.length - 1 ? fileDataList[i + 1][0] : null;

    if (i !== 0) output += '\n\n';

    const { header, firstHeaderMatchesSection, stripFirstHeader } = await determineHeader(lastSlot, current, nextSlot, multiManifest);
    output += header;
    output += determineContent(current, firstHeaderMatchesSection, stripFirstHeader);

    lastSlot = current[0];
  }

  return output;
}