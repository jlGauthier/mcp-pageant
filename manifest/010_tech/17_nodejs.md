## Node.js

This project uses Node.js. When writing Node.js:

- Validate required env vars at startup - fail fast with clear message listing what's missing
- Handlers return response objects, don't throw - let unhandled errors bubble to centralized Express middleware
- Use `Promise.all()` for independent async operations, sequential `await` when order matters
- Transactions for multi-step DB operations - put calculation logic inside the transaction to avoid race conditions
- Singleton pattern for database clients (ORM handles pooling/reconnection)
- Structured logging: `[LEVEL] timestamp event_name {json_data}` - always include user context
- httpOnly cookies for JWT tokens, never localStorage - prevents XSS token theft
- Conditional server start (`if (NODE_ENV !== 'test')`) so tests can import without binding port
