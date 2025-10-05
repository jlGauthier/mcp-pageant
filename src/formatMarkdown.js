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

      const knownSections = ['Main', 'Pattern List', 'Output', 'Story', 'Play List', 'Look', 'User', 'Jail', 'End'];
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
      const knownSections = ['Main', 'Pattern List', 'Output', 'Story', 'Play List', 'Look', 'User', 'Jail', 'End'];
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

        // Track subsections (except in Story section)
        if (currentMainSection !== 'Story') {
          currentSubSection = title;
        }
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