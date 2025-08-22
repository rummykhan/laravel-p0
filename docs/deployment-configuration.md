# Deployment Configuration

This document describes the environment-specific deployment configuration for the ECS Fargate Next.js application.

## Overview

The deployment configuration system provides environment-specific settings for:
- Resource sizing (CPU, memory)
- Auto-scaling parameters
- Deployment strategies
- Environment variables
- Monitoring and logging settings

## Configuration Files

### `config/deployment-config.ts`
Contains environment-specific configurations for different deployment stages:
- **beta**: Development/testing environment with cost-optimized resources
- **gamma**: Staging environment with production-like resources
- **prod**: Production environment with high availability and performance

### `lib/stacks/ecs-stack.ts`
The ECS stack now accepts environment-specific configuration through:
- `EcsStackProps.stage`: The deployment stage (beta, gamma, prod)
- `EcsStackProps.environmentConfig`: Optional override for default configuration

## Environment Configurations

### Beta (Development)
- **CPU**: 512 units (0.5 vCPU)
- **Memory**: 1024 MB (1 GB)
- **Tasks**: 2 desired, 1-10 capacity range
- **Environment Variables**: Development settings with debug logging
- **Monitoring**: Detailed monitoring enabled, execute command enabled for debugging

### Gamma (Staging)
- **CPU**: 1024 units (1 vCPU)
- **Memory**: 1536 MB (1.5 GB)
- **Tasks**: 2 desired, 1-15 capacity range
- **Environment Variables**: Staging settings with info-level logging
- **Monitoring**: Detailed monitoring and X-Ray tracing enabled

### Production
- **CPU**: 1024 units (1 vCPU)
- **Memory**: 2048 MB (2 GB)
- **Tasks**: 3 desired, 2-20 capacity range
- **Environment Variables**: Production settings with warn-level logging
- **Monitoring**: Full monitoring suite enabled, execute command disabled for security

## Deployment Features

### Zero-Downtime Updates
All environments are configured with:
- **Circuit Breaker**: Automatic rollback on deployment failure
- **Rolling Deployment**: Maintains service availability during updates
- **Health Checks**: Ensures new tasks are healthy before routing traffic

### Auto-Scaling
Environment-specific auto-scaling based on:
- **CPU Utilization**: Target thresholds vary by environment
- **Memory Utilization**: Secondary scaling metric
- **Cooldown Periods**: Prevent rapid scaling oscillations

### Environment Variables
Each environment includes:
- `NODE_ENV`: Environment type (development, staging, production)
- `DEPLOYMENT_STAGE`: Current deployment stage
- `DEPLOYMENT_TIMESTAMP`: Deployment time for tracking
- `LOG_LEVEL`: Appropriate logging level for environment
- `SECURITY_HEADERS_ENABLED`: Security configuration
- Environment-specific feature flags

## Monitoring and Alerting

### CloudWatch Alarms (when detailed monitoring is enabled)
- **High CPU Utilization**: Triggers when CPU exceeds target + 20%
- **High Memory Utilization**: Triggers when memory exceeds 85%
- **Low Task Count**: Triggers when running tasks drop below minimum
- **Unhealthy Targets**: Triggers when ALB targets become unhealthy

### CloudWatch Dashboard
Provides real-time monitoring of:
- ECS service metrics (CPU, memory, task count)
- ALB metrics (request count, response time, HTTP status codes)
- Target health status
- Environment configuration summary

### Log Groups
Environment-specific log groups with appropriate retention:
- **Application Logs**: `/ecs/nextjs-users-{stage}`
- **ALB Access Logs**: `/aws/applicationloadbalancer/nextjs-users`
- **Service Events**: `/aws/ecs/service/nextjs-users`

## Usage

### Deploying to Different Environments

The stage is automatically passed from the CDK stage:

```typescript
// In beta-stage.ts
this.ecsStack = new EcsStack(this, `EcsStack`, {
  ...props,
  stage: 'beta', // This determines the environment configuration
});
```

### Custom Configuration Override

You can override the default configuration:

```typescript
import { getDeploymentConfig } from '../config/deployment-config';

const customConfig = getDeploymentConfig('prod');
customConfig.ecsConfig.desiredCount = 5; // Override desired count

this.ecsStack = new EcsStack(this, `EcsStack`, {
  ...props,
  stage: 'prod',
  environmentConfig: customConfig.ecsConfig,
});
```

### Validation

The deployment configuration is automatically validated on stack creation:

```typescript
import { validateDeploymentConfig } from '../config/deployment-config';

// This will throw an error if the configuration is invalid
validateDeploymentConfig(deploymentConfig);
```

## Best Practices

1. **Resource Sizing**: Start with smaller resources in development and scale up for production
2. **Auto-Scaling**: Use conservative scaling policies to avoid rapid oscillations
3. **Circuit Breaker**: Always enable circuit breaker for automatic rollback
4. **Health Checks**: Configure appropriate grace periods for application startup
5. **Monitoring**: Enable detailed monitoring in all environments for better observability
6. **Security**: Disable execute command in production environments
7. **Logging**: Use appropriate log levels and retention periods for each environment

## Troubleshooting

### Common Issues

1. **Invalid CPU/Memory Combination**: Ensure CPU and memory values follow AWS Fargate requirements
2. **Capacity Configuration**: Verify minCapacity ≤ desiredCount ≤ maxCapacity
3. **Deployment Failures**: Check circuit breaker settings and health check configuration
4. **Resource Constraints**: Monitor CloudWatch metrics for resource utilization

### Validation Errors

The configuration validation will catch common issues:
- Invalid Fargate CPU/memory combinations
- Incorrect capacity settings
- Invalid deployment percentages

### Monitoring

Use the CloudWatch dashboard to monitor:
- Service health and performance
- Deployment status
- Resource utilization
- Error rates and response times