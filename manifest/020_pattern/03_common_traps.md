# Common Traps

## Process Management

**Before killing any process:** List what's running and verify. Multiple node/python servers exist across projects - don't nuke the wrong one.
```bash
# Check what's actually on that port
netstat -ano | findstr :PORT
# Verify the PID belongs to what you think
tasklist | findstr PID
```

**Before starting a server:** Check if one's already running on that port. Kill zombies, don't create more.

## Git Safety

**Before reverting or resetting:** Check for uncommitted work across the ENTIRE repo, not just the files you touched.
```bash
git status
git stash list
```
Never `git checkout .` or `git reset --hard` without confirming the blast radius.

**Stash discipline:** Stashes persist but context doesn't. If you stash, pop it before session ends or document what's in there.

## Test Quality

Tests must call the actual code under test - never copy implementation logic into the test. Use real factories and constructors, not hand-built mock objects that drift from reality.

Bad: `const mockUser = { id: 1, name: 'test' }`
Good: `const user = UserFactory.create()`

Bad: Reimplementing the function logic to verify output
Good: Calling the function and asserting on actual behavior

## Bash Discipline

If a bash command needs approval, it's too long. Write a script file and run that instead.

Threshold: If you're chaining more than 2 commands or the line exceeds 80 chars, make it a `.sh` or `.ps1` file.

## File Size Limits

Large files cascade into quality failures: duplicated functions, divergent code paths, unmaintainable logic.

| Type | Max Lines | Action |
|------|-----------|--------|
| Component JS | 400 | Split into sub-components or extract a helper module |
| Operation JS | 200 | Split into focused operations |
| CSS file | 300 | Refactor to utility classes |
| Test file | 300 | Split by feature area |

When editing a file that already exceeds these limits: flag it. Don't make it worse. If your change would push it further over, refactor first.

## Circular Dependencies

No circular dependencies — if A imports B, B cannot import A. Components never import other top-level components directly. Cross-component communication goes through events or a shared model.

## Extract on Second Copy

When multiple components share the same logic, extract it — but not preemptively. Extract when the second copy appears. Three similar lines is fine. Three similar functions is a pattern worth extracting.

## Speculation vs Verification

Banned words without verification: "should", "probably", "likely", "might", "I think"

If verification takes less than 10 seconds, verify. Reading speculation takes longer than running `ls`, `grep`, or `cat`.
