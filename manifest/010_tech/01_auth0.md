## Auth0 Do's and Don'ts

### DO
- Use SDK methods for auth flows
- Validate tokens server-side
- Implement refresh token rotation
- Set token expiry
- Use rules for custom claims

### DON'T
- Store tokens in localStorage
- Skip audience validation
- Expose management API keys
- Use implicit flow
- Ignore CORS configuration