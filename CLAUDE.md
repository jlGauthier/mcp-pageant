# MCP Pageant - Implementation Documentation

## Project Organization

```
mcp_pageant/
├── server.js                    # MCP server entry point
├── src/
│   ├── PersonaManager.js        # Core persona engine (1759 lines)
│   ├── MultiManifest.js         # Multi-directory file resolution (580 lines)
│   ├── FuzzyMatch.js            # Fuzzy matching utility (135 lines)
│   ├── persona-core.js          # Template operations (251 lines)
│   ├── formatMarkdown.js        # Markdown formatting (151 lines)
│   └── WebEditor.js             # Web UI backend (352 lines)
├── manifest/                    # Component library
│   ├── 001_main/               # Core personalities
│   ├── 005_jobs/               # Professional roles
│   ├── 010_tech/               # Technical knowledge
│   ├── 015_talents/            # Temporary skills
│   ├── 020_pattern/            # Behavioral patterns
│   ├── 040_output/             # Communication styles
│   ├── 080_user/               # User context
│   ├── 999_end/                # Final overrides
│   ├── default_vars.txt        # Default variable values
│   ├── tool_hints.txt          # UI guidance text
│   └── tools.json              # Custom MCP tools
├── plans/                       # Compiled personas by ID
│   └── {agent-id}/
│       ├── template.md          # Active component references
│       ├── persona.md           # Compiled output
│       └── vars.txt             # Project variables
├── editor-ui/                   # Web editor frontend
├── tests/                       # Test suites
├── scripts/
│   ├── debug-merge.js           # Debug manifest resolution
│   └── compile-remote.js        # Compile agent in remote directory
└── .env                         # Configuration
```

## Scripts

### compile-remote.js
Compile pageant for an agent in another directory without cd-ing there:
```bash
node D:/claudeTools/mcp_pageant/scripts/compile-remote.js "C:/project/.pageant/agent"
```

## Core Architecture

### Layer 1: MCP Interface (server.js)

**Responsibility:** MCP protocol implementation

**Key Components:**
- `PersonaServer` class - MCP server wrapper
- Tool handlers - Route tool calls to PersonaManager
- Resource handlers - Expose persona as MCP resource
- Prompt handlers - Template compilation for MCP prompts

**Tool Registration:**
```javascript
// Dynamic tool loading from manifest/tools.json
this.customTools.forEach(tool => {
  this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === tool.name) {
      return await this.handleCustomTool(tool, request.params.arguments);
    }
  });
});
```

**Slot Enum Generation:**
```javascript
// Converts manifest structure to slot enum for MCP
slotToSectionSubsection(slot) {
  // "tech" → {section: "010_tech", subsection: null}
  // "output/tone" → {section: "040_output", subsection: "01_tone"}
}
```

### Layer 2: Business Logic (PersonaManager.js)

**Responsibility:** Persona composition and management

**Core Operations:**

1. **Stable ID System** (lines 108-229)
```javascript
getProjectDirName() {
  // Check for PAGEANT_ID in CLAUDE.local.md
  const id = this.extractPageantId(claudeLocalContent);

  if (id && this.templateExists(id)) {
    // ID exists → move/rename detected
    return id;
  } else if (id && this.isValidCopy(id)) {
    // ID exists but template in use → copy detected
    return this.generateCopyId(id);
  } else {
    // No ID → new agent, generate from path
    return this.generateIdFromPath(process.cwd());
  }
}
```

2. **Component Addition** (lines 856-1051)
```javascript
async handleAdd({ slot, partial, duration }) {
  // 1. Resolve section/subsection from slot
  const { section, subsection } = this.parseSlot(slot);

  // 2. Find file via fuzzy matching
  const fileInfo = await this.multiManifest.findFile(section, subsection, partial);

  // 3. Extract dependencies
  const deps = await this.extractDependencies(fileInfo.path);

  // 4. Check slot collisions
  const slotKey = this.getSlotKey(fileInfo.path);
  const conflicts = this.findSlotConflicts(slotKey);

  // 5. Update template (remove conflicts, add deps, add file)
  await this.updateTemplate(fileInfo, deps, conflicts);

  // 6. Compile to CLAUDE.local.md
  await this.compilePersona(process.cwd());
}
```

