import { ApplicationConfig } from '../lib/types/configuration-types';
import { resolveConfiguration } from '../lib/utils/simple-config-resolver';
import { getEnvironmentConfig, getAvailableStages, isValidStage } from './environment-configs';

// Enhanced deployment configuration that includes resolved application configuration
export interface ResolvedDeploymentConfig {
  // Resolved application configuration for this deployment
  applicationConfig: ApplicationConfig;
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

/**
 * Get resolved deployment configuration that integrates with application configuration.
 * This function uses the consolidated environment configuration to create a complete
 * deployment configuration with resolved application settings and resource names.
 * 
 * @param stage - Deployment stage (beta, gamma, prod)

 * @returns Resolved deployment configuration with application-specific settings
 * 
 * Requirements addressed:
 * - 5.1: Environment-specific configuration overrides
 * - 5.2: Environment-specific settings application
 * - 5.4: Environment-specific settings prioritization
 */
export function getResolvedDeploymentConfig(
  stage: string
): ResolvedDeploymentConfig {
  // Resolve application configuration for the stage (includes environment overrides)
  const applicationConfig = resolveConfiguration(stage);
  
  // Create resolved deployment configuration
  const resolvedConfig: ResolvedDeploymentConfig = {
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
  customApplicationConfig: ApplicationConfig
): ResolvedDeploymentConfig {
  // Create resolved deployment configuration with custom application config
  const resolvedConfig: ResolvedDeploymentConfig = {
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

// Helper function to validate environment configuration
export function validateEnvironmentConfig(stage: string): boolean {
  const envConfig = getEnvironmentConfig(stage);
  
  if (!envConfig) {
    throw new Error(`No environment configuration found for stage: ${stage}`);
  }

  const { ecsConfig } = envConfig;
  
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
  // First validate the environment configuration for the resolved stage
  validateEnvironmentConfig(config.applicationConfig.resolvedStage);
  
  // Validate application configuration is present
  if (!config.applicationConfig) {
    throw new Error('Application configuration is missing from resolved deployment configuration');
  }
  
  // Validate resource names are present
  if (!config.resourceNames) {
    throw new Error('Resource names are missing from resolved deployment configuration');
  }
  
  // Get environment config to validate environment variables
  const envConfig = getEnvironmentConfig(config.applicationConfig.resolvedStage);
  if (envConfig) {
    const envVars = envConfig.ecsConfig.environmentVariables;
    
    // Validate that PORT environment variable matches application configuration if set
    if (envVars.PORT) {
      const portFromEnv = parseInt(envVars.PORT, 10);
      if (portFromEnv !== config.applicationConfig.containerPort) {
        throw new Error(`PORT environment variable (${portFromEnv}) does not match application configuration port (${config.applicationConfig.containerPort})`);
      }
    }
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
  return getAvailableStages();
}

/**
 * Check if a deployment stage is valid/configured.
 * 
 * @param stage - Stage name to validate
 * @returns True if stage is configured
 */
export function isValidDeploymentStage(stage: string): boolean {
  return isValidStage(stage);
}