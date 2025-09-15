## Socket.IO Do's and Don'ts

### DO
- Implement reconnection logic
- Use namespaces for logical separation
- Handle disconnect events properly
- Validate incoming message data
- Use rooms for broadcasting

### DON'T
- Send sensitive data without auth
- Ignore memory leaks from listeners
- Use default adapter for scaling
- Skip rate limiting
- Forget to clean up on disconnect