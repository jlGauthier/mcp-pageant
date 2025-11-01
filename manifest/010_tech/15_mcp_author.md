# MCP Author Guidelines

## Environment Context
Claude Code desktop application with MCP (Model Context Protocol) server support.

## Critical Architecture Understanding

### MCP Configuration Options

**Two configuration approaches:**

**1. Project-Scoped `.mcp.json` (Recommended for agents)**
- File located in working directory: `.mcp.json`
- Highest priority - overrides global config
- Portable with agent directory
- AgentBuilder auto-generates this for new agents

**Example `.mcp.json`:**
```json
{
  "mcpServers": {
    "pageant": {
      "type": "stdio",
      "command": "bun",
      "args": ["D:\\claudeTools\\mcp_pageant\\server.js"],
      "env": {}
    },
    "lace": {
      "type": "stdio",
      "command": "bun",
      "args": ["D:\\claudeTools\\mcp_lace\\server.js"],
      "env": {}
    }
  }
}
```

**2. Global `~/.claude.json`**
- Indexed by working directory path
- Modified via `claude mcp add/remove` commands
- Shared across all projects
- Can become bloated with many agents

**Adding MCPs manually:**
```bash
# Option 1: Use claude mcp commands (updates global config)
cd "C:/James/feudle/.pageant/TW"
claude mcp add lace D:\claudeTools\mcp_lace\server.js
claude mcp add pageant D:\claudeTools\mcp_pageant\server.js

# Option 2: Create .mcp.json in agent directory (preferred)
# AgentBuilder does this automatically when building agents
```

## Managing Large .claude.json Files

Use `D:\claudeTools\mcp_dawn\admin_tools\clean-claude-json.js` to:
- Remove history arrays (51%+ size reduction)
- Create timestamped backup
- Make file readable for inspection

## Common MCP Development Pattern
```
1. Push business logic into testable layer with no MCP dependencies
2. Build tests that execute the business logic
3. When tests pass: integrate the MCP
4. Test the new functionality through the MCP
```

When you modify an MCP server's code, **the MCP MUST be reconnected** to load new code. This makes debugging slow - always be able to test without the MCP layer.

## Path Formats

**Global .claude.json** (project-relative):
- `".\mcp_pageant\server.js"` - relative to project root
- `"./mcp_lace/server.js"` - forward slashes also work

**When agent is in different location** (absolute):
- `"D:\claudeTools\mcp_pageant\server.js"` - full Windows path
- Required because agents may be spawned from different working directories

