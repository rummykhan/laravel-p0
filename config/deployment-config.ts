import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { EcsEnvironmentConfig } from '../lib/stacks/ecs-stack';

// Deployment configuration interface for different environments
export interface DeploymentConfig {
  ecsConfig: EcsEnvironmentConfig;
  // Additional deployment-specific configurations can be added here
  enableDetailedMonitoring: boolean;
  enableXRayTracing: boolean;
  enableContainerInsights: boolean;
}

// Environment-specific deployment configurations
export const DeploymentConfigs: { [stage: string]: DeploymentConfig } = {
  // Development/Beta environment configuration
  beta: {
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
      healthCheckGracePeriod: cdk.Duration.seconds(120), // Increased to allow container health check to stabilize
      
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
    enableDetailedMonitoring: true,
    enableXRayTracing: false, // Disabled for cost optimization
    enableContainerInsights: true,
  },

  // Staging/Gamma environment configuration
  gamma: {
    ecsConfig: {
      // Resource sizing similar to production but slightly reduced
      cpu: 1024, // 1 vCPU
      memoryLimitMiB: 1536, // 1.5 GB
      memoryReservationMiB: 768, // 768 MB soft limit
      
      // Service configuration for staging
      desiredCount: 2,
      minCapacity: 1,
      maxCapacity: 15,
      
      // Auto-scaling configuration
      targetCpuUtilization: 65,
      scaleInCooldown: cdk.Duration.seconds(300), // 5 minutes
      scaleOutCooldown: cdk.Duration.seconds(240), // 4 minutes
      
      // Deployment configuration for zero-downtime updates
      maxHealthyPercent: 200,
      minHealthyPercent: 50,
      healthCheckGracePeriod: cdk.Duration.seconds(90),
      
      // Circuit breaker configuration
      circuitBreakerEnabled: true,
      circuitBreakerRollback: true,
      
      // Environment variables for staging
      environmentVariables: {
        NODE_ENV: 'production', // Use production mode for optimized builds
        PORT: '3000',
        LOG_LEVEL: 'info',
        SECURITY_HEADERS_ENABLED: 'true',
        NEXT_TELEMETRY_DISABLED: '1',
        ENABLE_PERFORMANCE_MONITORING: 'true',
        // Staging-specific configurations
        ENABLE_DEBUG_LOGGING: 'false',
        DEPLOYMENT_ENV: 'gamma',
      },
      
      // Logging configuration
      logRetention: logs.RetentionDays.ONE_MONTH, // Closest available option
      
      // Security configuration
      enableExecuteCommand: true, // Enabled for debugging
    },
    enableDetailedMonitoring: true,
    enableXRayTracing: true, // Enabled for performance testing
    enableContainerInsights: true,
  },

  // Production environment configuration
  prod: {
    ecsConfig: {
      // Resource sizing optimized for performance and availability
      cpu: 1024, // 1 vCPU
      memoryLimitMiB: 2048, // 2 GB
      memoryReservationMiB: 1024, // 1 GB soft limit
      
      // Service configuration for high availability
      desiredCount: 3, // Higher availability
      minCapacity: 2, // Always keep at least 2 tasks
      maxCapacity: 20, // Allow more scaling
      
      // Auto-scaling configuration optimized for production
      targetCpuUtilization: 60, // Lower threshold for better performance
      scaleInCooldown: cdk.Duration.seconds(600), // 10 minutes - longer for stability
      scaleOutCooldown: cdk.Duration.seconds(180), // 3 minutes - faster scale-out
      
      // Deployment configuration for zero-downtime updates
      maxHealthyPercent: 150, // More conservative deployment
      minHealthyPercent: 75, // Keep more tasks running during deployment
      healthCheckGracePeriod: cdk.Duration.seconds(120), // More time for startup
      
      // Circuit breaker configuration
      circuitBreakerEnabled: true,
      circuitBreakerRollback: true,
      
      // Environment variables for production
      environmentVariables: {
        NODE_ENV: 'production',
        PORT: '3000',
        LOG_LEVEL: 'warn', // Reduced logging for performance
        SECURITY_HEADERS_ENABLED: 'true',
        NEXT_TELEMETRY_DISABLED: '1',
        ENABLE_PERFORMANCE_MONITORING: 'true',
        ENABLE_DEBUG_LOGGING: 'false',
        // Production-specific optimizations
        NEXT_OPTIMIZE_FONTS: 'true',
        NEXT_OPTIMIZE_IMAGES: 'true',
        DEPLOYMENT_ENV: 'production',
      },
      
      // Logging configuration
      logRetention: logs.RetentionDays.ONE_MONTH, // Longer retention for production
      
      // Security configuration
      enableExecuteCommand: false, // Disabled for security
    },
    enableDetailedMonitoring: true,
    enableXRayTracing: true, // Enabled for production monitoring
    enableContainerInsights: true,
  },
};

// Helper function to get deployment configuration for a stage
export function getDeploymentConfig(stage: string): DeploymentConfig {
  const config = DeploymentConfigs[stage.toLowerCase()];
  if (!config) {
    return DeploymentConfigs.beta;
  }
  return config;
}

// Helper function to validate deployment configuration
export function validateDeploymentConfig(config: DeploymentConfig): boolean {
  const { ecsConfig } = config;
  
  // Validate CPU and memory combinations (Fargate requirements)
  const validCombinations = [
    { cpu: 256, memoryMin: 512, memoryMax: 2048 },
    { cpu: 512, memoryMin: 1024, memoryMax: 4096 },
    { cpu: 1024, memoryMin: 2048, memoryMax: 8192 },
    { cpu: 2048, memoryMin: 4096, memoryMax: 16384 },
    { cpu: 4096, memoryMin: 8192, memoryMax: 30720 },
  ];
  
  const validCombo = validCombinations.find(combo => 
    combo.cpu === ecsConfig.cpu && 
    ecsConfig.memoryLimitMiB >= combo.memoryMin && 
    ecsConfig.memoryLimitMiB <= combo.memoryMax
  );
  
  if (!validCombo) {
    throw new Error(`Invalid CPU/Memory combination: ${ecsConfig.cpu} CPU, ${ecsConfig.memoryLimitMiB} MB memory`);
  }
  
  // Validate capacity settings
  if (ecsConfig.minCapacity > ecsConfig.maxCapacity) {
    throw new Error('minCapacity cannot be greater than maxCapacity');
  }
  
  if (ecsConfig.desiredCount < ecsConfig.minCapacity || ecsConfig.desiredCount > ecsConfig.maxCapacity) {
    throw new Error('desiredCount must be between minCapacity and maxCapacity');
  }
  
  // Validate deployment percentages
  if (ecsConfig.minHealthyPercent > 100) {
    throw new Error('minHealthyPercent cannot be greater than 100');
  }
  
  return true;
}