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
- Contains organized sections (001_main, 010_tech_list, etc.)
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

### Directory Naming Convention

**SLOT Directories** (format: `NNN_name`):
- Only ONE file can be active at a time
- Adding a new file removes previous SLOT entry
- Examples: `001_main`, `030_jobs`, `040_output`

**LIST Directories** (format: `NNN_name_list`):
- Multiple files accumulate
- All added files remain active
- Examples: `010_tech_list`, `020_pattern_list`

### Section Organization

Standard sections:
- `001_main`: Core personality (SLOT)
- `010_tech_list`: Technical knowledge (LIST)
- `020_pattern_list`: Behavioral patterns (LIST)
- `030_jobs`: Professional roles (SLOT)
- `040_output`: Communication styles (SLOT with subsections)
- `080_user`: User context (SLOT)
- `999_end`: Final overrides (SLOT)

### Subsection Rules

- Subsections can have arbitrary depth (e.g., `010_tech_list/frontend/react/hooks/`)
- Subdirectories must NOT begin with digits (0-9)
- All `.md` files discovered recursively
- Organizes related components logically

## Configuration

### Environment Variables (.env)

```bash
# Location of compiled personas (default: ./plans)
PLANS_DIR=./plans

# Comma-separated manifest directories
# First is root manifest, rest are extensions
# Later directories override earlier for SLOT entries
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
@./../shared/manifest/010_tech_list/typescript.md
```

### Dependency Resolution

When adding a file via `add` tool:
1. Extracts all `@` dependencies recursively from target file
2. Adds dependencies to template first
3. Adds target file last
4. For SLOT directories: removes existing SLOT entry before adding
5. Compiles immediately

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
- For SLOT sections: later manifests take priority
- For LIST sections: all manifests contribute
- File lookup uses fuzzy matching for user convenience

## MCP Tools

### `add`
Add persona component to template.

**Parameters:**
- `section` (required): Section name (fuzzy matched)
- `subsection` (optional): Subsection path (fuzzy matched)
- `partial` (required): Filename pattern or "random"

**Behavior:**
- Fuzzy matches section/subsection names
- Extracts and adds dependencies recursively
- Removes existing SLOT entries when adding to SLOT
- Compiles immediately after adding

### `remove`
Remove persona component from template.

**Parameters:**
- `section` (required): Section to remove from
- `subsection` (optional): Specific subsection
- `partial` (optional): Specific file pattern

**Behavior:**
- Removes LIST dependencies automatically
- Preserves SLOT dependencies for other files
- Compiles immediately after removal

### `list`
Browse available persona components.

**Parameters:**
- `section` (optional): Filter by section
- `subsection` (optional): Filter by subsection

**Behavior:**
- Displays all manifests (root and extensions)
- Shows section/subsection hierarchy
- Indicates SLOT vs LIST types

### `inspect`
Show current template composition (added via tools.json).

**Parameters:**
- None

**Behavior:**
- Reads `template.md` for current project
- Parses all `@` references
- Groups by section with SLOT/LIST indicators
- Shows which files are currently active
- Explains SLOT (only one) vs LIST (multiple) behavior

**Example Output:**
```
Current Template (D--claudeTools):

# Main (SLOT - only one active)
  @becca

# Tech List (LIST - accumulates)
  @windows_bash
  @nodejs

# Look (SLOT - only one active per subsection)
  @becca_body
  @daddy_girl_hair
  @pink_crop_top

Total: 6 active references
```

### `create`
Create new persona component.

**Parameters:**
- `section` (required): Target section
- `subsection` (optional): Target subsection (required for some sections)
- `filename` (required): Filename with `.md` extension
- `secondperson_prompt_from_system_to_assistant` (required): Content in second person

**Guidelines:**
- Write in second person: "You are...", "You must...", "You always..."
- 200 chars: Quick reminders
- 700 chars: Complex instructions
- 1k-6k chars: Primary roles

**Behavior:**
- Generates proper markdown structure
- Writes to appropriate manifest directory (last directory with section)
- Returns suggested `add` command

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

For SLOT sections:
- Adding file from extension removes root SLOT entry
- Ensures only one file active per SLOT

For LIST sections:
- All manifests contribute
- No override behavior

### File Discovery

Recursive search algorithm:
- Searches section directory and all subdirectories
- Ignores directories starting with digits at section level
- Includes all `.md` files found
- Returns files sorted by manifest priority

## Compilation Details

### Header Stripping

When compiling referenced files:
- Removes first `#` header only (main title)
- Preserves all subsection headers (`##`, `###`)
- Strips blank lines after main header
- Removes all `@` dependency lines

### Section Header Injection

Compiler adds organizational headers:
- `#` headers for section directories (e.g., "# Main", "# Tech List")
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
- Keeps role play/domain-specific tools separate from core pageant

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
- `section`: Fixed section (e.g., "070_look")
- `useSubsectionParam`: If true, uses `args.subsection` parameter
- Example: `update_look` tool for changing appearance

**`inspect_template` handler:**
- Calls `PersonaManager.handleInspect`
- Shows current template composition
- No parameters needed
- Displays SLOT vs LIST sections

### Example: Look Management Tool

```json
{
  "name": "update_look",
  "description": "Swap out segments of your appearance for image generation",
  "inputSchema": {
    "type": "object",
    "properties": {
      "subsection": {
        "type": "string",
        "enum": ["1_body", "3_hair", "4_attire", "5_style", "6_place"]
      },
      "partial": {
        "type": "string"
      }
    },
    "required": ["subsection", "partial"]
  },
  "handler": {
    "type": "add",
    "section": "070_look",
    "useSubsectionParam": true
  }
}
```

This creates `update_look` tool that specifically targets appearance sections, integrating with selfie MCP for image generation.

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
- 'look' sections define appearance for image generation
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