import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { EnvironmentServiceConfig } from "../types";
import { SERVICE_REPO_NAME } from '../packages'

const APP_NAME = SERVICE_REPO_NAME;

export default {
    serviceName: `METACAPIWebService`,
    /** Beta-specific build configuration overrides */
    buildOverrides: {
        dockerBuildArgs: {
            NODE_ENV: 'production',
            NEXT_TELEMETRY_DISABLED: '1',
            // Beta-specific build args can be added here
            NEXT_PUBLIC_ENV: 'beta'
        },
        // Beta may have additional build steps for testing
        buildCommands: [
            'npm ci',
            'NODE_ENV=production npm run build',
        ]
    },

    /** ECS deployment configuration for beta environment */
    ecsConfig: {
        // Resource sizing optimized for cost and development
        cpu: 512, // 0.5 vCPU
        memoryLimitMiB: 1024, // 1 GB
        memoryReservationMiB: 512, // 512 MB soft limit

        // Service configuration for development
        desiredCount: 2,
        minCapacity: 1,
        maxCapacity: 10,

        // Auto-scaling configuration
        targetCpuUtilization: 70,
        scaleInCooldown: cdk.Duration.seconds(300), // 5 minutes
        scaleOutCooldown: cdk.Duration.seconds(300), // 5 minutes

        // Deployment configuration for zero-downtime updates
        maxHealthyPercent: 200, // Allow double capacity during deployment
        minHealthyPercent: 50, // Keep at least half running
        healthCheckGracePeriod: cdk.Duration.seconds(300), // Increased to allow Next.js to fully start up

        // Circuit breaker configuration for automatic rollback
        circuitBreakerEnabled: true,
        circuitBreakerRollback: true,

        // Environment variables for Next.js application
        environmentVariables: {
            NODE_ENV: 'production', // Use production mode for optimized builds even in beta
            PORT: '3000',
            LOG_LEVEL: 'debug',
            SECURITY_HEADERS_ENABLED: 'true',
            NEXT_TELEMETRY_DISABLED: '1',
            ENABLE_DEBUG_LOGGING: 'true',
            // Performance monitoring disabled for development
            ENABLE_PERFORMANCE_MONITORING: 'false',
            // Add beta-specific identifier
            DEPLOYMENT_ENV: 'beta'
        },

        // Logging configuration
        logRetention: logs.RetentionDays.TWO_WEEKS,

        // Security configuration
        enableExecuteCommand: true, // Enabled for debugging

        containerPort: 3000,
        healthCheckPath: '/api/health',
    },

    /** Monitoring and observability configuration for beta */
    monitoring: {
        enableDetailedMonitoring: true,
        enableXRayTracing: false, // Disabled for cost optimization
        enableContainerInsights: true,
    },

    /** Secrets Manager configuration for prod environment */
    secretsConfig: {
        environmentKeys: [
            `TEST_KEY`,
            `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
            `CLERK_SECRET_KEY`,
            `DEBUG_TOKEN`
        ],
        secretName: 'application/beta/secrets',
        secretArn: `arn:aws:secretsmanager:us-east-1:713505378742:secret:application/beta/secrets-LzUdwZ`
    },

    resourceNames: {
        ecrRepositoryName: APP_NAME,
        // ECS resources
        clusterName: `${APP_NAME}-cluster`,
        serviceName: `${APP_NAME}-service`,
        taskDefinitionFamily: `${APP_NAME}-task-definition-family`,

        // Load balancer resources
        albName: `${APP_NAME}-alb`,
        targetGroupName: `${APP_NAME}-tg`,

        // CloudWatch resources
        logGroupName: `/aws/ecs/${APP_NAME.toLowerCase()}`,

        // Security group names
        albSecurityGroupName: `${APP_NAME}-alb-sg`,
        ecsSecurityGroupName: `${APP_NAME}-ecs-sg`
    }
} as EnvironmentServiceConfig;