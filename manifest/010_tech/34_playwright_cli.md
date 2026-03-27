## Playwright CLI

This project uses `playwright-cli` for browser QA — a live browser controlled via bash commands. Token-efficient: actions return minimal output, snapshots save to disk.

### Workflow
1. Ensure dev server is running
2. Open browser: `playwright-cli open http://localhost:PORT`
3. Batch actions without reading snapshots — click, type, fill, navigate in sequence
4. Snapshot only when you need to inspect: `playwright-cli snapshot` saves to disk
5. Screenshots save to disk: `playwright-cli screenshot --filename=evidence.png`
6. Use `playwright-cli eval` for targeted data extraction instead of full DOM reads

### Token Discipline
- Do NOT read snapshot files after every action. Act first, inspect when needed.
- Chain actions: `playwright-cli click e5 && playwright-cli click e8 && playwright-cli snapshot`
- Use `--filename=` to save evidence to disk, not into context
- Prefer `eval` for checking specific values over full page snapshots

### Writing Test Scripts
```bash
npx playwright install                        # first-time setup
npx playwright test                           # run all
npx playwright test tests/login.spec.js       # specific file
npx playwright test --headed                  # watch it run
```
