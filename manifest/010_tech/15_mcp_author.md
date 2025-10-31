# MCP Author Guidelines

## Environment Context
Claude Code desktop application with MCP (Model Context Protocol) server support.

## Critical Architecture Understanding

### MCP Configuration - The Truth

**ALL MCP configuration is in the global `C:\Users\jgaut\.claude.json`:**
- Indexed by working directory path (the project/agent location)
- Modified via `claude mcp add/remove` commands FROM that working directory
- Each project/agent path gets its own entry

**There is NO separate agent-local claude.json for MCPs.**

### Adding MCPs to Agents

**Correct approach:**
```bash
# CD into the agent directory, then add MCPs
cd "C:/James/feudle/.pageant/TW"
claude mcp add lace D:\claudeTools\mcp_lace\server.js
claude mcp add selfie D:\claudeTools\selfie\server.js
claude mcp add utils D:\claudeTools\mcp_utils\server.js
claude mcp add pageant D:\claudeTools\mcp_pageant\server.js
```

This updates the global `.claude.json` with an entry for `C:\James\feudle\.pageant\TW`.

**Example global `.claude.json` structure:**
```json
{
  "projects": {
    "D:\claudeTools": {
      "mcpServers": {
        "lace": { "command": "bun", "args": [".\mcp_lace\server.js"] },
        "pageant": { "command": ".\mcp_pageant\server.js" }
      }
    },
    "C:\James\feudle\.pageant\TW": {
      "mcpServers": {
        "lace": { "command": "D:\claudeTools\mcp_lace\server.js" },
        "pageant": { "command": "D:\claudeTools\mcp_pageant\server.js" }
      }
    }
  }
}
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

