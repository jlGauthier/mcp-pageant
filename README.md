# MCP Pageant

**Portable multi-agent persona system**

## What It Does

MCP Pageant builds specialized AI agents with different expertise, personas, and knowledge bases. Deploy teams of agents that work together on complex projects - each with their own focus, conversation history, and configuration.

**Core Capabilities:**
- **Compose personas from modular components** - Mix technical knowledge, behavioral patterns, and communication styles
- **Hot-swap on the fly** - Change agent behavior without restarting
- **Deploy multi-agent teams** - Run 5+ specialized agents simultaneously
- **Portable across projects** - Agents survive moves, renames, and copies
- **Zero global config pollution** - Each agent carries its own MCP configuration

## The Problem Solved

Modern development requires constantly switching contexts:
- Frontend → Backend → DevOps → Testing → Documentation
- React → Node → PostgreSQL → Docker → Kubernetes
- Different projects, different tech stacks, different patterns

**Generic AI assistants struggle with this.** They either know too much (giving conflicting advice) or too little (generic answers).

**MCP Pageant solves this** by letting you deploy specialized agents:
- **Frontend Agent**: React, TypeScript, CSS, accessibility - nothing else
- **Backend Agent**: Node.js, PostgreSQL, REST APIs - focused expertise
- **QA Agent**: Testing strategies, edge cases, quality control
- **DevOps Agent**: Docker, CI/CD, infrastructure
- **Tech Writer**: Documentation, clear explanations, user guides

Each agent maintains its own conversation history, technical knowledge, and persona.

## Installation

### Prerequisites
- Bun 1.0+
- Claude Code (desktop application)

### Setup

```bash
# Clone pageant server
git clone https://github.com/jlGauthier/mcp_pageant.git
cd mcp_pageant
bun install
```

**Install the MCP server globally:**

```bash
claude mcp install D:\path\to\mcp_pageant\server.js --name pageant
```

This adds pageant to your global `~/.claude.json` config.

## Three Ways to Use Pageant

### Option 1: Single Custom Agent (Simplest)

Configure your current directory as a custom agent:

```bash
# In any project directory
claude

# Inside Claude, build your persona
add slot:main partial:agent
add slot:tech partial:nodejs
add slot:tech partial:postgresql
```

Your persona compiles to `CLAUDE.local.md` in the current directory. Restart Claude to load it.

**When to use:** Solo developer, single project, want one customized agent.

---

### Option 2: Multi-Agent Team (Recommended)

Build specialized agents in a `.pageant/` directory:

```bash
# From your project root
build_agent name:fs mcps:["pageant","lace"]
build_agent name:qc mcps:["pageant"]
build_agent name:ux mcps:["pageant"]
```

This creates:
```
your-project/
└── .pageant/
    ├── fs/                     # Full-stack agent
    │   ├── .mcp.json           # Agent-specific MCPs
    │   ├── CLAUDE.local.md     # Persona (auto-generated)
    │   └── .claude/
    │       └── settings.local.json
    ├── qc/                     # QA agent
    │   ├── .mcp.json
    │   ├── CLAUDE.local.md
    │   └── .claude/
    └── ux/                     # UX agent
        ├── .mcp.json
        ├── CLAUDE.local.md
        └── .claude/
```

**Start each agent from its directory:**

```bash
# Terminal tab 1
cd .pageant/fs
claude

# Terminal tab 2
cd .pageant/qc
claude

# Terminal tab 3
cd .pageant/ux
claude
```

Each agent runs independently with its own conversation history and expertise.

**When to use:** Complex projects, team collaboration, need specialized expertise per domain.

---

### Option 3: Copy From Template

Copy a pre-configured `.pageant/` directory from another project:

```bash
# Copy entire team structure
cp -r ~/previous-project/.pageant ./

# Each agent already has:
# - .mcp.json (agent-specific MCPs)
# - CLAUDE.local.md (persona with stable ID)
# - .claude/settings.local.json (permissions)
```

