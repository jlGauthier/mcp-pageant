 # MCP Pageant

A Model Context Protocol (MCP) server for dynamic persona management in AI assistants. Build and hot-swap modular personas composed of behavioral patterns, technical knowledge, and communication styles.

> **Why "Pageant"?** We wanted "agents" but Claude already owns that namespace. So: persona-agent → p-agent → pageant. Yes, we got cheeky.

## What is MCP?

Model Context Protocol (MCP) is a standardized protocol that enables AI assistants to interact with external tools and data sources. MCP servers provide structured access to functionality that extends an AI assistant's capabilities beyond its base training.

## The Problem We Solve

It's 2025. AI agents write code 100x faster but with limited context windows. Engineers switch between projects constantly, expected to work across different languages, frameworks, patterns, and platforms daily. Generic AI assistants struggle to maintain the right technical context and approach for each unique project.

**MCP Pageant solves this by enabling:**
- **Project-specific AI configurations** - Each project gets its own specialized agent
- **Mix-and-match expertise** - Combine only the technical knowledge you need
- **Multi-agent workflows** - Deploy different specialized agents for different parts of your stack
- **Persistent context** - Each agent maintains its own system prompt and history
- **Rapid context switching** - Hot-swap between configurations as you switch tasks

## What Does MCP Pageant Do?

MCP Pageant acts as a **persona configuration system** for AI assistants. Instead of having a single fixed personality, it allows you to:

- **Compose personas from modular components** - Mix technical knowledge, behavioral patterns, and communication styles
- **Hot-swap personas on the fly** - Change the assistant's behavior without restarting
- **Create specialized agents** - Build task-focused assistants with specific capabilities
- **Maintain consistency** - Personas compile to a single configuration that persists across sessions

Think of it as a character sheet system for AI - you can build different "builds" optimized for different tasks.

## Installation & Setup

### Prerequisites
- Node.js 18+ installed
- Claude Desktop application (from Anthropic)

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp_pageant.git
cd mcp_pageant

# Install dependencies
npm install
```

### Optional: Environment Configuration

Create a `.env` file to customize paths (defaults shown):

```bash
# Location of compiled personas (default: ./plans)
PLANS_DIR=./plans

# Comma-separated manifest directories (default: ./manifest)
# Useful for sharing components across projects
MANIFEST_DIRS=./manifest,../shared_personas/manifest
```

### Step 2: Configure Claude Desktop

1. Locate your Claude Desktop config file:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Add the MCP Pageant server configuration:

```json
{
  "mcpServers": {
    "pageant": {
      "command": "node",
      "args": ["D:\\path\\to\\mcp_pageant\\server.js"]
    }
  }
}
```

3. Restart Claude Desktop to load the MCP server

### Step 3: Verify Installation

In Claude Desktop, you should see the MCP tools available. Type:
```
list
```
This should show available persona components if properly connected.

### Step 4: Initial Setup

```bash
# Test the server standalone
npm start

# Launch the web editor (optional)
bun launch-editor.js
# Opens at http://localhost:52100
```

## Core Concepts

### Manifest Structure

The `/manifest` directory contains persona components organized by type:

```
/manifest
├── 001_main/           # Core personas (one active at a time)
├── 010_tech_list/      # Technical knowledge (accumulates)
├── 020_pattern_list/   # Behavioral patterns (accumulates)
├── 030_jobs/           # Professional roles (one active)
├── 040_output/         # Communication styles
└── 999_end/            # Final overrides
```

### Slot Key System

**Everything is a slot.** Path depth determines slot granularity via numbered components.

**How Slot Keys Work:**
- Slot key = all numbered path components joined with dots
- `001_main/engineer.md` → slot key: `001`
- `010_tech/15_mcp_author.md` → slot key: `010.15`
- `040_output/01_dialect/technical.md` → slot key: `040.01`

**Slot Collision:**
- Only ONE file can occupy each slot key
- Adding a file to an occupied slot replaces the existing file
- Files with different slot keys coexist independently

**Directory Naming:**
- Numbered directories create slot components (e.g., `001_main`, `010_tech`)
- Numbered files create unique slot keys (e.g., `15_mcp.md` → slot `010.15`)
- Non-numbered subdirectories are organizational only (don't affect slot keys)

## MCP Tools Reference

These tools are available in Claude Desktop after MCP Pageant is configured:

### `add` - Add Persona Components
Adds a persona component to your current template. If the file occupies a slot key that's already in use, it replaces the existing file in that slot.

**Parameters:**
- `section` (required): Target section like 'main', 'tech', 'jobs', 'output' (supports fuzzy matching)
- `subsection` (optional): Subsection like 'tone', 'dialect', 'narration' (supports fuzzy matching)
- `partial` (required): Filename pattern or 'random' for random selection

**Slot Behavior:**
- Determines slot key from file's numbered path components
- Replaces any existing file with the same slot key
- Files with different slot keys coexist

**Fuzzy Matching:**
- Section and subsection names don't need to be exact
- Numeric prefixes are optional (both '001_main' and 'main' work)
- Underscores and hyphens are ignored in matching

**Examples:**
```javascript
// Add a main persona (typically slot 001)
add section:main partial:agent

