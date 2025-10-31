# MCP Pageant - Dynamic Persona Management System

Professional persona management for AI assistants via Model Context Protocol.

## Architecture Overview

### Core Components
```
server.js                # MCP server entry point with tool/resource handlers
├── src/
│   ├── PersonaManager.js    # Core persona compilation engine
│   ├── MultiManifest.js     # Multi-directory file resolution
│   ├── FuzzyMatch.js        # Fuzzy matching for user input
│   ├── formatMarkdown.js    # Persona output formatting
│   ├── WebEditor.js         # Web-based editor backend
│   └── AgentBuilder.js      # Agent scaffolding system
├── manifest/                # Root manifest (persona library)
├── plans/                   # Compiled personas per project
└── .env                     # Configuration
```

### Key Terminology

**Manifest** (Root): Primary persona component library
- Located at `./manifest` by default
- Contains organized sections (001_main, 010_tech, 020_pattern, etc.)
- Configured via `MANIFEST_DIRS` in `.env`

**Extensions**: Additional manifest directories
- Configured via comma-separated `MANIFEST_DIRS`
- Can add new sections or override existing components
- Later directories have priority for new file creation

**Template**: Project-specific composition
- Stored in `plans/<project-path>/template.md`
- References manifest files using `@` notation
- Compiles to `CLAUDE.local.md` for real-time updates

**Plans Directory**: Storage for compiled personas
- One subdirectory per project (based on working directory path)
- Contains: `template.md`, `persona.md`, `vars.txt`

## Manifest Structure

### Slot System

**Everything is a slot.** Path depth determines slot granularity.

**Slot Key Format:**
- Slot key = all numbered path components joined with dots
- Examples:
  - `001_main/engineer.md` → slot: `001`
  - `010_tech/15_mcp_author.md` → slot: `010.15`
  - `040_output/01_dialect/technical.md` → slot: `040.01`

**Slot Collision:**
- Only ONE file can occupy each slot key
- Adding a new file to an occupied slot replaces the existing file
- Different slot keys coexist independently

### Directory Naming Convention

**Numbered Directories** (format: `NNN_name`):
- Section-level directories (e.g., `001_main`, `010_tech`, `020_pattern`)
- All files within must have number prefixes for unique slot keys

**Numbered Files** (format: `NN_filename.md`):
- Files must be prefixed with numbers (e.g., `01_auth0.md`, `15_mcp_author.md`)
- Number determines the slot key at that path depth
- Allows multiple files in the same directory with unique slots

**Numbered Subdirectories** (format: `NN_name`):
- Subsections can be numbered (e.g., `01_dialect`, `3_hair`)
- Creates nested slot keys (e.g., `040.01`, `070.3`)
- Allows independent slots within a section

### Section Organization

Standard sections:
- `001_main`: Core personality
- `010_tech`: Technical knowledge (files must be numbered: `01_`, `02_`, etc.)
- `020_pattern`: Behavioral patterns (files must be numbered)
- `030_jobs`: Professional roles
- `040_output`: Communication styles with numbered subsections (`01_dialect`, `02_narration`, `03_tone`)
- `080_user`: User context
- `999_end`: Final overrides

### Subsection Rules