**Start agents normally:**
```bash
cd .pageant/fs && claude
cd .pageant/qc && claude
```

Agents automatically detect they've been moved (via stable IDs) and maintain their configurations.

**When to use:** Deploying proven team structures, standardizing across projects, rapid setup.

---

## Quick Start

Once pageant is installed, just talk to Claude:

```
add slot:main partial:snitch
```

That's it. Pageant adds the component and compiles your persona automatically.

## Core Concepts

### Slot System

Components are organized by **slot keys** - derived from numbered path components:

```
001_main/engineer.md                    → slot: 001
010_tech/15_nodejs.md                   → slot: 010.15
040_output/01_dialect/technical.md      → slot: 040.01
```

**Slot collision rules:**
- Same slot key → **replacement** (only one component per slot)
- Different slot keys → **coexist** (multiple components active)

This lets you:
- **Replace core persona** (slot 001): `agent` → `professional` → `engineer`
- **Accumulate technical knowledge** (slot 010.X): nodejs + postgresql + docker + react
- **Switch communication style** (slot 040.01): technical → casual → formal

### Portable Agents

Agents use **stable IDs** instead of file paths. Move or rename directories without breaking anything:

```markdown
<!-- PAGEANT_ID: c--user--myproject--.pageant--agent_fs -->
```

**What this enables:**
- Move `C:\project1\` → `D:\project2\` - agent still works
- Rename `.pageant\FS\` → `.pageant\fs\` - no case sensitivity issues
- Copy agent to new project - gets new ID, independent configuration
- Template storage decoupled from filesystem locations

### Project-Scoped MCPs

Each agent can have its own `.mcp.json`:

```json
{
  "mcpServers": {
    "pageant": { "command": "node", "args": ["D:\\tools\\mcp_pageant\\server.js"] },
    "filesystem": { "command": "node", "args": ["D:\\tools\\mcp_filesystem\\server.js"] }
  }
}
```

**Benefits:**
- No global `.claude.json` pollution
- Different agents can use different MCPs
- MCPs travel with agent directories
- Check into version control for team consistency

### Fuzzy Matching

All lookups use fuzzy matching - you don't need exact names:

```javascript
add slot:tech partial:postgres    // Finds "postgresql"
add slot:out/ton partial:indep    // Finds "output/tone/independent"
add slot:main partial:eng         // Finds "engineer"
```

Works with:
- Partial names
- Different cases
- Missing separators (underscores, hyphens)
- Numeric prefixes optional

## Available Tools

- **`add`** - Add persona component to current agent
- **`remove`** - Remove component by pattern or section
- **`list`** - Browse available components
- **`inspect`** - Show current template composition with slot keys
- **`set_var`** - Configure dynamic variables
- **`build_agent`** - Create new agent with own config
- **`web_editor`** - Launch visual persona editor (http://localhost:52100)

## Multi-Agent Workflows

### Example: Full-Stack Web App Team

**5 specialized agents:**

1. **Full-Stack Agent** (`fs/`)
   - Handles implementation across entire stack
   - Knows: React, Node.js, PostgreSQL, Docker
   - Persona: Pragmatic engineer

2. **QA Agent** (`qc/`)
   - Reviews code for quality issues
   - Knows: Testing strategies, edge cases, security
   - Persona: Thorough critic

3. **UX Agent** (`ux/`)
   - Designs user interfaces
   - Knows: CSS, accessibility, design systems
   - Persona: Creative designer

4. **Tech Writer** (`tw/`)
   - Writes documentation
   - Knows: Technical writing, API docs
   - Persona: Clear communicator

5. **Tools Agent** (`tools/`)
   - Builds internal tooling
   - Knows: CLI tools, automation, scripts
   - Persona: Efficiency focused

**Workflow:**
1. FS agent implements feature
2. QA agent reviews for issues
3. UX agent refines interface
4. TW agent documents changes
5. Tools agent automates deployment

Each agent focuses on their domain without conflicting knowledge.

## Web Editor

Launch visual interface for persona management:

```bash
bun launch-editor.js
# Opens http://localhost:52100
```

**Features:**
- Tree view of all manifest components
- Real-time persona preview
- Project switching
- Add/remove components visually
- Variable configuration
- Search across all components

## Advanced Features

### Multi-Manifest Overlays

Share components across projects:

```bash
# .env
MANIFEST_DIRS=./manifest,../company_personas,~/user_personas
```

**Resolution order:** Later directories override earlier ones.

Use cases:
- Company-wide shared components
- User-specific customizations
- Project-specific overrides

### Temporary Modifications

**Inline Overrides (Thrift):**
```javascript
add slot:pattern partial:"Always verify edge cases before implementing"
// Content added without creating files
```

**Temporary Talents:**
```javascript
talent talent_name:performance_optimization time_minutes:30
// Loads expertise for 30 minutes, auto-removes
```

### Variable Substitution

Use variables in any persona component:

```markdown
## Project Context
You are working on ${PROJECT_NAME} which uses ${TECH_STACK}.
```

Set variables per project:
```javascript
set_var variable:PROJECT_NAME value:"E-commerce Platform"
set_var variable:TECH_STACK value:"React + Node.js + PostgreSQL"
```

**Variable cascade:** Manifest defaults → Global defaults → Project overrides

### Dependency Resolution

Components can depend on other components:

```markdown
# backend_engineer.md
@./manifest/010_tech/17_nodejs.md
@./manifest/010_tech/19_postgresql.md

