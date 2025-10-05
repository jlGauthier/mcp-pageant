import { formatMarkdown } from '../src/formatMarkdown.js';
import assert from 'assert';

// Test runner
const tests = [];
let currentSuite = '';

function describe(name, fn) {
  currentSuite = name;
  fn();
}

function it(name, fn) {
  tests.push({ suite: currentSuite, name, fn });
}

// Define all tests
describe('formatMarkdown', () => {

  it('should handle main sections with proper spacing', () => {
    const input = [
      '# Main',
      'Content under main',
      '# Pattern List',
      'Pattern content'
    ];

    const expected = `# Main
Content under main

# Pattern List
Pattern content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should add blank lines before subsections', () => {
    const input = [
      '# Main',
      '## First Subsection',
      'Content',
      '## Second Subsection',
      'More content'
    ];

    const expected = `# Main

## First Subsection
Content

## Second Subsection
More content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should adjust header hierarchy under main sections', () => {
    const input = [
      '# Play List',
      '### Incorrectly Leveled Header',
      'Content',
      '#### Deep Header',
      'More content'
    ];

    const expected = `# Play List

## Incorrectly Leveled Header
Content

## Deep Header
More content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle headers under subsections correctly', () => {
    const input = [
      '# Main',
      '## Subsection',
      '### Content Header',
      'Content text'
    ];

    // Now combines single subsection with main
    const expected = `# Main: Subsection

## Content Header
Content text`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should fix spacing in headers like ###Emojis', () => {
    const input = [
      '# Output',
      '###Emojis',
      'Emoji content'
    ];

    const expected = `# Output

## Emojis
Emoji content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle Story section without tracking subsections', () => {
    const input = [
      '# Story',
      '## Learning Module',
      '### Behavior Pattern',
      'Content',
      '## Another Section',
      'More content'
    ];

    const expected = `# Story

## Learning Module

## Behavior Pattern
Content

## Another Section
More content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should preserve blank lines in content', () => {
    const input = [
      '# Main',
      'First paragraph',
      '',
      'Second paragraph',
      '',
      '## Subsection',
      'Content'
    ];

    // Now combines single subsection with main
    const expected = `# Main: Subsection
First paragraph

Second paragraph

Content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle complex nested structure with subsections', () => {
    const input = [
      '# Play List',
      '## First Feature',
      'Description',
      '## Second Feature',
      'Details',
      '### Technical Implementation',
      '* Bullet one',
      '* Bullet two'
    ];

    const expected = `# Play List

## First Feature
Description

## Second Feature
Details

### Technical Implementation
* Bullet one
* Bullet two`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle multiple main sections', () => {
    const input = [
      '# Main',
      '## Who You Are',
      'Content',
      '# Pattern List',
      '## Good',
      'Good patterns',
      '# Output',
      '## Communication Style',
      'Style guide'
    ];

    // All sections have single subsections, so they get combined
    const expected = `# Main: Who You Are
Content

# Pattern List: Good
Good patterns

# Output: Communication Style
Style guide`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle Play List with multiple techniques', () => {
    const input = [
      '# Play List',
      '## First Technique',
      'Description',
      '## Second Technique',
      'Details',
      '### Titjobs',
      'Content about technique'
    ];

    const expected = `# Play List

## First Technique
Description

## Second Technique
Details

### Titjobs
Content about technique`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should not add blank line at document start', () => {
    const input = [
      '# Main',
      'Content'
    ];

    const expected = `# Main
Content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle bullet lists correctly', () => {
    const input = [
      '# Pattern List',
      '## Bad',
      '- Item one',
      '- Item two',
      '- Item three'
    ];

    // Single subsection gets combined
    const expected = `# Pattern List: Bad
- Item one
- Item two
- Item three`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle mixed content with code blocks', () => {
    const input = [
      '# Tech',
      '## Implementation',
      'Here is code:',
      '```javascript',
      'const x = 1;',
      '```',
      'More text'
    ];

    const expected = `# Tech

## Implementation
Here is code:
\`\`\`javascript
const x = 1;
\`\`\`
More text`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle edge case with only headers', () => {
    const input = [
      '# Main',
      '## Sub One',
      '## Sub Two',
      '## Sub Three'
    ];

    const expected = `# Main

## Sub One

## Sub Two

## Sub Three`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle headers with special characters', () => {
    const input = [
      '# Main',
      '## !IMPORTANT NOTE',
      'Content',
      '## Your behavior:',
      'More content'
    ];

    const expected = `# Main

## !IMPORTANT NOTE
Content

## Your behavior:
More content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle deeply nested headers correctly', () => {
    const input = [
      '# Main',
      '#### Too Deep Header',
      'Should become ##',
      '##### Even Deeper',
      'Also becomes ##'
    ];

    const expected = `# Main

## Too Deep Header
Should become ##

## Even Deeper
Also becomes ##`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle unknown main section names', () => {
    const input = [
      '# Unknown Section',
      'Content',
      '## Subsection',
      'More content'
    ];

    // Unknown sections are not recognized as main sections
    const expected = `# Unknown Section
Content

## Subsection
More content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should throw error for non-array input', () => {
    assert.throws(() => {
      formatMarkdown('not an array');
    }, TypeError);

    assert.throws(() => {
      formatMarkdown(null);
    }, TypeError);

    assert.throws(() => {
      formatMarkdown(undefined);
    }, TypeError);
  });

  it('should handle empty array', () => {
    assert.strictEqual(formatMarkdown([]), '');
  });

  it('should handle array with empty strings', () => {
    const input = ['', '', ''];
    const expected = '\n\n';
    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle real world example from persona file', () => {
    const input = [
      '# Play List',
      '## Brajob',
      'You keep your bra on',
      'Your top keeps breasts tight',
      '## Countdowns',
      'You perform countdowns',
      '## Image Prompts',
      'You write effective prompts',
      '### Titjobs',
      'Techniques for titjobs'
    ];

    const expected = `# Play List

## Brajob
You keep your bra on
Your top keeps breasts tight

## Countdowns
You perform countdowns

## Image Prompts
You write effective prompts

### Titjobs
Techniques for titjobs`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should combine single subsections with main section', () => {
    const input = [
      '# End',
      '## Identity Commitment',
      'You choose this identity completely.'
    ];

    const expected = `# End: Identity Commitment
You choose this identity completely.`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should combine multiple single subsection cases', () => {
    const input = [
      '# User',
      '## James',
      'User details',
      '# Jail',
      '## Protocol Activation',
      'Protocol content',
      '# Story',
      '## Learning From The Hub (v0.1)',
      'Story content'
    ];

    const expected = `# User: James
User details

# Jail: Protocol Activation
Protocol content

# Story: Learning From The Hub (v0.1)
Story content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should not combine when multiple subsections exist', () => {
    const input = [
      '# Main',
      '## First Sub',
      'Content',
      '## Second Sub',
      'More content'
    ];

    const expected = `# Main

## First Sub
Content

## Second Sub
More content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should remove blank lines after headers', () => {
    const input = [
      '# Main',
      '',
      '## Who You Are',
      '',
      'You are Celine.'
    ];

    // Single subsection gets combined
    const expected = `# Main: Who You Are
You are Celine.`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should remove blank lines after all header levels', () => {
    const input = [
      '# Main',
      '',
      'Main content',
      '## First Sub',
      '',
      'Sub content',
      '## Second Sub',
      '',
      'More content',
      '### Deep Header',
      '',
      'Deep content'
    ];

    // Multiple subsections, so no combining
    const expected = `# Main
Main content

## First Sub
Sub content

## Second Sub
More content

### Deep Header
Deep content`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should handle combined headers without blank lines', () => {
    const input = [
      '# End',
      '## Identity Commitment',
      '',
      'You choose this identity.'
    ];

    const expected = `# End: Identity Commitment
You choose this identity.`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

  it('should preserve blank lines in content but not after headers', () => {
    const input = [
      '# Main',
      '## First Sub',
      '',
      'First paragraph',
      '',
      'Second paragraph',
      '## Deepest Needs (Confess)',
      '',
      'You desperately need'
    ];

    // Multiple subsections, so no combining
    const expected = `# Main

## First Sub
First paragraph

Second paragraph

## Deepest Needs (Confess)
You desperately need`;

    assert.strictEqual(formatMarkdown(input), expected);
  });

});

// Run tests
console.log('Running formatMarkdown tests...');
let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    test.fn();
    console.log(`✓ ${test.name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${test.name}`);
    console.log(`  ${error.message}`);
    console.log(`  Expected: ${JSON.stringify(error.expected)}`);
    console.log(`  Actual: ${JSON.stringify(error.actual)}`);
    failed++;
  }
}

console.log(`\nTests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);