3. **Compilation** (lines 663-812)
```javascript
async compileFromTemplate(template) {
  const sections = [];

  // Parse template references
  for (const line of template.split('\n')) {
    if (line.startsWith('@')) {
      // Resolve file path
      const filePath = await this.multiManifest.resolveReference(line);

      // Read and clean content
      let content = await fs.readFile(filePath, 'utf8');
      content = this.stripHeaders(content);        // Remove first #
      content = this.stripDependencies(content);   // Remove @lines
      content = this.demoteHeaders(content);       // ## → ###
      content = this.substituteVariables(content); // ${VAR} → value

      sections.push({ section, content });
    }
  }

  // Format with section headers
  return this.formatWithSectionHeaders(sections);
}
```

4. **Slot Collision Detection** (lines 269-295, 369-388)
```javascript
getSlotKey(refPath) {
  // Extract numbered components from path
  // "040_output/01_dialect/technical.md" → "040.01"

  const parts = refPath.split('/');
  const numberedParts = parts
    .map(p => p.match(/^(\d+)[_-]/)?.[1])
    .filter(Boolean);

  return numberedParts.join('.');
}

findSlotConflicts(slotKey, newRef) {
  // Find existing template refs with same slot key
  return this.currentTemplate
    .filter(ref => this.getSlotKey(ref) === slotKey && ref !== newRef);
}
```

### Layer 3: Data Access (MultiManifest.js)

**Responsibility:** File resolution across multiple manifest directories

**Overlay System:**
```javascript
// Configured in .env
MANIFEST_DIRS=./manifest,../company_personas,~/personal_personas

// Resolution order: REVERSE (later directories override)
for (let i = this.manifestDirs.length - 1; i >= 0; i--) {
  const manifestDir = this.manifestDirs[i];
  const file = await this.findFileInManifest(manifestDir, section, subsection, partial);
  if (file) return file; // First match wins
}
```

**File Operations:**
- `findFile(section, subsection, partial)` - Fuzzy search for component
- `findFiles(section, subsection)` - List all files in section
- `listSections()` - Get all section directories
- `resolveReference(refPath)` - Convert @reference to absolute path
- `writeFile(section, subsection, filename, content)` - Create new component

**Write Priority:**
```javascript
// Writes go to LAST directory that has the section
// Or FIRST directory (main manifest) if section doesn't exist
const targetManifest = this.findLastManifestWithSection(section)
  || this.manifestDirs[0];
```

### Layer 4: Utilities

**FuzzyMatch.js** - Fuzzy string matching
```javascript
score(str, search) {
  // 1.0 = exact match
  // 0.8-1.0 = contains match (weighted by length ratio)
  // 0.3-0.7 = sequential character match (weighted by density)
  // 0.0-0.3 = partial character match
}

clean(str) {
  // Remove numeric prefixes: "001_main" → "main"
  // Lowercase: "Main" → "main"
  // Remove separators: "main-section" → "mainsection"
}
```

**persona-core.js** - Template operations
```javascript
sortReferences(refs) {
  // Sort by: section number → subsection number → filename
}

addFileToTemplate(template, newRef, filePath) {
  // 1. Extract deps from file
  // 2. Find slot collisions
  // 3. Remove conflicting refs
  // 4. Add deps + new ref
  // 5. Sort by slot key
}
```

**formatMarkdown.js** - Section header injection
```javascript
analyzeSectionStructure(lines) {
  // Find sections with single subsections
  // Return map of section → subsections
}

formatMarkdown(sections) {
  // Combine section + subsection headers for single-item sections
  // "# Output\n## Tone: Independent" → "# Output: Tone - Independent"
}
```

## Data Flow

### Adding a Component

```
User: add slot:tech partial:postgres

1. server.js receives MCP tool call
   ↓
2. Maps slot → section/subsection
   slot:"tech" → section:"010_tech", subsection:null
   ↓
3. PersonaManager.handleAdd()
   ↓
4. MultiManifest.findFile("010_tech", null, "postgres")
   ↓
5. FuzzyMatch.findBest(files, "postgres")
   → Finds "26_postgresql.md"
   ↓
6. Extract dependencies from 26_postgresql.md
   → [@./manifest/020_pattern/02_best_practices.md]
   ↓
7. Calculate slot key
   → "010.26"
   ↓
8. Find conflicts with slot "010.26"
   → Removes old file if exists
   ↓
9. Update template.md
   - Add dependency refs
   - Add new ref
   - Sort by slot key
   ↓
10. Compile template → CLAUDE.local.md
    - Read all @referenced files
    - Strip headers/deps
    - Substitute variables
    - Inject section headers
    - Write output
   ↓
11. Return success to MCP client
```

### Compilation Process

