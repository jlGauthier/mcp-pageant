# MCP Author Guidelines

## MCP Configuration

**Project-Scoped `.mcp.json` (use this exclusively)**
- In working directory, overrides global config
- Portable with agent directory

**Global `~/.claude.json` (do not use)**
- Indexed by working directory path
- Modified via `claude mcp add/remove` commands default scope
- Bloated with all agents, avoid

## MCP Development Pattern
1. Business logic MUST be written in testable layer with no MCP dependencies
2. When you modify MCP server code, the MCP MUST be reconnected by the user to load new code.
3. Always be able to test **without** the MCP layer.
