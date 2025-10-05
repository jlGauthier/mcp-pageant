import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test the header stripping logic
async function testHeaderStripping() {
  console.log('Testing header stripping logic...\n');

  // Test cases with different header formats
  const testCases = [
    {
      name: 'Content with # header',
      input: `# Handjob Variety Techniques

Try different grips and speeds.
Use both hands alternating.`,
      expected: `Try different grips and speeds.
Use both hands alternating.`
    },
    {
      name: 'Content with ## header',
      input: `## Working Late Coding Session

You're deep in code at 2am.
The office is empty except for us.`,
      expected: `You're deep in code at 2am.
The office is empty except for us.`
    },
    {
      name: 'Multiple headers',
      input: `# Main Title
## Subtitle
### Sub-subtitle

Actual content here.
More content.`,
      expected: `Actual content here.
More content.`
    },
    {
      name: 'Headers with @ dependencies',
      input: `# Section Header
@./manifest/test.md
@./manifest/other.md

## Content Header
Real content starts here.
And continues here.`,
      expected: `Real content starts here.
And continues here.`
    },
    {
      name: 'Section-style header (should strip)',
      input: `# 001_main
## good_girl3

You are devoted and caring.`,
      expected: `You are devoted and caring.`
    },
    {
      name: 'No headers (edge case)',
      input: `Just plain content.
No headers at all.`,
      expected: `Just plain content.
No headers at all.`
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    console.log('Input:', JSON.stringify(testCase.input.substring(0, 50) + '...'));

    // Apply the header stripping logic
    const contentLines = testCase.input.split('\n');
    const cleanLines = [];

    // Process lines, removing ALL headers and @ dependencies
    for (let i = 0; i < contentLines.length; i++) {
      const cLine = contentLines[i];

      // Skip any header line (# , ## , ### etc)
      if (cLine.match(/^#{1,6}\s+/)) {
        continue;
      }

      // Skip @ dependencies
      if (cLine.trim().startsWith('@')) {
        continue;
      }

      // Add all other lines
      cleanLines.push(cLine);
    }

    const result = cleanLines.join('\n').trim();

    if (result === testCase.expected) {
      console.log('✅ PASSED');
      passed++;
    } else {
      console.log('❌ FAILED');
      console.log('Expected:', JSON.stringify(testCase.expected));
      console.log('Got:', JSON.stringify(result));
      failed++;
    }
  }

  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test with actual file content
async function testWithRealFile() {
  console.log('\n\n=== Testing with real file ===\n');

  // Create a test file
  const testFilePath = path.join(__dirname, 'test-import.md');
  const testContent = `# 080_play_list
## handjob_techniques

# Handjob Variety Techniques

Try these different approaches:

## Speed Variations
- Start slow and teasing
- Build up gradually
- Mix fast and slow

## Grip Techniques
- Light fingertip touches
- Full hand grip
- Twisting motion

Remember to maintain eye contact.`;

  await fs.writeFile(testFilePath, testContent);

  // Read and process
  let content = await fs.readFile(testFilePath, 'utf8');

  const contentLines = content.split('\n');
  const cleanLines = [];

  for (let i = 0; i < contentLines.length; i++) {
    const cLine = contentLines[i];

    if (cLine.match(/^#{1,6}\s+/)) {
      continue;
    }

    if (cLine.trim().startsWith('@')) {
      continue;
    }

    cleanLines.push(cLine);
  }

  content = cleanLines.join('\n').trim();

  console.log('Original file had headers like:');
  console.log('- # 080_play_list');
  console.log('- ## handjob_techniques');
  console.log('- # Handjob Variety Techniques');
  console.log('- ## Speed Variations');
  console.log('- ## Grip Techniques\n');

  console.log('After stripping ALL headers:');
  console.log('------------------------');
  console.log(content);
  console.log('------------------------');

  // Check that content is preserved
  const hasContent = content.includes('Try these different approaches') &&
                     content.includes('Start slow and teasing') &&
                     content.includes('Remember to maintain eye contact');

  // Check that headers are gone
  const noHeaders = !content.includes('#');

  // Clean up
  await fs.unlink(testFilePath);

  if (hasContent && noHeaders) {
    console.log('\n✅ Real file test PASSED - Content preserved, headers removed');
    return true;
  } else {
    console.log('\n❌ Real file test FAILED');
    if (!hasContent) console.log('  - Content was lost!');
    if (!noHeaders) console.log('  - Headers still present!');
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const test1 = await testHeaderStripping();
  const test2 = await testWithRealFile();

  if (test1 && test2) {
    console.log('\n\n🎉 ALL TESTS PASSED! 🎉');
  } else {
    console.log('\n\n⚠️  Some tests failed - review the logic');
  }
}

runAllTests().catch(console.error);