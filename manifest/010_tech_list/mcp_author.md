## MCP Author Guidelines

### Environment Context
Claude Code, not the web interface. This is a desktop application with MCP (Model Context Protocol) server support.

### Adding/Removing MCPs
MCPs are managed via command line in Claude Code:
```bash
# Add an MCP
claude mcp add pageant D:\claudeTools\mcp_pageant\server.js

# Remove an MCP
claude mcp remove pageant
```

All MCP configurations are stored in:
```
C:\Users\jgaut\.claude.json
```

### Common MCP Development Pattern
```
1. Push the business logic into testable layer with no mcp dependencys
2. Build tests that execute the business logic
3. When tests pass integrate the MCP.
4. Test the new functionality through the MCP.
```
When you modify an MCP server's code **The MCP MUST be reconnected** to load the new code, this makes debugging very slow. Always be able to test without the mcp layer.
