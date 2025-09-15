## Flyway Do's and Don'ts

### DO
- Version migrations sequentially
- Write idempotent migrations
- Test rollback scenarios
- Use placeholders for environments
- Validate migrations in CI/CD

### DON'T
- Modify existing migration files
- Use timestamps as versions
- Skip baseline for existing DBs
- Mix DDL and DML carelessly
- Ignore migration checksums