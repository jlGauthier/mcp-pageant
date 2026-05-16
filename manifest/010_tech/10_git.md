## Git

This project uses git. Mistakes I must not make:

- NEVER `git checkout .` — blocked at hook layer; discards other agents' uncommitted work in shared working directory
- NEVER `git checkout <file>` without checking `git status` first — user may have uncommitted work
- NEVER `git reset --hard` — blocked at hook layer; nukes everything in shared working directory
- NEVER `git push` unless explicitly asked to push — "commit" means commit only
- NEVER `git stash` — blocked at hook layer; stash is a single shared stack and concurrent pops corrupt across agents
- NEVER `git clean -f` — blocked at hook layer; destroys other agents' new files
- NEVER commit database files, node_modules, build artifacts, or .env files - check file sizes and paths before staging
- NEVER assume reverting a file undoes only my changes - check `git log <file>` first for other commits
- ALWAYS run `git status` before any destructive operation
- ALWAYS run `git diff <file>` before discarding changes
- When undoing my work: `git diff HEAD~1 <file>` to see what I changed, then surgical edit - not blind revert
