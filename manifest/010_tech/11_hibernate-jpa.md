## Hibernate/JPA Do's and Don'ts

### DO
- Use lazy loading strategically
- Implement proper equals/hashCode
- Use batch fetching for collections
- Define fetch joins in queries
- Cache read-only entities

### DON'T
- Use EAGER fetching everywhere
- Ignore N+1 query problems
- Map bidirectional without care
- Skip @Transactional boundaries
- Use entity objects in APIs