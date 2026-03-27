# Living Documentation for AI

Documentation in AI-assisted codebases is load-bearing infrastructure. Stale docs cause incorrect code generation. Wrong docs are worse than no docs.

## The Strategy

Project knowledge lives in markdown files that AI agents read on every session. These files ARE the instructions. When they're wrong, agents build wrong things confidently.

### Rules

1. **Change behavior → update the doc.** Same commit. Not later. Not in a follow-up.
2. **Delete a feature → delete its docs.** Dead docs are dead code with higher blast radius.
3. **Specs describe intended behavior.** When implementation diverges from spec, update the spec — not the other way around.
4. **Plans live in plans/.** Specs, TDD docs, architecture decisions. Agents reference these before building.
5. **The project CLAUDE.md is the master reference.** Keep it accurate. Every agent reads it. Every lie in it multiplies.

### Why This Works

AI agents start every session from zero. They have no memory of what changed yesterday. The only context they have is what's written down. Invest in documentation quality the way you'd invest in test quality — because for AI teams, docs ARE tests. They define correct behavior.
