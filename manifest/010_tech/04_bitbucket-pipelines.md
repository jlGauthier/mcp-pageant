## Bitbucket Pipelines Do's and Don'ts

### DO
- Use parallel steps for independent tasks
- Cache dependencies between builds
- Use deployment environments properly
- Store secrets in repository variables
- Implement changeset conditions

### DON'T
- Hardcode credentials in pipeline files
- Skip artifact cleanup
- Run everything sequentially
- Ignore build time limits
- Mix environment configs in same step