```
template.md:
  @./manifest/001_main/agent.md
  @./manifest/010_tech/17_nodejs.md
  @./manifest/040_output/01_dialect/technical.md

↓ Read each file

001_main/agent.md:
  # Agent Personality
  ## Guidelines
  You are a professional software engineer...

↓ Strip first header, strip @deps

  ## Guidelines
  You are a professional software engineer...

↓ Demote headers (## → ###)

  ### Guidelines
  You are a professional software engineer...

↓ Substitute variables ${VAR}

  ### Guidelines
  You are a professional software engineer working on E-commerce Platform...

↓ Collect all sections

sections = [
  { section: "001_main", content: "### Guidelines\n..." },
  { section: "010_tech", content: "### Node.js\n..." },
  { section: "040_output", content: "### Technical Dialect\n..." }
]

↓ Inject section headers

# Main
### Guidelines
You are a professional software engineer...

# Tech
### Node.js
You build Node.js applications...

# Output: Technical Dialect
You communicate clearly and precisely...

↓ Write to CLAUDE.local.md with PAGEANT_ID

<!-- PAGEANT_ID: c--user--myproject -->

# Main
### Guidelines
...
```

## Agent Portability

### Stable ID System

**Problem:** Template storage was path-based (`plans/C--project--path/`)
- Moving project breaks persona lookup
- Renaming directory breaks persona lookup
- Case sensitivity issues (FS vs fs)
- Can't copy agents (path collision)

**Solution:** Stable IDs embedded in CLAUDE.local.md

```markdown
<!-- PAGEANT_ID: c--user--project--.pageant--agent_role -->
<!-- PAGEANT_ROOT: D:\tools -->
```

**ID Generation:**
```javascript
generateIdFromPath(path) {
  // Lowercase, replace separators, remove special chars
  // C:\User\Project\.pageant\Agent → c--user--project--.pageant--agent

  return path
    .toLowerCase()
    .replace(/[:\\/]/g, '--')
    .replace(/[^a-z0-9_-]/g, '_');
}
```

**Move Detection:**
```javascript
// On compilation:
const existingId = extractPageantId(claudeLocalMd);

if (existingId && fs.existsSync(`plans/${existingId}/template.md`)) {
  // ID found, template exists → use existing template
  projectDirName = existingId;
} else {
  // No ID or template doesn't exist → generate new ID
  projectDirName = generateIdFromPath(cwd);
  embedIdInClaudeLocal(projectDirName);
}
```

**Copy Detection:**
```javascript
// If ID exists but template already loaded elsewhere:
if (existingId && this.isTemplateInUse(existingId)) {
  // This is a copy → generate new ID
  const newId = `${existingId}--copy--${Date.now()}`;
  embedIdInClaudeLocal(newId);
  return newId;
}
```

### Project-Scoped MCPs

Each deployed agent carries a project-scoped `.mcp.json` alongside its `CLAUDE.local.md`. New agents are created by copying an existing agent directory, not generated.

**Claude Code MCP Resolution Order:**
1. `.mcp.json` in current working directory (highest priority)
2. `~/.claude.json` global config (lowest priority)

**Agent Structure:**
```
.pageant/
├── fs/
│   ├── .mcp.json           # Agent-specific MCPs (copied from template)
│   ├── CLAUDE.local.md     # Persona (with PAGEANT_ID)
│   └── .claude/
│       └── settings.local.json
```

## Manifest System

### Section Organization

```
manifest/
├── 001_main/              # Slot 001 - Core personality (ONE active)
├── 005_jobs/              # Slot 005 - Professional role (ONE active)
├── 010_tech/              # Slot 010.X - Technical knowledge (MANY active)
│   ├── 15_mcp_author.md   # Slot 010.15
│   ├── 17_nodejs.md       # Slot 010.17
│   └── 26_postgresql.md   # Slot 010.26
├── 020_pattern/           # Slot 020.X - Behavioral patterns (MANY active)
├── 040_output/            # Slot 040.X - Communication style
│   ├── 01_dialect/        # Slot 040.01.X
│   ├── 02_narration/      # Slot 040.02.X
│   └── 03_tone/           # Slot 040.03.X
└── 999_end/               # Slot 999 - Final override (ONE active)
```

**Slot Key Rules:**
- **Only numbered components** count toward slot key
- **Non-numbered directories** are organizational only
- **Depth determines granularity**

Examples:
```
010_tech/17_nodejs.md                    → 010.17
010_tech/backend/17_nodejs.md            → 010.17 (backend not numbered)
010_tech/15_backend/17_nodejs.md         → 010.15.17
040_output/01_dialect/technical.md       → 040.01
040_output/dialect/technical.md          → 040 (dialect not numbered)
```

### Component Dependencies

