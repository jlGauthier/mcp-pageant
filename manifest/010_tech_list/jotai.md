## Jotai Do's and Don'ts

### DO
- Keep atoms small and focused
- Use derived atoms for computed state
- Leverage atom families for lists
- Use providers for scoping
- Reset atoms when needed

### DON'T
- Create circular dependencies
- Mutate atom values directly
- Mix with other state managers
- Ignore React Suspense integration
- Create atoms inside components