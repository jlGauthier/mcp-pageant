## Elastic Beanstalk Do's and Don'ts

### DO
- Use .ebextensions for environment config
- Monitor application health metrics
- Configure auto-scaling properly
- Use deployment policies wisely
- Keep platform versions updated

### DON'T
- Deploy without health checks
- Ignore instance profile permissions
- Skip blue/green for critical updates
- Use default VPC for production
- Forget log rotation settings