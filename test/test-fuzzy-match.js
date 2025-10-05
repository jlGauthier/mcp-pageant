import { FuzzyMatch } from '../src/FuzzyMatch.js';

console.log('Testing FuzzyMatch with section names:\n');

const sections = [
  '001_main',
  '010_tech_list',
  '020_pattern_list',
  '030_jobs',
  '040_output',
  '050_story',
  '060_play_list',
  '070_look',
  '080_user',
  '090_jail',
  '999_end'
];

const searches = ['look', 'main', 'pattern', 'user', 'output'];

for (const search of searches) {
  const result = FuzzyMatch.findBest(sections, search);
  console.log(`Search: "${search}" → Match: "${result}"`);
}

console.log('\n\nTesting subsection matching for 4_attire:');
const subsections = [
  '1_body',
  '3_hair',
  '4_attire',
  '5_style',
  '6_place'
];

const subSearches = ['attire', '4_attire', 'hair', 'body'];
for (const search of subSearches) {
  const result = FuzzyMatch.findBest(subsections, search);
  console.log(`Search: "${search}" → Match: "${result}"`);
}