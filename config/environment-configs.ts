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
import serviceBetaEnvironmentConfig from './service/beta-environment-config';

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

    serviceConfig: serviceBetaEnvironmentConfig
  }
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