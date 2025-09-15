# MCP Pageant - Dynamic Assistant Configuration System

## Overview
MCP Pageant is a Model Context Protocol (MCP) server that enables dynamic persona management for AI assistants. It provides a modular system for composing different behavioral traits, communication styles, and specialized capabilities.

## Key Features

### 🎭 Dynamic Persona System
- **Modular Architecture**: Mix and match persona components to create unique assistant configurations
- **Hot-swappable Personas**: Change assistant behavior on the fly without restarting
- **Template System**: Build complex personas from reusable components

### 🛠️ Developer Tools
- **Web Editor**: Visual interface for managing and testing personas
- **Agent Builder**: Automated tool for creating new specialized agents
- **Variable System**: Dynamic substitution for customizable persona attributes

### 📦 Pre-built Personas
- **Professional**: Standard helpful assistant with focus on accuracy
- **Snitch**: Meticulous reporter that catches every issue
- **Asshole**: Brutally honest code reviewer (breaks conventional patterns)
- **Wolf**: Surgical problem solver for complex debugging
- **Agent**: Specialized task-focused assistant

## Architecture

### Directory Structure
```
/manifest                    # Persona component library
  /001_main                 # Core persona definitions
  /010_tech_list           # Technical capability modules
  /020_pattern_list        # Behavioral patterns
  /030_ref_list           # Reference materials
  /040_output             # Communication styles
    /01_dialect          # Language variations
    /02_narration        # Narrative styles
    /03_tone            # Emotional tones
  /080_user             # User preference profiles
  /999_end              # Final overrides

/src                      # Core implementation
  PersonaManager.js       # Main persona engine
  AgentBuilder.js        # Agent creation system
  WebEditor.js           # Web interface backend

/editor-ui               # Web editor frontend
/plans                   # Compiled persona storage
```

## MCP Tools

### Core Commands

#### `add`
Add a persona segment to the current configuration
- **section**: Target section (e.g., 'main', 'tech', 'output')
- **subsection**: Optional subsection for nested components
- **partial**: Filename pattern to match

#### `remove`
Remove a persona segment from configuration
- **section**: Section to remove from
- **subsection**: Optional specific subsection
- **partial**: Optional specific file to remove

#### `list`
List available persona components
- **section**: Optional filter by section
- **subsection**: Optional filter by subsection

#### `set_var`
Set a persona variable for dynamic substitution
- **variable**: Variable name to set
- **value**: New value for the variable

#### `web_editor`
Launch the visual persona editor
- **action**: 'open' or 'close'

#### `build_agent`
Create a new specialized agent
- **name**: Agent identifier (alphanumeric + underscores/hyphens)
- **mcps**: List of MCP servers to include

## Quick Start

### Installation
```bash
npm install
```

### Basic Usage
```bash
# Start the MCP server
npm start

# Launch web editor
node launch-editor.js
```

### Creating a Custom Persona
1. Use `list` to see available components
2. Use `add` to compose your persona:
   ```
   add section:main partial:professional
   add section:output/tone partial:independent
   ```
3. Test with the web editor
4. Save configuration for reuse

### Building an Agent
```bash
# Create specialized agent with custom persona
build_agent name:debugger mcps:['pageant']
```

## Advanced Features

### Variable Substitution
Personas can include variables for dynamic content:
- Define variables in persona files using `{{VAR_NAME}}`
- Set values with `set_var` command
- Variables persist across sessions

### Persona Compilation
The system compiles personas from multiple sources:
1. Base template from `/plans/template.md`
2. Dynamic additions via MCP commands
3. Variable substitution
4. Final compilation to `/plans/persona.md`

### Multi-Agent Workflows
Pageant supports creating specialized agents that work together:
- Each agent has its own persona configuration
- Agents share project context
- Coordinate through shared workspace

## Best Practices

### Persona Design
- Start with a base persona (professional, agent, etc.)
- Layer specific capabilities as needed
- Test combinations in web editor before deployment
- Keep personas focused on specific tasks

### Performance
- Minimize persona file size for faster loading
- Use variables for frequently changed values
- Cache compiled personas when possible

### Security
- Personas are sandboxed from system access
- No execution of arbitrary code
- All file operations are restricted to manifest directory

## Troubleshooting

### Common Issues
- **Persona not loading**: Check file paths in manifest
- **Variables not substituting**: Verify variable names match exactly
- **Web editor not opening**: Ensure port 5442 is available

### Debug Mode
Enable verbose logging:
```bash
DEBUG=mcp:* npm start
```

## Contributing
Contributions welcome! Key areas:
- New persona components
- Enhanced web editor features
- Additional MCP tool implementations
- Documentation improvements

## License
See LICENSE file for details.

---

*MCP Pageant - Composable AI Assistant Personalities*