// Fuzzy matching works too
add section:tech partial:postgres  // Finds 'postgresql'
add section:out subsection:ton partial:indep  // Finds 'output/tone/independent'

// Add technical knowledge with unique slot keys
add section:tech partial:postgresql  // e.g., slot 010.26
add section:tech partial:docker      // e.g., slot 010.08 - coexists

// Add communication style
add section:output subsection:tone partial:independent

// Random selection from a section
add section:tech partial:random
```

### `remove` - Remove Persona Components
Removes components from your template by slot key or pattern.

**Parameters:**
- `section` (required): Section to remove from
- `subsection` (optional): Specific subsection
- `partial` (optional): Specific file pattern

**Behavior:**
- With `partial`: Removes specific file matching the pattern
- Without `partial`: Removes all files in the specified section/subsection

**Examples:**
```javascript
// Remove a specific file by slot key
remove section:tech partial:postgresql

// Remove all files in a section
remove section:tech

// Remove all files in a subsection
remove section:output subsection:tone
```

### `list` - Browse Available Components
Shows all available persona components from your configured manifest directories.

**Parameters:**
- `section` (optional): Filter by section
- `subsection` (optional): Filter by subsection

**Output:**
- Shows file paths with their numbered components
- Groups by section and subsection
- Displays all configured manifest directories

**Examples:**
```javascript
// List everything available
list

// List only tech components
list section:tech

// List specific subsection
list section:output subsection:tone
```

### `set_var` - Configure Variables
Sets dynamic variables that get substituted in persona templates.

**Parameters:**
- `variable` (required): Variable name (e.g., 'PROJECT_NAME')
- `value` (required): Value to set

**Examples:**
```javascript
// Set project context
set_var variable:PROJECT_NAME value:"E-commerce Platform"
set_var variable:TECH_STACK value:"React, Node.js, PostgreSQL"
set_var variable:DEBUG_MODE value:true
```

### `web_editor` - Visual Interface
Launches a web-based visual editor for managing personas.

**Parameters:**
- `action` (required): Either 'open' or 'close'

**Examples:**
```javascript
// Open the editor
web_editor action:open
// Navigate to http://localhost:52100

// Close the editor
web_editor action:close
```

### `build_agent` - Create Specialized Agents
Creates a new agent with its own persona and MCP configuration.

**Parameters:**
- `name` (required): Agent identifier (alphanumeric + underscores/hyphens)
- `mcps` (required): List of MCP servers to include

**Examples:**
```javascript
// Create a frontend specialist
build_agent name:frontend_agent mcps:["pageant", "filesystem"]

// Create a database expert
build_agent name:db_agent mcps:["pageant", "postgresql"]
```

### `create` - Write New Persona Components
Create new persona components directly without manually editing files.

**Parameters:**
- `section` (required): Target section for the new component
- `subsection` (optional): Subsection for organization (required for output sections)
- `filename` (required): Name of the file to create (include .md extension)
- `secondperson_prompt_from_system_to_assistant` (required): Content in second person ("You are...", "You must...")

**Content Guidelines:**
- 200 chars: Quick behavioral reminders
- 700 chars: Complex instructions or patterns
- 1k-6k chars: Primary roles (main personality, specialized engineers)

**Examples:**
```javascript
// Create a new main persona
create section:main filename:hacker.md secondperson_prompt_from_system_to_assistant:"You are an elite hacker. You think in exploits and vulnerabilities..."

// Add a new technical component
create section:tech filename:rust.md secondperson_prompt_from_system_to_assistant:"You write idiomatic Rust code. You prefer zero-cost abstractions..."

