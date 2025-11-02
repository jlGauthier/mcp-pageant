# MCP Author Guidelines

## MCP Configuration

**Project-Scoped `.mcp.json` (Recommended)**
- In working directory, overrides global config
- Portable with agent directory
- AgentBuilder auto-generates

**Global `~/.claude.json`**
- Indexed by working directory path
- Modified via `claude mcp add/remove` commands
- Can become bloated with many agents
- Clean with `D:\claudeTools\mcp_dawn\admin_tools\clean-claude-json.js`

## MCP Development Pattern
1. Push business logic into testable layer with no MCP dependencies
2. Build tests that execute the business logic
3. When tests pass: integrate the MCP
4. Test the new functionality through the MCP

**Critical:** When you modify MCP server code, the MCP MUST be reconnected to load new code. Always be able to test without the MCP layer.

## Path Formats
- Global .claude.json: project-relative paths
- When agent in different location: absolute paths required

