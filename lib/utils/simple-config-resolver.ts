/**
 * Simplified Configuration Resolution
 * 
 * This module provides simple functions to resolve configurations by generating
 * environment-specific resource names based on naming conventions. It focuses
 * on resource naming without complex override logic, keeping configuration
 * resolution straightforward and predictable.
 */

import { ApplicationConfig, EnvironmentConfig } from '../types/configuration-types';
import { getEnvironmentConfig } from '../../config/environment-configs';

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

    // Validate resource names are generated
    if (!config.resourceNames) {
        throw new Error('Resource names are missing from configuration');
    }

    return true;
}