## Backend Engineering
You build robust server-side applications...
```

Dependencies load automatically when you add the component.

## Creating Components

Add new `.md` files to manifest directories:

```markdown
# manifest/010_tech/30_redis.md

## Redis Expertise

You are proficient with Redis for caching and pub/sub:

### DO
- Use Redis for session storage
- Implement cache invalidation strategies
- Use pub/sub for real-time features

### DON'T
- Store large objects in Redis
- Use Redis as primary database
- Ignore connection pooling
```

**Naming convention:**
- Numbered sections: `010_tech/`
- Numbered files: `30_redis.md`
- Slot key: `010.30`

## Use Cases

### Solo Developer
- **Single agent** with full-stack expertise
- Switch between frontend/backend contexts
- Hot-swap persona for different projects

### Small Team
- **2-3 agents:** Developer, QA, Documentation
- Shared component library
- Consistent personas across team

### Large Team
- **5+ agents:** Frontend, Backend, DevOps, QA, Design, Documentation
- Specialized expertise per domain
- Independent conversation histories
- Parallel workflows

### Freelancer
- **Multiple personas** per client
- Different agent configurations per project
- Portable across machines

### Agency
- **Template library** of proven agent configurations
- Deploy standard teams to new projects
- Share components across clients

## Performance

- **Persona compilation:** ~50-200ms (typical)
- **Agent startup:** ~3-6 seconds
- **Hot-swap:** Instant (no restart needed)
- **Multi-manifest lookup:** <10ms (100 files)
- **Fuzzy matching:** O(n*m) acceptable for 1000+ files

## Limitations

- **No undo** - Removals are permanent (keep backups)
- **Windows Terminal can't auto-start Claude** - Launcher opens tabs, you type `claude` in each
- **Absolute paths in `.mcp.json`** - Not portable across machines (use project-scoped config per machine)
- **Shared dependency removal** - If files A and B depend on C, removing A also removes C

## Contributing

Areas for improvement:
- Undo/rollback system
- Preview before adding components
- Variable introspection (list/inspect variables)
- Agent management tools (list/delete agents)
- Manifest provenance tracking
- Team deployment automation
- Cross-platform launcher scripts

## License

MIT

## Acknowledgments

Built using the Model Context Protocol. Works with any MCP-compatible client (Claude Code, Continue, etc.).
