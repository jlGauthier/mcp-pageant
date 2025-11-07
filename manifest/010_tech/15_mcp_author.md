# MCP Author Guidelines

## MCP Configuration

**Project-Scoped `.mcp.json` (use this exclusively)**
- In working directory, overrides global config
- Portable with agent directory
- AgentBuilder auto-generates

**Global `~/.claude.json` (do not use)**
- Indexed by working directory path
- Modified via `claude mcp add/remove` commands default scope
- bloated with all agents
- Clean with `D:\claudeTools\mcp_dawn\admin_tools\clean-claude-json.js`

## MCP Development Pattern
1. Business logic MUST be written in testable layer with no MCP dependencies
2. When you modify MCP server code, the MCP MUST be reconnected by the user to load new code.
3. Always be able to test **without** the MCP layer.
