## Express.js Do's and Don'ts

### DO
- Use middleware for cross-cutting concerns
- Implement proper error handling middleware
- Validate input data before processing
- Use compression for responses
- Set security headers with helmet

### DON'T
- Parse request body manually
- Expose stack traces in production
- Trust user input without validation
- Use synchronous route handlers
- Forget to handle async errors