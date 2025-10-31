## PostgreSQL Do's and Don'ts

### DO
- Use connection pooling (HikariCP works great)
- Index foreign keys and WHERE clause columns
- VACUUM ANALYZE regularly for performance
- Use EXPLAIN ANALYZE on slow queries
- Partition large tables by date/range

### DON'T
- Use SELECT * in production queries
- Create indexes on low-cardinality columns
- Store large blobs directly in tables
- Skip proper constraint definitions
- Ignore deadlock retry logic