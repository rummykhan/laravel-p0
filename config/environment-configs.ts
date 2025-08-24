/**
 * Environment-Specific Configuration System
 * 
 * This module defines environment-specific configurations for beta, gamma, and prod
 * deployment stages. Each environment can override default application settings
 * and define custom naming conventions, build parameters, and deployment settings.
 * 
 * Requirements addressed:
 * - 5.1: Support environment-specific configuration overrides
 * - 5.2: Apply appropriate environment-specific settings during deployment
 * - 5.3: Use default configuration when no environment-specific override exists
 */

import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { EnvironmentConfig } from '../lib/types/configuration-types';

/**
 * Environment-specific configurations record containing all settings for each
 * deployment stage including infrastructure, deployment, and application overrides.
 * Using Record<string, EnvironmentConfig> for efficient stage-based lookups.
 */
export const ENVIRONMENT_CONFIGS: Record<string, EnvironmentConfig> = {
  beta: {
    /**
     * Beta Environment Configuration
     * 
     * Beta is typically used for integration testing and pre-production validation.
     * Resources are named with a 'beta' suffix to distinguish from production.
     */
    stage: 'beta',

    /** Beta-specific application configuration overrides */
    applicationOverrides: {
      // Beta environment may use different health check intervals
      // or have specific configuration needs
    },

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
        DEPLOYMENT_ENV: 'beta',
      },

      // Logging configuration
      logRetention: logs.RetentionDays.TWO_WEEKS,

      // Security configuration
      enableExecuteCommand: true, // Enabled for debugging
    },

    /** Monitoring and observability configuration for beta */
    monitoring: {
      enableDetailedMonitoring: true,
      enableXRayTracing: false, // Disabled for cost optimization
      enableContainerInsights: true,
    }
  },

  gamma: {
    /**
     * Gamma Environment Configuration
     * 
     * Gamma is typically used for pre-production testing with production-like settings.
     * Resources are named with a 'gamma' suffix.
     */
    stage: 'gamma',

    applicationOverrides: {
      // Gamma may have production-like settings
    },

    buildOverrides: {
      dockerBuildArgs: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_ENV: 'gamma'
      },
      buildCommands: [
        'npm ci',
        'NODE_ENV=production npm run build',
      ]
    },

    /** ECS deployment configuration for gamma environment */
    ecsConfig: {
      // Resource sizing closer to production
      cpu: 1024, // 1 vCPU
      memoryLimitMiB: 2048, // 2 GB
      memoryReservationMiB: 1024, // 1 GB soft limit

      // Service configuration for pre-production
      desiredCount: 3,
      minCapacity: 2,
      maxCapacity: 15,

      // Auto-scaling configuration
      targetCpuUtilization: 60,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(180), // Faster scale out

      // Deployment configuration
      maxHealthyPercent: 150,
      minHealthyPercent: 75,
      healthCheckGracePeriod: cdk.Duration.seconds(90),

      // Circuit breaker configuration
      circuitBreakerEnabled: true,
      circuitBreakerRollback: true,

      // Environment variables for gamma
      environmentVariables: {
        NODE_ENV: 'production',
        PORT: '3000',
        LOG_LEVEL: 'info',
        SECURITY_HEADERS_ENABLED: 'true',
        NEXT_TELEMETRY_DISABLED: '1',
        ENABLE_DEBUG_LOGGING: 'false',
        ENABLE_PERFORMANCE_MONITORING: 'true',
        DEPLOYMENT_ENV: 'gamma',
      },

      // Logging configuration
      logRetention: logs.RetentionDays.ONE_MONTH,

      // Security configuration
      enableExecuteCommand: false, // Disabled for security
    },

    /** Monitoring and observability configuration for gamma */
    monitoring: {
      enableDetailedMonitoring: true,
      enableXRayTracing: true, // Enabled for pre-production testing
      enableContainerInsights: true,
    }
  },

  prod: {
    /**
     * Production Environment Configuration
     * 
     * Production environment with high availability and performance settings.
     * Resources are named with a 'prod' suffix.
     */
    stage: 'prod',

    applicationOverrides: {
      // Production-specific overrides
    },

    buildOverrides: {
      dockerBuildArgs: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_ENV: 'production'
      },
      buildCommands: [
        'npm ci',
        'NODE_ENV=production npm run build',
      ]
    },

    /** ECS deployment configuration for production environment */
    ecsConfig: {
      // Production resource sizing
      cpu: 2048, // 2 vCPU
      memoryLimitMiB: 4096, // 4 GB
      memoryReservationMiB: 2048, // 2 GB soft limit

      // Service configuration for production
      desiredCount: 5,
      minCapacity: 3,
      maxCapacity: 50,

      // Auto-scaling configuration
      targetCpuUtilization: 50, // Conservative for production
      scaleInCooldown: cdk.Duration.seconds(600), // Slower scale in
      scaleOutCooldown: cdk.Duration.seconds(120), // Fast scale out

      // Deployment configuration for maximum availability
      maxHealthyPercent: 125,
      minHealthyPercent: 100, // No downtime deployments
      healthCheckGracePeriod: cdk.Duration.seconds(60),

      // Circuit breaker configuration
      circuitBreakerEnabled: true,
      circuitBreakerRollback: true,

      // Environment variables for production
      environmentVariables: {
        NODE_ENV: 'production',
        PORT: '3000',
        LOG_LEVEL: 'warn',
        SECURITY_HEADERS_ENABLED: 'true',
        NEXT_TELEMETRY_DISABLED: '1',
        ENABLE_DEBUG_LOGGING: 'false',
        ENABLE_PERFORMANCE_MONITORING: 'true',
        DEPLOYMENT_ENV: 'production',
      },

      // Logging configuration
      logRetention: logs.RetentionDays.SIX_MONTHS,

      // Security configuration
      enableExecuteCommand: false, // Disabled for security
    },

    /** Monitoring and observability configuration for production */
    monitoring: {
      enableDetailedMonitoring: true,
      enableXRayTracing: true,
      enableContainerInsights: true,
    }
  },
};

/**
 * Helper function to get environment configuration by stage name.
 * Returns undefined if no configuration is found for the specified stage.
 * 
 * @param stage - The deployment stage to get configuration for
 * @returns The environment configuration for the stage, or undefined if not found
 */
export function getEnvironmentConfig(stage: string): EnvironmentConfig | undefined {
  return ENVIRONMENT_CONFIGS[stage];
}

/**
 * Helper function to get all available environment stage names.
 * Useful for validation and configuration management.
 * 
 * @returns Array of all configured environment stage names
 */
export function getAvailableStages(): string[] {
  return Object.keys(ENVIRONMENT_CONFIGS);
}

/**
 * Helper function to validate if a stage name is supported.
 * 
 * @param stage - The stage name to validate
 * @returns True if the stage is configured, false otherwise
 */
export function isValidStage(stage: string): boolean {
  return stage in ENVIRONMENT_CONFIGS;
}

/**
 * Default export for convenient importing of the environment configurations.
 */
export default ENVIRONMENT_CONFIGS;