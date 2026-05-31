# MCP Pageant — Implementation Notes

Pageant is a Model Context Protocol server that composes a Claude persona
from a manifest of markdown components. An agent is just a directory: it
owns its template (`pageant.template.md`) and its compiled output
(`CLAUDE.local.md`). The compiled output IS what Claude Code loads.

## Project Organization

```
mcp_pageant/
├── server.js                # MCP server entry point
├── direct.js                # CLI for remote add/remove/list
├── relay.js                 # Cross-agent channel relay daemon
├── src/
│   ├── PersonaManager.js    # Persona composition + variable cascade
│   ├── MultiManifest.js     # File resolution (manifest + manifest.local)
│   ├── FuzzyMatch.js        # Fuzzy string matching
│   └── formatMarkdown.js    # Section-header injection
├── manifest/                # Public component library (committed)
├── manifest.local/          # Private overlay (gitignored, optional)
├── scripts/
│   ├── compile-remote.js    # Compile any agent dir (with --seed)
│   ├── launch-team.js       # Open a Windows Terminal tab per agent
│   ├── deploy-team.js       # Clone a .pageant team to another project
│   └── debug-merge.js       # Print resolved manifest dirs
└── tests/
```

## Lifecycle of a Compile

```
pageant.template.md            (source: var lines + @references)
        │
        ▼
PersonaManager.compilePersona(projectPath)
        │
        ├─ load default vars from manifest/default_vars.txt
        ├─ load project vars from top of pageant.template.md
        ├─ cleanAndSortTemplate (slot-collision dedup, sort by slot key)
        ├─ for each @ref:
        │     MultiManifest.resolveReference  →  absolute path
        │     read content, strip header + deps, substitute ${VARS}
        ├─ formatWithContext  →  section headers
        └─ write CLAUDE.local.md
                  + <!-- AGENT_NAME: ... -->
                  + <!-- AGENT_JOB: ... -->        (derived from dir suffix)
```

The agent's **project** is derived purely from its path at read time —
parent of `.pageant/`, lowercased. Solo agents (no `.pageant` ancestor) use
their own directory name. It is never written into `CLAUDE.local.md`.

## Slot System

Slot keys come from numbered path components, joined with dots:

```
001_main/engineer.md                  → 001
010_tech/17_nodejs.md                 → 010.17
040_output/01_dialect/technical.md    → 040.01
030_jobs/01_backend/05_database.md    → 030.01.05
```

Rules:
- One file per slot key. Adding to an occupied slot replaces the existing one.
- Non-numbered directories are organizational only — they don't extend the slot key.
- Override flag (`@@` instead of `@`) appends `.override` to the slot key, so a base file and its override coexist.

## Manifest Resolution

`MultiManifest` searches two roots:

1. `manifest/`             — public, committed
2. `manifest.local/`       — private, gitignored, **wins on collision**

A reference like `@./manifest/001_main/engineer.md` is parsed by extracting the
segment after `/manifest/` (or `/manifest.local/`), then tried against the
local overlay first, then the public manifest. So templates can write
references in either form and they resolve the same way.

## Variable Cascade

1. **`manifest/default_vars.txt`** — base defaults
2. **`manifest.local/default_vars.txt`** — local overrides (optional)
3. **Top of `pageant.template.md`** — per-project overrides

`${VAR_NAME}` substitution happens at compile time. Undefined variables stay
literal. There is no escaping mechanism.

## Channel Identity

When the MCP server boots, it reads `AGENT_NAME` and `AGENT_JOB` from
`CLAUDE.local.md` and derives `project` from `cwd`. These form the channel
display string `name/job@project` for cross-agent messaging via `relay.js`.
The relay's per-process identity (`relayId`) is the agent's absolute path.

## Environment Variables

All optional:

| Var          | Default       | Used by                  |
|--------------|---------------|--------------------------|
| `RELAY_PORT` | `7760`        | `server.js`, `relay.js`  |
| `RELAY_HOST` | `localhost`   | `server.js`              |
| `LAUNCH_CMD` | `claude`      | `scripts/launch-team.js` |

## Tests

`bun test` from this directory. The suite is focused on:
- `MultiManifest` — file resolution across the two roots
- `FuzzyMatch` — scoring and selection
- `InlineOverride` — thrift parsing
- Various header-formatting + duplicate-header edge cases
- `project-dir-init` — `getTemplatePath` and `deriveProjectFromPath`

## Known Gaps

- **Shared dependency removal** — if files A and B both depend on C, removing A also removes C (breaks B). Needs reference counting.
- **No undo/rollback** — `pageant.template.md` is plain text, keep it in git if you care about history.
- **Inline overrides (thrift/talent) are sparsely tested.**