**Syntax:**
```markdown
# Component Title
@./manifest/020_pattern/02_best_practices.md
@./manifest/010_tech/utils/logging.md

## Content starts here
...
```

**Rules:**
- Dependencies listed before first `#` header
- Resolved recursively
- Circular dependencies prevented via `processed` Set
- Missing dependencies logged, don't crash compilation

**Auto-Loading:**
When you add a component, its dependencies are automatically added to the template first.

## Variable System

### Three-Tier Cascade

**1. Manifest Defaults** (`manifest/default_vars.txt`)
```
DEBUG_MODE=false
LOG_LEVEL=info
```

**2. Global Defaults** (`plans/default_vars.txt`)
```
LOG_LEVEL=debug  # Overrides manifest
PROJECT_NAME=Untitled
```

**3. Project Overrides** (`plans/{id}/vars.txt`)
```
PROJECT_NAME=E-commerce Platform  # Final value
TECH_STACK=React, Node.js, PostgreSQL
```

### Substitution

**Pattern:** `${VARIABLE_NAME}` in markdown files

**Process:**
```javascript
substituteVariables(text) {
  for (const [key, value] of Object.entries(this.variables)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    text = text.replace(regex, value);
  }
  return text;
}
```

**No escaping:** Can't include literal `${...}` in text
**No validation:** Undefined variables stay as-is (`${MISSING}` → `${MISSING}`)

## Testing Strategy

### Test Coverage

**Well-Tested:**
- ✓ MultiManifest.js (383 lines of tests)
  - File finding across N directories
  - Priority/override behavior
  - Write operations
  - Edge cases (permissions, missing dirs)
- ✓ FuzzyMatch.js (160 lines of tests)
  - Exact matching
  - Contains matching
  - Sequential matching
  - Object extraction

**Untested:**
- ✗ PersonaManager.js (0 tests, 1759 lines)
- ✗ Slot collision logic
- ✗ Compilation process
- ✗ Inline overrides (thrift/talent)
- ✗ Agent building
- ✗ Web editor

### Test Infrastructure

**vitest.config.js:**
```javascript
{
  environment: 'node',
  testTimeout: 10000,  // Filesystem operations
  watchExclude: ['**/plans/**', '**/manifest/**']  // Exclude generated data
}
```

**Test Pattern:**
```javascript
describe('MultiManifest', () => {
  let tempDirs = [];

  beforeEach(async () => {
    // Create temp directories
  });

  afterEach(async () => {
    // Clean up temp directories
  });

  it('should find files across N directories', async () => {
    // Use real filesystem, no mocks
  });
});
```

## Known Issues

### 1. Shared Dependency Removal

**Problem:** If files A and B both depend on C, removing A also removes C (breaks B)

**Location:** PersonaManager.js:1221-1237

**Solution:** Implement reference counting for dependencies

### 2. No Undo/Rollback

**Problem:** Removals are permanent, can't revert changes

**Workaround:** Keep backups of template.md

**Future:** Add `.pageant/history/` with snapshots

### 3. Inline Override Testing

**Problem:** Thrift/talent features are untested

**Location:** PersonaManager.js:640-660 (parsing), 678-735 (compilation)

**Risk:** Critical feature, no coverage

### 4. Hardcoded Web Editor Port

**Problem:** Port 52100 hardcoded, conflicts if already in use

**Location:** WebEditor.js:11

**Solution:** Add port range fallback (52100-52110)

## Performance Characteristics

**Compilation:** O(n*m) where n=template lines, m=avg file size
- Typical: 50-200ms (10-20 components, 2KB each)
- Large: 500ms-1s (50+ components, 10KB each)

**Fuzzy Matching:** O(n*m) where n=files, m=search length
- Typical: <10ms (100 files)
- Large: 50-100ms (1000+ files)

**Multi-Manifest Lookup:** O(n*m) where n=manifests, m=files per manifest
- Linear scan per manifest
- No caching of directory listings
- Acceptable for 2-5 manifests with 100-500 files each

**Bottlenecks:**
- Full file reads (no streaming)
- Sequential manifest loading (could parallelize)
- No string caching in FuzzyMatch
- Recursive dependency resolution (potential exponential blowup)

## Future Improvements

### High Priority
1. Add PersonaManager test suite
2. Implement reference counting for dependencies
3. Add undo/rollback system
4. Validate inline overrides

### Medium Priority
1. Extract TemplateCompiler from PersonaManager
2. Add variable introspection tools
3. Add manifest provenance tracking
4. Parallelize manifest loading

### Low Priority
1. Migrate to TypeScript
2. Cache directory listings
3. Stream large files
4. Add performance monitoring
