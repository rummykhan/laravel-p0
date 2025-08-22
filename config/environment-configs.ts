/**
 * Environment-Specific Configuration System
 * 
 * This module defines environment-specific configurations for beta, gamma, and prod
 * deployment stages. Each environment can override default application settings
 * and define custom naming conventions and build parameters.
 * 
 * Requirements addressed:
 * - 5.1: Support environment-specific configuration overrides
 * - 5.2: Apply appropriate environment-specific settings during deployment
 * - 5.3: Use default configuration when no environment-specific override exists
 */

import { EnvironmentConfig } from './configuration-types';

/**
 * Environment-specific configurations array containing settings for each
 * deployment stage. These configurations define naming conventions,
 * application overrides, and build settings specific to each environment.
 */
export const ENVIRONMENT_CONFIGS: EnvironmentConfig[] = [
  {
    /**
     * Beta Environment Configuration
     * 
     * Beta is typically used for integration testing and pre-production validation.
     * Resources are named with a 'beta' suffix to distinguish from production.
     */
    stage: 'beta',
    
    namingConvention: {
      /** Don't prefix resource names with stage name */
      useStagePrefix: false,
      /** Add stage name as suffix to resource names */
      useStageSuffix: true,
      /** Use hyphen as separator between name components */
      separator: '-'
    },
    
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
        'npm run test:ci'
      ]
    }
  },
  
  {
    /**
     * Gamma Environment Configuration
     * 
     * Gamma is typically used for final pre-production testing and validation.
     * It closely mirrors production settings but with gamma-specific naming.
     */
    stage: 'gamma',
    
    namingConvention: {
      /** Don't prefix resource names with stage name */
      useStagePrefix: false,
      /** Add stage name as suffix to resource names */
      useStageSuffix: true,
      /** Use hyphen as separator between name components */
      separator: '-'
    },
    
    /** Gamma-specific application configuration overrides */
    applicationOverrides: {
      // Gamma may have production-like settings but with different scaling
    },
    
    /** Gamma-specific build configuration overrides */
    buildOverrides: {
      dockerBuildArgs: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        // Gamma-specific build args
        NEXT_PUBLIC_ENV: 'gamma',
        // Enable optimizations similar to production
        NEXT_OPTIMIZE_FONTS: 'true',
        NEXT_OPTIMIZE_IMAGES: 'true'
      },
      // Gamma includes comprehensive testing before deployment
      buildCommands: [
        'npm ci',
        'NODE_ENV=production npm run build',
        'npm run test:ci',
        'npm run test:e2e'
      ]
    }
  },
  
  {
    /**
     * Production Environment Configuration
     * 
     * Production environment with full optimizations enabled and
     * production-grade build settings. This is the live environment
     * serving real users.
     */
    stage: 'prod',
    
    namingConvention: {
      /** Don't prefix resource names with stage name */
      useStagePrefix: false,
      /** Add stage name as suffix to resource names */
      useStageSuffix: true,
      /** Use hyphen as separator between name components */
      separator: '-'
    },
    
    /** Production-specific application configuration overrides */
    applicationOverrides: {
      // Production may have different resource requirements
      // These can be set here if needed
    },
    
    /** Production-specific build configuration overrides */
    buildOverrides: {
      dockerBuildArgs: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        // Production-specific optimizations
        NEXT_PUBLIC_ENV: 'production',
        NEXT_OPTIMIZE_FONTS: 'true',
        NEXT_OPTIMIZE_IMAGES: 'true',
        NEXT_BUNDLE_ANALYZER: 'false',
        // Security and performance optimizations
        NEXT_STRICT_MODE: 'true'
      },
      // Production build with full optimization and validation
      buildCommands: [
        'npm ci --only=production',
        'NODE_ENV=production npm run build',
        'npm run validate:build'
      ]
    }
  }
];

/**
 * Helper function to get environment configuration by stage name.
 * Returns undefined if no configuration is found for the specified stage.
 * 
 * @param stage - The deployment stage to get configuration for
 * @returns The environment configuration for the stage, or undefined if not found
 */
export function getEnvironmentConfig(stage: string): EnvironmentConfig | undefined {
  return ENVIRONMENT_CONFIGS.find(config => config.stage === stage);
}

/**
 * Helper function to get all available environment stage names.
 * Useful for validation and configuration management.
 * 
 * @returns Array of all configured environment stage names
 */
export function getAvailableStages(): string[] {
  return ENVIRONMENT_CONFIGS.map(config => config.stage);
}

/**
 * Helper function to validate if a stage name is supported.
 * 
 * @param stage - The stage name to validate
 * @returns True if the stage is configured, false otherwise
 */
export function isValidStage(stage: string): boolean {
  return ENVIRONMENT_CONFIGS.some(config => config.stage === stage);
}

/**
 * Default export for convenient importing of the environment configurations.
 */
export default ENVIRONMENT_CONFIGS;