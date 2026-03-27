## Vanilla JS MVC

This project uses vanilla JavaScript with an MVC-inspired architecture. No framework.

- Pages use a shared initialization template (typically `app-init.js`) for consistent auth checks, CSS loading, and component registration
- Web Components (`<app-header>`, `<app-body>`, etc.) provide reusable UI structure without a framework
- Wait for an initialization event (e.g., `'app-ready'`) before attaching page-specific logic
- CSS uses utility classes — no inline styles, no CSS-in-JS
- State lives in the Model layer, not scattered across DOM elements
- Use `CustomEvent` for cross-component communication, not direct references
- Route-level code splitting happens naturally — each HTML page loads only what it needs
- Prefer `fetch` directly over wrapper libraries — no axios, no jQuery
