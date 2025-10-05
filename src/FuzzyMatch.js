/**
 * FuzzyMatch - Fast fuzzy matching for any object structures
 * Can be used for filenames, sections, or any string matching needs
 */
export class FuzzyMatch {
  /**
   * Find best match from options array
   * @param {Array} options - Array of strings or objects to search
   * @param {string} search - Search string
   * @param {Function} extractor - Optional function to extract string from objects
   * @returns {*} Best match or null
   */
  static findBest(options, search, extractor = null) {
    if (!search || !options || options.length === 0) return null;

    // Normalize the extractor
    const getString = extractor || (x => String(x));
    const searchClean = FuzzyMatch.clean(search);

    let bestMatch = null;
    let bestScore = 0;

    for (const option of options) {
      const optionStr = getString(option);
      const score = FuzzyMatch.score(optionStr, searchClean);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = option;
      }
    }

    // Only return if we have a reasonable match (>30% score)
    return bestScore > 0.3 ? bestMatch : null;
  }

  /**
   * Find all matches above a threshold
   * @param {Array} options - Array to search
   * @param {string} search - Search string
   * @param {number} threshold - Minimum score (0-1)
   * @param {Function} extractor - Optional string extractor
   * @returns {Array} Matches sorted by score
   */
  static findAll(options, search, threshold = 0.3, extractor = null) {
    if (!search || !options || options.length === 0) return [];

    const getString = extractor || (x => String(x));
    const searchClean = FuzzyMatch.clean(search);

    const matches = [];

    for (const option of options) {
      const optionStr = getString(option);
      const score = FuzzyMatch.score(optionStr, searchClean);

      if (score >= threshold) {
        matches.push({ item: option, score });
      }
    }

    // Sort by score descending
    return matches
      .sort((a, b) => b.score - a.score)
      .map(m => m.item);
  }

  /**
   * Calculate match score between two strings
   * @param {string} str - String to check
   * @param {string} searchClean - Pre-cleaned search string
   * @returns {number} Score from 0 to 1
   */
  static score(str, searchClean) {
    const strClean = FuzzyMatch.clean(str);

    // Exact match
    if (strClean === searchClean) {
      return 1.0;
    }

    // Contains match (weighted by length ratio)
    if (strClean.includes(searchClean)) {
      return 0.8 + (0.2 * (searchClean.length / strClean.length));
    }

    // Sequential character match
    let searchIndex = 0;
    let matchPositions = [];

    for (let i = 0; i < strClean.length && searchIndex < searchClean.length; i++) {
      if (strClean[i] === searchClean[searchIndex]) {
        matchPositions.push(i);
        searchIndex++;
      }
    }

    // All characters found in sequence
    if (searchIndex === searchClean.length) {
      // Score based on match density and position
      const spread = matchPositions[matchPositions.length - 1] - matchPositions[0] + 1;
      const density = searchClean.length / spread;
      const position = 1 - (matchPositions[0] / strClean.length);

      return (density * 0.5 + position * 0.2) * 0.7;
    }

    // Partial character match
    const matchRatio = searchIndex / searchClean.length;
    return matchRatio * 0.3;
  }

  /**
   * Clean a string for matching
   * @param {string} str - String to clean
   * @returns {string} Cleaned string
   */
  static clean(str) {
    // Remove numeric prefixes like "001_" or "4_"
    const withoutPrefix = str.replace(/^\d+[_\-]/, '');
    // Lowercase and remove separators
    return withoutPrefix.toLowerCase().replace(/[_\-\s]/g, '');
  }

  /**
   * Check if a string matches a pattern
   * @param {string} str - String to check
   * @param {string} pattern - Pattern to match
   * @returns {boolean} True if matches
   */
  static matches(str, pattern) {
    const score = FuzzyMatch.score(str, FuzzyMatch.clean(pattern));
    return score > 0.3;
  }
}