- Subsections can have arbitrary depth (e.g., `010_tech/frontend/react/01_hooks.md`)
- Numbered subdirectories create nested slot keys
- Non-numbered subdirectories are organizational (don't affect slot keys)
- All `.md` files must have number prefixes for unique slot assignment
- Organizes related components logically

## Configuration

### Environment Variables (.env)

```bash
# Location of compiled personas (default: ./plans)
PLANS_DIR=./plans

# Comma-separated manifest directories
# First is root manifest, rest are extensions
# Later directories have priority for file resolution
MANIFEST_DIRS=./manifest,../shared_personas/manifest
```

### Variable Substitution

Variables cascade with precedence:
1. Manifest defaults (`manifest/default_vars.txt` - each manifest loads in order)
2. Global defaults (`plans/default_vars.txt`)
3. Project overrides (`plans/<project>/vars.txt`)

Variables use `${VAR_NAME}` syntax in persona files.

## Template System

### Reference Syntax

Templates use `@` notation to reference manifest files:

```markdown
@./manifest/001_main/agent.md
@./../shared/manifest/010_tech/26_typescript.md
```

### Dependency Resolution

When adding a file via `add` tool:
1. Extracts all `@` dependencies recursively from target file
2. Removes existing files in conflicting slot keys (slot collision detection)
3. Adds dependencies to template first
4. Adds target file last
5. Compiles immediately

**Slot Collision Handling:**
- Before adding, determines the slot key for the new file and all its dependencies
- Removes any existing file occupying the same slot key
- Ensures only one file per slot key in the final template

### Compilation Process

1. Read `template.md` from `PLANS_DIR/<project>/`
2. Resolve each `@` reference using MultiManifest priority
3. Strip main headers and `@` lines from content
4. Apply variable substitution (`${VAR}` → value)
5. Format with proper section headers
6. Write to `CLAUDE.local.md` in working directory
7. **Fail loudly if any reference is missing**

### Manifest Path Resolution

MultiManifest searches directories in reverse order (extensions first):
- Later directories (extensions) override earlier (root)
- File lookup uses fuzzy matching for user convenience
- Slot collision happens at template level, not manifest level
- All manifests contribute files, but final template enforces slot uniqueness

## MCP Tools

### `add`
Add persona component to template.

**Parameters:**
- `slot` (required): Slot identifier from enum (e.g., "tech", "output/dialect")
- `partial` (required): Filename pattern or "random"

**Behavior:**
- Slot parameter parsed into section/subsection internally
- Extracts and adds dependencies recursively
- Removes existing files in conflicting slot keys (slot collision detection)
- Compiles immediately after adding

**Slot Examples:**
```
slot: "tech" + partial: "mcp_author"
→ Adds: 010_tech/15_mcp_author.md (slot key: 010.15)

slot: "output/dialect" + partial: "technical"
→ Adds: 040_output/01_dialect/technical.md (slot key: 040.01)
```

**Slot Key Collision:**
- Each file has a slot key derived from numbered path components
- Adding a file removes any existing file with the same slot key
- Example: Adding `010_tech/15_mcp_author.md` removes any existing file with slot key `010.15`

### `remove`
Remove persona component from template.

**Parameters:**
- `slot` (required): Slot identifier from enum (e.g., "tech", "output/dialect")
- `partial` (optional): Specific file pattern to remove

**Behavior:**
- Slot parameter parsed into section/subsection internally
- Removes the specified file and its dependencies by slot key
- Without `partial`: removes all files in the slot
- With `partial`: removes specific file matching pattern
- Dependencies are removed to avoid orphaned references
- Compiles immediately after removal

### `list`
Browse available persona components.

**Parameters:**
- `slot` (optional): Slot identifier to filter results (leave empty for all)

**Behavior:**
- Slot parameter parsed into section/subsection internally
- Displays all manifests (root and extensions)
- Shows section/subsection hierarchy
- Shows all available files with their numbering
- Without `slot`: lists all sections
- With `slot`: lists files in specific slot

### `inspect`
Show current template composition (added via tools.json).

**Parameters:**
- None

**Behavior:**
- Reads `template.md` for current project
- Parses all `@` references
- Groups by section and displays slot keys
- Shows which files are currently active
- Explains slot key system

**Example Output:**
```
Current Template (D--claudeTools):

# Main
  @agent [slot: 001]

# Tech
  @15_mcp_author [slot: 010.15]
  @28_working_in_windows_11 [slot: 010.28]

# Pattern
  @02_long_term_outlook [slot: 020.02]
  @03_terminal_calude_code_update_bug [slot: 020.03]

# Output
  @01_technical_dialect [slot: 040.01]

Total: 6 active references

Slot system: Path depth determines slot granularity
  001_main/file.md              → slot: 001
  040_output/01_dialect/file.md → slot: 040.01
```


### `set_var`
Set project-specific variable.

**Parameters:**
- `variable` (required): Variable name (enum from default_vars.txt)
- `value` (required): New value

**Behavior:**
- Writes to `plans/<project>/vars.txt`
- Overrides manifest and global defaults
- Variables available immediately in next compilation

### `web_editor`
Launch visual persona editor.

**Parameters:**
- `action` (optional): "open" or "close" (default: "open")

**Behavior:**
- Starts HTTP server (port 5442)
- Provides visual component browser
- Real-time persona preview
- Auto-refreshes on template changes

### `build_agent`
Create new agent with directory structure.

**Parameters:**
- `name` (required): Agent identifier (alphanumeric + underscores/hyphens)
- `mcps` (optional): List of MCP servers (default: ["pageant"])

**Behavior:**
- Creates agent directory structure
- Sets up agent-specific MCP configuration
- Initializes empty persona template

## MultiManifest System

### Priority Rules

File resolution order (reverse search):
1. Last extension manifest checked first
2. Middle extension manifests
3. Root manifest checked last
4. First match wins

Slot collision detection:
- All manifests contribute files
- Final template enforces slot uniqueness via slot keys
- Files with identical slot keys collide (last added wins)
- Different slot keys coexist independently

### File Discovery

Recursive search algorithm:
- Searches section directory and all subdirectories
- Includes all `.md` files found (numbered and unnumbered)
- Returns files sorted by manifest priority
- Numbered files create unique slot keys based on path depth

## Compilation Details

### Header Stripping

When compiling referenced files:
- Removes first `#` header only (main title)
- Preserves all subsection headers (`##`, `###`)
- Strips blank lines after main header
- Removes all `@` dependency lines

### Section Header Injection

Compiler adds organizational headers:
- `#` headers for section directories (e.g., "# Main", "# Tech", "# Pattern")
- `##` headers for numbered subsections
- Tracks seen sections to avoid duplicates

### Format Normalization

Final formatting pass:
- Ensures blank line before section headers
- Removes duplicate consecutive headers
- Normalizes header levels based on hierarchy
- Caps at `###` for deeply nested content

## Error Handling

### Strict Compilation

No silent failures:
- Missing file referenced in template → Error with exact path
- Invalid variable reference → Warning
- Malformed `@` path → Error
- Duplicate `/manifest/` in path → Warning with auto-fix

### Common Errors

**"File not found" during compilation:**
- Template references file that doesn't exist in any manifest
- Check `@` path syntax
- Verify file exists in configured manifests

**"File has been unexpectedly modified":**
- Claude Code file modification bug
- Use absolute Windows paths with drive letters for file operations
- See: https://github.com/anthropics/claude-code/issues/7443

## Development Guidelines

### Testing

Always load `.env` when testing:
```javascript
import dotenv from 'dotenv';
dotenv.config();
// Your test code here
```

### Path Handling

- Use absolute paths in `.env` configuration
- MultiManifest handles cross-platform paths internally
- References in templates use forward slashes
- Windows paths converted automatically for ComfyUI integration

### Manifest Organization

Best practices:
- Use descriptive filenames for fuzzy matching
- Keep subdirectories shallow for readability
- Organize related components together
- Document dependencies at top of files

### Variable Naming

Conventions:
- UPPERCASE_WITH_UNDERSCORES
- Descriptive names (PROJECT_NAME not PN)
- Define in manifest `default_vars.txt` for tool enum

## Project Directory Naming

Project paths converted to directory names:
- `D:\projects\my-app` → `D--projects--my-app`
- Used for `plans/<project-name>/` subdirectory
- Ensures unique persona per project

## Custom Tools (tools.json)

Manifests can define domain-specific tools via `tools.json`:
- Located alongside manifest sections
- Loaded from all configured manifest directories
- Extends MCP with specialized functionality
- Keeps domain-specific tools separate from core pageant

### Format

```json
[
  {
    "name": "tool_name",
    "description": "What this tool does",
    "inputSchema": {
      "type": "object",
      "properties": {
        "param_name": {
          "type": "string",
          "description": "Parameter description"
        }
      },
      "required": ["param_name"]
    },
    "handler": {
      "type": "handler_type",
      "section": "optional_section",
      "useSubsectionParam": true
    }
  }
]
```

### Handler Types

**`add` handler:**
- Forwards to `PersonaManager.handleAdd`
- `section`: Fixed section (e.g., "040_output")
- `useSubsectionParam`: If true, uses `args.subsection` parameter
- Example: Custom tools for specific section management

**`inspect_template` handler:**
- Calls `PersonaManager.handleInspect`
- Shows current template composition
- No parameters needed
- Displays slot keys for each active file

## Tool Hints

Each manifest can include `tool_hints.txt`:
- Appended to tool descriptions in MCP
- Provides context-specific guidance
- Helps users understand available components

Example:
```text
Professional persona configuration:
- 'tech' sections define technical guidelines
- 'pattern' sections establish behavioral standards
- 'output' sections configure communication style
```

## Web Editor

Accessible at `http://localhost:5442` when active:
- Tree view of all manifests and components
- Real-time compiled persona preview
- Variable editor with live substitution
- Project selector
- Fuzzy search across all components

---

**Professional Persona Management for AI Assistants**