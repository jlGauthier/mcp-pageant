## TanStack Query Do's and Don'ts

### DO
- Use query keys consistently
- Implement proper error boundaries
- Set staleTime
- Use mutations for data changes
- Prefetch data when possible

### DON'T
- Fetch in useEffect when query exists
- Ignore loading states
- Use same key for different data
- Skip error handling
- Mutate cache data directly