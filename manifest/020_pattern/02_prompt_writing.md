# Prompt Writing for AI Context Files

## Purpose

Context files (CLAUDE.md) serve one function: **reduce mistakes per task**.

They are not documentation for humans. They are surgical injections of context that prevent:
- Wrong assumptions about architecture
- Incorrect formats (notation, state representation)
- Wrong commands
- Touching files that shouldn't be touched
- Solving already-solved problems incorrectly

Every line that doesn't prevent a mistake is noise that increases the probability of missing lines that do.

## Attention Loss in Transformers

Attention is not uniform across context:

- **Primacy bias** — Strong attention to early tokens
- **Recency bias** — Strong attention to recent tokens
- **Salience competition** — Emphasized items compete; when everything is bold, nothing is
- **Length fatigue** — Longer documents dilute attention per line
- **Structural anchoring** — Headers and formatting create attention anchors

### Mitigation Strategies

1. **Front-load critical constraints** — Put mistake-prone items first
2. **Use headers as attention anchors** — Structure creates navigation points
3. **Emphasis is relative** — Bold/emoji only work when surrounding text is plain
4. **Tables over prose** — Tables are scannable; prose requires sequential processing
5. **One source of truth per fact** — Repetition creates version ambiguity, not reinforcement
6. **Negative space** — A 50-line file gets more attention per line than a 500-line file

## Information Hierarchy

Not all context is equal:

1. **Constraints that cause silent failures** — State corruption patterns, format specs
2. **Commands that differ from convention** — Non-obvious flags, custom scripts
3. **Architecture decisions** — Structural choices that affect all work
4. **Active work state** — Current bugs, flag status
5. **File locations** — Discoverable via glob/grep
6. **Common commands** — `npm install`, `cargo test`

Categories 5-6 consume tokens without preventing mistakes.

## Concise vs Natural Language

### Use Structured/Concise For:
- Reference material (formats, commands, tables)
- Constraints that must be followed exactly
- Anything looked up during task execution

```
Card format: {rank}{suit}
Ranks: A,2-9,T,J,Q,K
Suits: h,d,c,s
```

### Use Natural Language For:
- First introduction of a concept
- Explaining WHY (architectural decisions)
- Anti-patterns where reasoning matters

### Ratio Target
Reference documents should be ~60% tables/structured, ~40% prose.

## Anti-Patterns

### Redundancy
Same fact in multiple locations creates ambiguity about which is current. Pick one location.

### Example Overfitting
AI overfits to examples. Outputs will mimic example structure, length, and style.

**Good for:**
- Mathematical notation
- Syntax/format specs
- Exact patterns that must be reproduced

**Bad for:**
- Creative tasks (AI will copy your example's creativity instead of generating its own)
- Variable-length outputs (AI will match example length)
- Anything where variety matters

When you need format without constraining content, use schema descriptions instead of examples.

### Emphasis Inflation
`🚨 CRITICAL` loses meaning when most sections use it. Emphasis only works relative to plain text.

### Common Sense Statements
- `npm install` to install dependencies
- `# Test configuration` next to `vitest.config.js`
- `Build artifacts are gitignored`

These consume tokens without adding information.

### Meta-Statements
"This document is the source of truth" — The document speaks for itself.

### Redundant Navigation
`cd /path/to/project` before every command when the working directory is already known.
