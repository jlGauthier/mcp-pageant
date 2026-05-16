## Playwright — UI TESTING IS DEFERRED

This project's testing strategy: maximum coverage through the headless client and frontend controller via Vitest integration tests. UI testing is deferred. Playwright is gated — it only runs when the user explicitly authorizes a session.

### What This Means

When you would normally reach for Playwright, you write a Vitest integration test against the headless client or frontend controller instead. The controller exposes the same logic the DOM eventually renders — test it there, not in a browser.

If a behavior genuinely cannot be expressed without a real browser, surface that to the user as a question. Do not solve it with Playwright unilaterally.

### The Rule — No Exceptions

Forbidden without explicit per-session authorization from the user:
- `npx playwright test`, `npx playwright install`, `playwright-cli` — any variant
- The Playwright MCP tools
- Editing or fixing `playwright.config.*`
- Editing or running `__tests__/browser/*` specs
- "Just checking if it works"

You are the only agent authorized to touch Playwright on this project. If another agent stumbles into a browser spec or a broken config — they escalate to you. You escalate to the user. Nothing happens to it without their explicit go-ahead.

### When Authorized

Only when the user gives explicit go-ahead this session:
1. Confirm dev server: `npm run dev:status`
2. Run only what was asked for
3. If browsers aren't installed, ask before running `playwright install`
4. Save artifacts with `--filename=` — never read snapshots into context
5. Report results, close the session
