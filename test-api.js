// Use built-in fetch (Node 18+)

async function testAPIs() {
  console.log('Testing Pageant APIs...\n');

  // Test manifest API
  try {
    console.log('1. Testing /api/manifest:');
    const manifestRes = await fetch('http://localhost:52100/api/manifest');
    const manifest = await manifestRes.json();

    console.log('   Success:', manifest.success);
    if (manifest.data) {
      const sections = Object.keys(manifest.data);
      console.log('   Sections found:', sections.length);
      console.log('   Section names:', sections.join(', '));

      // Check first section details
      if (sections.length > 0) {
        const firstSection = sections[0];
        const sectionData = manifest.data[firstSection];
        console.log(`   First section (${firstSection}):`, {
          type: sectionData.type,
          dir: sectionData.dir,
          filesCount: sectionData.tree?.files?.length || 0,
          childrenCount: Object.keys(sectionData.tree?.children || {}).length
        });
      }
    }
  } catch (e) {
    console.error('   FAILED:', e.message);
  }

  console.log('\n2. Testing /api/projects:');
  try {
    const projectsRes = await fetch('http://localhost:52100/api/projects');
    const projects = await projectsRes.json();
    console.log('   Success:', projects.success);
    console.log('   Projects found:', projects.data?.length || 0);
    if (projects.data?.length > 0) {
      console.log('   Current project:', projects.data.find(p => p.isCurrent)?.displayName);
    }
  } catch (e) {
    console.error('   FAILED:', e.message);
  }

  console.log('\n3. Testing /api/template:');
  try {
    const templateRes = await fetch('http://localhost:52100/api/template');
    const template = await templateRes.json();
    console.log('   Success:', template.success);
    console.log('   Template items:', template.data?.items?.length || 0);
  } catch (e) {
    console.error('   FAILED:', e.message);
  }

  console.log('\n4. Checking if sections are properly formatted:');
  try {
    const manifestRes = await fetch('http://localhost:52100/api/manifest');
    const manifest = await manifestRes.json();

    if (manifest.data) {
      Object.entries(manifest.data).forEach(([name, section]) => {
        if (!section.type || !section.dir) {
          console.log(`   WARNING: Section '${name}' missing type or dir`);
        }
        if (!section.tree) {
          console.log(`   WARNING: Section '${name}' missing tree structure`);
        }
      });
    }
  } catch (e) {
    console.error('   FAILED:', e.message);
  }
}

testAPIs().catch(console.error);