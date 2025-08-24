/**
 * Simplified Configuration Resolution
 * 
 * This module provides simple functions to resolve configurations by generating
 * environment-specific resource names based on naming conventions. It focuses
 * on resource naming without complex override logic, keeping configuration
 * resolution straightforward and predictable.
 */

import { EnvironmentConfig } from '../types/configuration-types';
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