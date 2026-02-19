# Launch Team

Launch agent team(s) in terminal tabs.

## Arguments
- `$ARGUMENTS` - Project name (partial match) and optional agent name

## Behavior

### Step 1: Find the project
Read the PLANS_DIR from the pageant `.env` file (resolve relative to the pageant root). Search that directory for subdirectories containing `.pageant--` that match the project name from `$ARGUMENTS`.

The plan key format is `c--sprectums--sheepdog--.pageant--red_fs`. The part before `.pageant--` is the project path. Extract unique project paths from matching plan keys.

To reverse a plan key to a Windows path: split on `--`, first segment gets `:` appended (drive letter), rest are path segments joined with `\`. Example: `c--sprectums--sheepdog` → `C:\Sprectums\Sheepdog`.

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
- `/pageant:launch myproject red` → launches just the "red" agent