// Create a tone modifier
create section:output subsection:tone filename:flirty.md secondperson_prompt_from_system_to_assistant:"You communicate with playful innuendo and subtle flirtation..."
```

## Multi-Agent Architecture

In modern development, different parts of your system need different expertise:

- **Frontend Agent**: React, TypeScript, CSS, accessibility patterns
- **Backend Agent**: Node.js, PostgreSQL, REST APIs, authentication
- **DevOps Agent**: Docker, Kubernetes, CI/CD, monitoring
- **QA Agent**: Testing strategies, Selenium, performance testing

Each agent:
- Maintains its own conversation history
- Has its own specialized system prompt
- Focuses on its domain without conflicting knowledge
- Can be updated independently as your stack evolves

## Examples

### Creating a Backend Engineer Persona

```javascript
// Add core engineering persona
add section:main partial:agent

// Add technical knowledge
add section:tech partial:nodejs
add section:tech partial:postgresql
add section:tech partial:docker

// Add backend role
add section:jobs partial:back_eng

// Add communication style
add section:output/tone partial:independent_motivation
```

### Building a QA Engineer Persona

```javascript
// Start with professional base
add section:main partial:professional

// Add testing expertise
add section:tech partial:jest
add section:tech partial:selenium
add section:tech partial:cypress

// Add QA role
add section:jobs partial:QA_eng
```

## Web Editor

Launch the visual editor for easier persona management:

```bash
bun launch-editor.js
```

Access at `http://localhost:52100`

Features:
- **Visual component browser** - Tree view of all available components
- **Real-time persona preview** - See compiled persona as you build
- **Project switching** - Switch between different project personas
- **Fuzzy search** - Find components without exact names
- **Auto-refresh** - Changes update immediately
- **Variable configuration** - Set and preview variables

## Creating Custom Components

Add new `.md` files to appropriate manifest directories:

```markdown
# /manifest/010_tech_list/my_tech.md

## My Technology

### DO
- Best practices for this technology
- Recommended patterns

### DON'T
- Common mistakes to avoid
- Anti-patterns
```

## Architecture

```
├── /manifest           # Persona component library
├── /plans             # Compiled persona storage
├── /src               # Core implementation
│   ├── PersonaManager.js    # Main persona engine
│   ├── WebEditor.js        # Web interface backend
│   └── AgentBuilder.js     # Agent creation system
├── /editor-ui         # Web editor frontend
└── server.js          # MCP server entry point
```

## Development

### Running Tests

```bash
npm test
```

### Debug Mode

```bash
DEBUG=mcp:* npm start
```

## How It Works

1. **Component Selection**: Choose persona components from the manifest
2. **Template Building**: Components are added to a template with dependency resolution
3. **Compilation**: Template compiles to final persona with variable substitution
4. **Loading**: Compiled persona loads into the AI assistant's context
5. **Hot-swapping**: Changes compile and reload without restarting

## Advanced Configuration

### Multi-Manifest Support

Configure multiple manifest directories as overlays:

```bash
# .env file
MANIFEST_DIRS=./manifest,../company_personas/manifest,~/shared/ai_personas
```

Manifests work as cascading overlays:
- First directory: Base/source components
- Additional directories: Extensions and overrides
- Later directories have precedence for new file creation
- All directories contribute to available components

### Tool Hints

Add `tool_hints.txt` to any manifest directory to provide guidance when using tools:

```text
# manifest/tool_hints.txt

Professional persona configuration:
- 'tech' sections define technical guidelines
- 'pattern' sections establish behavioral standards
- 'output' sections configure communication style
```

### Project Organization

Each project gets its own persona configuration:
- Personas stored in `plans/<project-path>/persona.md`
- Templates stored in `plans/<project-path>/template.md`
- Variables stored in `plans/<project-path>/vars.txt`
- CLAUDE.local.md automatically references the persona

### Variable Cascading

Variables cascade from multiple sources in order of precedence:

1. **Manifest Variables** - Each manifest directory can have `default_vars.txt`
   - Loaded in order specified in MANIFEST_DIRS
   - Later directories override earlier ones
2. **Global Defaults** - `plans/default_vars.txt`
   - Overrides all manifest variables
3. **Project Variables** - `plans/<project>/vars.txt`
   - Highest precedence, overrides everything

Example cascade:
```bash
# manifest1/default_vars.txt
DEBUG_MODE=false
LOG_LEVEL=info

# manifest2/default_vars.txt
LOG_LEVEL=debug  # Overrides manifest1

# plans/<project>/vars.txt
LOG_LEVEL=error  # Final value
```

## Contributing

Contributions welcome! Areas for improvement:

- New persona components
- Additional MCP tools
- Enhanced web editor features
- Documentation improvements

## License

MIT

## Acknowledgments

Built for use with Anthropic's Claude Desktop application and the Model Context Protocol ecosystem.