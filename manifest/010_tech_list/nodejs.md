## Node.js Do's and Don'ts

### DO
- Use async/await for cleaner async code
- Handle errors with try/catch blocks
- Use environment variables for config
- Keep dependencies updated regularly
- Use native modules when possible

### DON'T
- Block the event loop with sync operations
- Ignore unhandled promise rejections
- Store secrets in code
- Use require() in ES modules
- Mix callback patterns with promises