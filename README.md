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
node launch-editor.js
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

### Directory Naming Convention

- `XXX_name` - **SLOT**: Only one file can be active (underscore)
- `XXX-name` - **LIST**: Multiple files accumulate (dash)
- Number prefix determines compilation order

## MCP Tools Reference

These tools are available in Claude Desktop after MCP Pageant is configured:

### `add` - Add Persona Components
Adds a persona component to your current configuration. Components stack based on their type (SLOT vs LIST).

**Parameters:**
- `section` (required): Target section like 'main', 'tech', 'jobs', 'output'
- `subsection` (optional): Subsection like 'tone', 'dialect', 'narration'
- `partial` (required): Filename pattern or 'random' for random selection

**Examples:**
```javascript
// Add a main persona (replaces current)
add section:main partial:agent

// Add technical knowledge (accumulates)
add section:tech partial:postgresql
add section:tech partial:docker

// Add communication style
add section:output subsection:tone partial:independent

// Random selection from a section
add section:tech partial:random
```

### `remove` - Remove Persona Components
Removes components from the configuration. Can remove entire sections or specific files.

**Parameters:**
- `section` (required): Section to remove from
- `subsection` (optional): Specific subsection
- `partial` (optional): Specific file pattern

**Examples:**
```javascript
// Remove a specific tech component
remove section:tech partial:postgresql

// Remove all tech components
remove section:tech

// Remove a subsection
remove section:output subsection:tone
```

### `list` - Browse Available Components
Shows all available persona components you can add.

**Parameters:**
- `section` (optional): Filter by section
- `subsection` (optional): Filter by subsection

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
node launch-editor.js
```

Access at `http://localhost:52100`

Features:
- Visual component browser
- Real-time persona preview
- Drag-and-drop composition
- Variable configuration

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