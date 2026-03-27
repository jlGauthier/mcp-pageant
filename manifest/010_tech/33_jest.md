## Jest

This project uses Jest for testing.

- Tests hit real services — no mocking the database, no test servers, no in-memory substitutes
- Three-part test pattern: Setup → Action → Verification
- Test code gets the same rigor as production code — no copy-pasting implementation logic into assertions
- Use real factories and constructors, not hand-built mock objects that drift from reality
- Backend API tests make direct HTTP requests to the running dev server
- Frontend integration tests go through the actual controller/model layer
- Never run tests in the background — watch them pass or fail

```bash
npm test                                              # all tests
npm test -- __tests__/integration/specific.test.js    # specific test
npm run test:unit                                     # unit only
npm run test:coverage                                 # with coverage
```
