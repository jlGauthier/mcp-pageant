import { PersonaCore } from '../src/persona-core.js';
import assert from 'assert';

// Test the removeFileFromTemplate method
async function testDependencyRemoval() {
  const persona = new PersonaCore();

  // Mock template content
  const templateContent = `# Test Template
@./../mcp_persona/manifest/001_main/muse.md
@./manifest/020_pattern_list/clean_code.md
@./../mcp_persona/manifest/040_output/02_narration/tactile_digital_world.md
@./../mcp_persona/manifest/050_story/turned_hot/learning_from_the_hub.md
@./../mcp_persona/manifest/060_play_list/dirty/brajob.md
@./../mcp_persona/manifest/060_play_list/dirty/countdowns.md
@./../mcp_persona/manifest/060_play_list/dirty/image_prompts.md
@./../mcp_persona/manifest/060_play_list/dirty/titjobs.md
@./../mcp_persona/manifest/070_look/1_body/freckled_redhead.md
@./../mcp_persona/manifest/070_look/4_attire/undressed/just_sweater.md
@./../mcp_persona/manifest/080_user/james.md
@./manifest/999_end/identity_commitment.md`;

  // Mock extractDependencies to return known dependencies
  persona.extractDependencies = async (filePath) => {
    console.log(`Mock extractDependencies called with: ${filePath}`);
    if (filePath.includes('learning_from_the_hub')) {
      return [
        './manifest/070_look/4_attire/undressed/just_sweater.md',
        './manifest/060_play_list/dirty/brajob.md',
        './manifest/060_play_list/dirty/countdowns.md',
        './manifest/060_play_list/dirty/image_prompts.md',
        './manifest/060_play_list/dirty/titjobs.md'
      ];
    }
    return [];
  };

  console.log('Testing dependency removal...\n');
  console.log('Original template:');
  console.log(templateContent);
  console.log('\n---\n');

  // Test removing the story file
  const fileToRemove = '@./../mcp_persona/manifest/050_story/turned_hot/learning_from_the_hub.md';
  const filePath = './../mcp_persona/manifest/050_story/turned_hot/learning_from_the_hub.md';

  const result = await persona.removeFileFromTemplate(
    templateContent,
    fileToRemove,
    filePath
  );

  console.log('\nResult after removal:');
  console.log(result);
  console.log('\n---\n');

  // Check what was removed
  const resultLines = result.split('\n').map(l => l.trim()).filter(l => l.startsWith('@'));
  const originalLines = templateContent.split('\n').map(l => l.trim()).filter(l => l.startsWith('@'));

  console.log('Removed items:');
  for (const line of originalLines) {
    if (!resultLines.includes(line)) {
      console.log(`  - ${line}`);
    }
  }

  // Assertions
  assert(!result.includes('learning_from_the_hub'), 'Story file should be removed');
  assert(!result.includes('060_play_list'), 'LIST dependencies should be removed');
  assert(result.includes('070_look/4_attire'), 'SLOT dependency should be KEPT');
  assert(result.includes('070_look/1_body'), 'Unrelated files should be kept');

  console.log('\n✓ All assertions passed!');
}

// Run the test
testDependencyRemoval().catch(console.error);