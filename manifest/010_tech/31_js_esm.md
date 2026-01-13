## ECMAScript Modules

This project uses ESM. When writing ESM:

- Use `import`/`export`, not `require()`/`module.exports`
- `__dirname` and `__filename` DON'T EXIST - use `import.meta.dirname` (Node 20.11+)
- File extensions REQUIRED: `import './foo.js'` not `import './foo'`
- Top-level `await` works
- JSON imports need: `import data from './data.json' with { type: 'json' }`
- For conditional imports use dynamic `import()` - static imports are hoisted
