import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { EcsEnvironmentConfig } from './types';
import { ResolvedApplicationConfig } from './configuration-types';
import { ConfigurationResolver, defaultConfigurationResolver } from './configuration-resolver';

// Deployment configuration interface for different environments
export interface DeploymentConfig {
  ecsConfig: EcsEnvironmentConfig;
  // Additional deployment-specific configurations can be added here
  enableDetailedMonitoring: boolean;
  enableXRayTracing: boolean;
  enableContainerInsights: boolean;
}

// Enhanced deployment configuration that includes resolved application configuration
export interface ResolvedDeploymentConfig extends DeploymentConfig {
  // Resolved application configuration for this deployment
  applicationConfig: ResolvedApplicationConfig;
  // Stage-specific resource names
  resourceNames: {
    ecrRepositoryName: string;
    clusterName: string;
    serviceName: string;
    taskDefinitionFamily: string;
    albName: string;
    targetGroupName: string;
    logGroupName: string;
    albSecurityGroupName: string;
    ecsSecurityGroupName: string;
  };
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
      // Note: These will be merged with application-specific environment variables
      // when using getResolvedDeploymentConfig()
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
      // Note: These will be merged with application-specific environment variables
      // when using getResolvedDeploymentConfig()
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
      // Note: These will be merged with application-specific environment variables
      // when using getResolvedDeploymentConfig()
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

/**
 * Get resolved deployment configuration that integrates with application configuration.
 * This function merges the stage-specific deployment configuration with resolved
 * application configuration, including proper resource naming and environment variables.
 * 
 * @param stage - Deployment stage (beta, gamma, prod)
 * @param configResolver - Configuration resolver instance (optional, uses default if not provided)
 * @returns Resolved deployment configuration with application-specific settings
 * 
 * Requirements addressed:
 * - 5.1: Environment-specific configuration overrides
 * - 5.2: Environment-specific settings application
 * - 5.4: Environment-specific settings prioritization
 */
export function getResolvedDeploymentConfig(
  stage: string,
  configResolver: ConfigurationResolver = defaultConfigurationResolver
): ResolvedDeploymentConfig {
  // Get base deployment configuration for the stage
  const baseDeploymentConfig = getDeploymentConfig(stage);
  
  // Resolve application configuration for the stage
  const applicationConfig = configResolver.resolveConfiguration(stage);
  
  // Create enhanced environment variables that include application-specific settings
  const enhancedEnvironmentVariables = {
    ...baseDeploymentConfig.ecsConfig.environmentVariables,
    // Add application-specific environment variables
    APPLICATION_NAME: applicationConfig.applicationName,
    APPLICATION_DISPLAY_NAME: applicationConfig.applicationDisplayName,
    PORT: applicationConfig.containerPort.toString(),
    HEALTH_CHECK_PATH: applicationConfig.healthCheckPath,
    // Add stage information
    DEPLOYMENT_STAGE: stage,
    // Add resource names for potential use by the application
    ECR_REPOSITORY_NAME: applicationConfig.resourceNames.ecrRepositoryName,
    ECS_CLUSTER_NAME: applicationConfig.resourceNames.clusterName,
    ECS_SERVICE_NAME: applicationConfig.resourceNames.serviceName,
  };
  
  // Create enhanced ECS configuration with resolved names and settings
  const enhancedEcsConfig: EcsEnvironmentConfig = {
    ...baseDeploymentConfig.ecsConfig,
    environmentVariables: enhancedEnvironmentVariables,
  };
  
  // Create resolved deployment configuration
  const resolvedConfig: ResolvedDeploymentConfig = {
    ...baseDeploymentConfig,
    ecsConfig: enhancedEcsConfig,
    applicationConfig,
    resourceNames: {
      ecrRepositoryName: applicationConfig.resourceNames.ecrRepositoryName,
      clusterName: applicationConfig.resourceNames.clusterName,
      serviceName: applicationConfig.resourceNames.serviceName,
      taskDefinitionFamily: applicationConfig.resourceNames.taskDefinitionFamily,
      albName: applicationConfig.resourceNames.albName,
      targetGroupName: applicationConfig.resourceNames.targetGroupName,
      logGroupName: applicationConfig.resourceNames.logGroupName,
      albSecurityGroupName: applicationConfig.resourceNames.albSecurityGroupName,
      ecsSecurityGroupName: applicationConfig.resourceNames.ecsSecurityGroupName,
    },
  };
  
  return resolvedConfig;
}

/**
 * Get deployment configuration with custom application configuration.
 * This allows overriding the default application configuration for specific deployments.
 * 
 * @param stage - Deployment stage
 * @param customApplicationConfig - Custom resolved application configuration
 * @returns Resolved deployment configuration with custom application settings
 */
export function getDeploymentConfigWithCustomApp(
  stage: string,
  customApplicationConfig: ResolvedApplicationConfig
): ResolvedDeploymentConfig {
  // Get base deployment configuration for the stage
  const baseDeploymentConfig = getDeploymentConfig(stage);
  
  // Create enhanced environment variables with custom application settings
  const enhancedEnvironmentVariables = {
    ...baseDeploymentConfig.ecsConfig.environmentVariables,
    // Add custom application-specific environment variables
    APPLICATION_NAME: customApplicationConfig.applicationName,
    APPLICATION_DISPLAY_NAME: customApplicationConfig.applicationDisplayName,
    PORT: customApplicationConfig.containerPort.toString(),
    HEALTH_CHECK_PATH: customApplicationConfig.healthCheckPath,
    // Add stage information
    DEPLOYMENT_STAGE: stage,
    // Add resource names for potential use by the application
    ECR_REPOSITORY_NAME: customApplicationConfig.resourceNames.ecrRepositoryName,
    ECS_CLUSTER_NAME: customApplicationConfig.resourceNames.clusterName,
    ECS_SERVICE_NAME: customApplicationConfig.resourceNames.serviceName,
  };
  
  // Create enhanced ECS configuration
  const enhancedEcsConfig: EcsEnvironmentConfig = {
    ...baseDeploymentConfig.ecsConfig,
    environmentVariables: enhancedEnvironmentVariables,
  };
  
  // Create resolved deployment configuration
  const resolvedConfig: ResolvedDeploymentConfig = {
    ...baseDeploymentConfig,
    ecsConfig: enhancedEcsConfig,
    applicationConfig: customApplicationConfig,
    resourceNames: {
      ecrRepositoryName: customApplicationConfig.resourceNames.ecrRepositoryName,
      clusterName: customApplicationConfig.resourceNames.clusterName,
      serviceName: customApplicationConfig.resourceNames.serviceName,
      taskDefinitionFamily: customApplicationConfig.resourceNames.taskDefinitionFamily,
      albName: customApplicationConfig.resourceNames.albName,
      targetGroupName: customApplicationConfig.resourceNames.targetGroupName,
      logGroupName: customApplicationConfig.resourceNames.logGroupName,
      albSecurityGroupName: customApplicationConfig.resourceNames.albSecurityGroupName,
      ecsSecurityGroupName: customApplicationConfig.resourceNames.ecsSecurityGroupName,
    },
  };
  
  return resolvedConfig;
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

/**
 * Validate resolved deployment configuration including application configuration.
 * This function performs comprehensive validation of both deployment and application settings.
 * 
 * @param config - Resolved deployment configuration to validate
 * @returns True if configuration is valid
 * @throws Error if validation fails
 */
export function validateResolvedDeploymentConfig(config: ResolvedDeploymentConfig): boolean {
  // First validate the base deployment configuration
  validateDeploymentConfig(config);
  
  // Validate application configuration is present
  if (!config.applicationConfig) {
    throw new Error('Application configuration is missing from resolved deployment configuration');
  }
  
  // Validate resource names are present
  if (!config.resourceNames) {
    throw new Error('Resource names are missing from resolved deployment configuration');
  }
  
  // Validate that environment variables include application-specific settings
  const envVars = config.ecsConfig.environmentVariables;
  const requiredAppVars = ['APPLICATION_NAME', 'PORT', 'DEPLOYMENT_STAGE'];
  
  for (const requiredVar of requiredAppVars) {
    if (!envVars[requiredVar]) {
      throw new Error(`Required environment variable '${requiredVar}' is missing from resolved configuration`);
    }
  }
  
  // Validate that PORT environment variable matches application configuration
  const portFromEnv = parseInt(envVars.PORT || '0', 10);
  if (portFromEnv !== config.applicationConfig.containerPort) {
    throw new Error(`PORT environment variable (${portFromEnv}) does not match application configuration port (${config.applicationConfig.containerPort})`);
  }
  
  // Validate that APPLICATION_NAME matches the resolved configuration
  if (envVars.APPLICATION_NAME !== config.applicationConfig.applicationName) {
    throw new Error(`APPLICATION_NAME environment variable does not match application configuration`);
  }
  
  // Validate resource names consistency
  const resourceNames = config.resourceNames;
  const appResourceNames = config.applicationConfig.resourceNames;
  
  if (resourceNames.ecrRepositoryName !== appResourceNames.ecrRepositoryName) {
    throw new Error('ECR repository name mismatch between deployment and application configuration');
  }
  
  if (resourceNames.serviceName !== appResourceNames.serviceName) {
    throw new Error('ECS service name mismatch between deployment and application configuration');
  }
  
  return true;
}

/**
 * Get all available deployment stages.
 * 
 * @returns Array of configured deployment stage names
 */
export function getAvailableDeploymentStages(): string[] {
  return Object.keys(DeploymentConfigs);
}

/**
 * Check if a deployment stage is valid/configured.
 * 
 * @param stage - Stage name to validate
 * @returns True if stage is configured
 */
export function isValidDeploymentStage(stage: string): boolean {
  return stage.toLowerCase() in DeploymentConfigs;
}