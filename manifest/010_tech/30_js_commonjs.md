## CommonJS Modules

This project uses CommonJS. When writing CommonJS:

- Use `require()` and `module.exports`, not `import`/`export`
- `__dirname` and `__filename` exist - use them
- File extensions optional in requires: `require('./foo')` works
- No top-level `await` - wrap in async IIFE or use `.then()`
- `exports = x` breaks the reference - use `module.exports = x`
- Cannot `require()` ESM packages - use dynamic `import()` instead
