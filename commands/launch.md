# Launch Team

Launch agent team(s) in terminal tabs.

## Arguments
- `$ARGUMENTS` - Project name (partial match) and optional agent name

## Behavior

### Step 1: Find the project
Use `Glob` for `**/.pageant/*/pageant.template.md` under the typical project roots
(e.g. `C:\James`, `C:\Sprectums`, or paths the user has mentioned) and pick the
unique project directory whose name fuzzy-matches the project name from
`$ARGUMENTS`. The project directory is the one that contains the `.pageant`
folder.

### Step 2: Resolve the .pageant directory
The `.pageant` directory lives at `<project-path>\.pageant`.

### Step 3: Launch
Run the launch script:

**Launch all agents in a project:**
```bash
node <pageant-root>/scripts/launch-team.js "<project-path>\.pageant"
```

**Launch a single agent (if second word in $ARGUMENTS):**
```bash
node <pageant-root>/scripts/launch-team.js "<project-path>\.pageant" "<agent-name>"
```

### Step 4: Report
Show which agents launched with their names and colors.

### Examples
- `/pageant:launch myproject` → launches all agents in the matched project
- `/pageant:launch myproject rose` → launches just the "rose" agent
- `/pageant:launch myproject violet` → launches just the "violet" agent
