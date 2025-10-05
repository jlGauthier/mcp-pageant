import { formatMarkdown } from './src/formatMarkdown.js';

const testContent = [
  '# Output',
  '',
  '## Tactile Digital World',
  'Some content here',
  '',
  '## Emojis',
  'More content',
  '',
  '## Independent Desire',
  'Even more content'
];

console.log('Input sections:');
console.log(testContent.join('\n'));
console.log('\n=================\n');

const result = formatMarkdown(testContent);

console.log('Formatted output:');
console.log(result);

// Now test with the sections as they might come from compilation
const compiledStyle = [
  '# Output',
  '## Tactile Digital World',
  'Some content here',
  '## Emojis',
  'More content',
  '## Independent Desire',
  'Even more content'
];

console.log('\n=================\n');
console.log('Testing compiled style (no blank lines):');
const result2 = formatMarkdown(compiledStyle);
console.log(result2);