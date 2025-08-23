/**
 * Simplified Configuration Resolution
 * 
 * This module provides simple functions to resolve configurations without the
 * complexity of the ConfigurationResolver class, leveraging our simplified
 * Record-based environment configuration structure.
 */

import { ApplicationConfig, BaseApplicationConfig, EnvironmentConfig, ResourceNames } from '../types/configuration-types';
import { DEFAULT_APPLICATION_CONFIG } from '../../config/application-config';
import { getEnvironmentConfig } from '../../config/environment-configs';

/**
 * Generate resource names based on configuration and naming conventions.
 * 
 * @param config - Application configuration
 * @param stage - Deployment stage
 * @param envConfig - Environment configuration
 * @returns Generated resource names
 */
function generateResourceNames(
    config: BaseApplicationConfig,
    stage: string,
    envConfig: EnvironmentConfig
): ResourceNames {
    const { namingConvention } = envConfig;

    // Helper function to apply naming convention
    const applyNaming = (baseName: string): string => {
        let name = baseName;

        if (namingConvention.useStagePrefix) {
            name = `${stage}${namingConvention.separator}${name}`;
        }

        if (namingConvention.useStageSuffix) {
            name = `${name}${namingConvention.separator}${stage}`;
        }

        return name;
    };

    return {
        // ECR resources
        ecrRepositoryName: applyNaming(config.ecrRepositoryName),

        // ECS resources
        clusterName: applyNaming(`${config.applicationName}-${config.clusterNameSuffix}`),
        serviceName: applyNaming(config.serviceName),
        taskDefinitionFamily: applyNaming(config.taskDefinitionFamily),

        // Load balancer resources
        albName: applyNaming(config.albName),
        targetGroupName: applyNaming(config.targetGroupName),

        // CloudWatch resources
        logGroupName: `/aws/ecs/${applyNaming(config.applicationName)}`,

        // Security group names
        albSecurityGroupName: applyNaming(`${config.applicationName}-alb-sg`),
        ecsSecurityGroupName: applyNaming(`${config.applicationName}-ecs-sg`)
    };
}

/**
 * Resolve configuration for a specific deployment stage.
 * This is a simplified version that leverages our Record-based environment configs.
 * 
 * @param stage - Deployment stage to resolve configuration for
 * @param baseConfig - Base application configuration (optional, uses default if not provided)
 * @returns Resolved application configuration with resource names
 * @throws Error if stage is not found
 */
export function resolveConfiguration(
    stage: string,
    baseConfig: BaseApplicationConfig = DEFAULT_APPLICATION_CONFIG
): ApplicationConfig {
    // Get environment configuration
    const envConfig = getEnvironmentConfig(stage);

    if (!envConfig) {
        throw new Error(`No environment configuration found for stage '${stage}'. Available stages: ${Object.keys(require('../../config/environment-configs').ENVIRONMENT_CONFIGS).join(', ')}`);
    }

    // Start with base configuration
    let workingConfig: BaseApplicationConfig = { ...baseConfig };

    // Apply environment-specific overrides if available
    if (envConfig.applicationOverrides) {
        workingConfig = {
            ...workingConfig,
            ...envConfig.applicationOverrides
        };
    }

    // Apply build overrides
    if (envConfig.buildOverrides) {
        if (envConfig.buildOverrides.buildCommands) {
            workingConfig.buildCommands = [...envConfig.buildOverrides.buildCommands];
        }

        if (envConfig.buildOverrides.dockerBuildArgs) {
            workingConfig.dockerBuildArgs = {
                ...workingConfig.dockerBuildArgs,
                ...envConfig.buildOverrides.dockerBuildArgs
            };
        }
    }

    // Generate resource names
    const resourceNames = generateResourceNames(workingConfig, stage, envConfig);

    // Create resolved configuration
    const resolved: ApplicationConfig = {
        ...workingConfig,
        resolvedStage: stage,
        resourceNames
    };

    return resolved;
}

/**
 * Get environment configuration for a stage with error handling.
 * 
 * @param stage - Deployment stage
 * @returns Environment configuration
 * @throws Error if stage is not found
 */
export function getEnvironmentConfigOrThrow(stage: string): EnvironmentConfig {
    const envConfig = getEnvironmentConfig(stage);

    if (!envConfig) {
        throw new Error(`No environment configuration found for stage '${stage}'`);
    }

    return envConfig;
}

/**
 * Simple validation for resolved configuration.
 * Basic checks without the complexity of the full ConfigurationResolver validation.
 * 
 * @param config - Resolved application configuration
 * @returns True if valid
 * @throws Error if validation fails
 */
export function validateResolvedConfiguration(config: ApplicationConfig): boolean {
    // Basic required field validation
    const requiredFields = ['applicationName', 'ecrRepositoryName', 'serviceName'];

    for (const field of requiredFields) {
        if (!config[field as keyof ApplicationConfig]) {
            throw new Error(`Required field '${field}' is missing`);
        }
    }

    // Basic port validation
    if (config.containerPort < 1 || config.containerPort > 65535) {
        throw new Error(`Container port must be between 1 and 65535, got: ${config.containerPort}`);
    }

    // Basic health check path validation
    if (!config.healthCheckPath.startsWith('/')) {
        throw new Error(`Health check path must start with '/', got: ${config.healthCheckPath}`);
    }

    return true;
}