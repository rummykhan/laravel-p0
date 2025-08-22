/**
 * Configuration Resolver
 * 
 * This module provides the ConfigurationResolver class that merges default
 * application configuration with environment-specific overrides and validates
 * the resulting configuration for deployment.
 * 
 * Requirements addressed:
 * - 4.1: Centralized configuration management
 * - 4.2: Configuration validation before deployment
 * - 4.3: Specific error messages for invalid configurations
 * - 5.4: Environment-specific settings prioritization
 * - 6.4: Fallback to defaults with warnings
 */

import {
  ApplicationConfig,
  EnvironmentConfig,
  ResolvedApplicationConfig,
  ValidationResult,
  DetailedValidationResult,
  ValidationError,
  ValidationErrorType,
  ResourceNames
} from './configuration-types';
import { DEFAULT_APPLICATION_CONFIG } from './application-config';
import { ENVIRONMENT_CONFIGS, getEnvironmentConfig, isValidStage } from './environment-configs';

/**
 * Configuration resolver class that handles merging default and environment-specific
 * configurations, validates the results, and generates resource names.
 */
export class ConfigurationResolver {
  private defaultConfig: ApplicationConfig;
  private environmentConfigs: Map<string, EnvironmentConfig>;

  /**
   * Initialize the configuration resolver with default and environment configurations.
   * 
   * @param defaultConfig - Default application configuration
   * @param envConfigs - Array of environment-specific configurations
   */
  constructor(
    defaultConfig: ApplicationConfig = DEFAULT_APPLICATION_CONFIG,
    envConfigs: EnvironmentConfig[] = ENVIRONMENT_CONFIGS
  ) {
    this.defaultConfig = defaultConfig;
    this.environmentConfigs = new Map(
      envConfigs.map(config => [config.stage, config])
    );
  }

  /**
   * Resolve configuration for a specific deployment stage by merging
   * default configuration with environment-specific overrides.
   * 
   * @param stage - Deployment stage to resolve configuration for
   * @returns Resolved application configuration with resource names
   * @throws Error if stage is invalid or configuration resolution fails
   */
  public resolveConfiguration(stage: string): ResolvedApplicationConfig {
    // Validate stage exists
    if (!stage || typeof stage !== 'string') {
      throw new Error('Stage must be a non-empty string');
    }

    // Get environment configuration (may be undefined for unknown stages)
    const envConfig = this.environmentConfigs.get(stage);
    
    // Start with default configuration
    let resolvedConfig: ApplicationConfig = { ...this.defaultConfig };

    // Apply environment-specific overrides if available
    if (envConfig) {
      // Apply application overrides
      if (envConfig.applicationOverrides) {
        resolvedConfig = {
          ...resolvedConfig,
          ...envConfig.applicationOverrides
        };
      }

      // Apply build overrides
      if (envConfig.buildOverrides) {
        if (envConfig.buildOverrides.buildCommands) {
          resolvedConfig.buildCommands = [...envConfig.buildOverrides.buildCommands];
        }
        
        if (envConfig.buildOverrides.dockerBuildArgs) {
          resolvedConfig.dockerBuildArgs = {
            ...resolvedConfig.dockerBuildArgs,
            ...envConfig.buildOverrides.dockerBuildArgs
          };
        }
      }
    } else {
      // Warn about unknown stage but continue with defaults
      console.warn(`Warning: No environment configuration found for stage '${stage}'. Using default configuration.`);
    }

    // Generate resource names
    const resourceNames = this.generateResourceNames(resolvedConfig, stage, envConfig);

    // Create resolved configuration
    const resolved: ResolvedApplicationConfig = {
      ...resolvedConfig,
      resolvedStage: stage,
      resourceNames
    };

    // Validate the resolved configuration
    const validation = this.validateConfiguration(resolved);
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed for stage '${stage}': ${validation.errors.join(', ')}`);
    }

    return resolved;
  }

  /**
   * Validate a resolved application configuration with comprehensive validation rules.
   * 
   * @param config - Resolved application configuration to validate
   * @returns Validation result with errors and warnings
   */
  public validateConfiguration(config: ResolvedApplicationConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    this.validateRequiredFields(config, errors);
    
    // Validate AWS naming conventions
    this.validateAwsNamingConventions(config, errors);
    
    // Validate port configuration
    this.validatePortConfiguration(config, errors);
    
    // Validate paths and directories
    this.validatePaths(config, errors, warnings);
    
    // Validate build configuration
    this.validateBuildConfiguration(config, errors, warnings);
    
    // Validate resource name uniqueness and length
    this.validateResourceNames(config, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Perform detailed validation with structured error information.
   * 
   * @param config - Resolved application configuration to validate
   * @returns Detailed validation result with error types and suggestions
   */
  public validateConfigurationDetailed(config: ResolvedApplicationConfig): DetailedValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Validate required fields with detailed errors
    this.validateRequiredFieldsDetailed(config, errors);
    
    // Validate AWS naming conventions with detailed errors
    this.validateAwsNamingConventionsDetailed(config, errors);
    
    // Validate port configuration with detailed errors
    this.validatePortConfigurationDetailed(config, errors);
    
    // Validate paths with detailed errors
    this.validatePathsDetailed(config, errors, warnings);

    const isValid = errors.length === 0;
    const summary = isValid 
      ? `Configuration validation passed for stage '${config.resolvedStage}'`
      : `Configuration validation failed with ${errors.length} error(s) for stage '${config.resolvedStage}'`;

    return {
      isValid,
      errors,
      warnings,
      summary
    };
  }

  /**
   * Generate resource names based on configuration and naming conventions.
   * 
   * @param config - Application configuration
   * @param stage - Deployment stage
   * @param envConfig - Environment configuration (optional)
   * @returns Generated resource names
   */
  private generateResourceNames(
    config: ApplicationConfig,
    stage: string,
    envConfig?: EnvironmentConfig
  ): ResourceNames {
    // Default naming convention
    let useStagePrefix = false;
    let useStageSuffix = true;
    let separator = '-';

    // Apply environment-specific naming convention if available
    if (envConfig?.namingConvention) {
      useStagePrefix = envConfig.namingConvention.useStagePrefix;
      useStageSuffix = envConfig.namingConvention.useStageSuffix;
      separator = envConfig.namingConvention.separator;
    }

    // Helper function to apply naming convention
    const applyNaming = (baseName: string): string => {
      let name = baseName;
      
      if (useStagePrefix) {
        name = `${stage}${separator}${name}`;
      }
      
      if (useStageSuffix) {
        name = `${name}${separator}${stage}`;
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
   * Validate required fields are present and non-empty.
   */
  private validateRequiredFields(config: ResolvedApplicationConfig, errors: string[]): void {
    const requiredFields: (keyof ApplicationConfig)[] = [
      'applicationName',
      'sourceDirectory',
      'ecrRepositoryName',
      'serviceName',
      'taskDefinitionFamily',
      'albName',
      'targetGroupName'
    ];

    for (const field of requiredFields) {
      const value = config[field];
      if (!value || (typeof value === 'string' && value.trim().length === 0)) {
        errors.push(`Required field '${field}' is missing or empty`);
      }
    }
  }

  /**
   * Validate required fields with detailed error information.
   */
  private validateRequiredFieldsDetailed(config: ResolvedApplicationConfig, errors: ValidationError[]): void {
    const requiredFields: (keyof ApplicationConfig)[] = [
      'applicationName',
      'sourceDirectory',
      'ecrRepositoryName',
      'serviceName',
      'taskDefinitionFamily',
      'albName',
      'targetGroupName'
    ];

    for (const field of requiredFields) {
      const value = config[field];
      if (!value || (typeof value === 'string' && value.trim().length === 0)) {
        errors.push({
          type: ValidationErrorType.MISSING_REQUIRED_FIELD,
          field,
          message: `Required field '${field}' is missing or empty`,
          value,
          suggestion: `Provide a non-empty value for '${field}'`
        });
      }
    }
  }

  /**
   * Validate AWS resource naming conventions.
   */
  private validateAwsNamingConventions(config: ResolvedApplicationConfig, errors: string[]): void {
    // AWS resource name validation rules
    const awsNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/;
    const awsNameFields = [
      'ecrRepositoryName',
      'serviceName',
      'taskDefinitionFamily',
      'albName',
      'targetGroupName'
    ];

    for (const field of awsNameFields) {
      const value = config[field as keyof ApplicationConfig] as string;
      if (value && !awsNamePattern.test(value)) {
        errors.push(`Field '${field}' contains invalid characters for AWS resources. Must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen.`);
      }
    }

    // Check resource name lengths
    const nameLengthLimits = {
      ecrRepositoryName: 256,
      serviceName: 255,
      taskDefinitionFamily: 255,
      albName: 32,
      targetGroupName: 32
    };

    for (const [field, maxLength] of Object.entries(nameLengthLimits)) {
      const value = config.resourceNames[field as keyof ResourceNames] as string;
      if (value && value.length > maxLength) {
        errors.push(`Generated ${field} '${value}' exceeds AWS limit of ${maxLength} characters (current: ${value.length})`);
      }
    }
  }

  /**
   * Validate AWS naming conventions with detailed errors.
   */
  private validateAwsNamingConventionsDetailed(config: ResolvedApplicationConfig, errors: ValidationError[]): void {
    const awsNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/;
    const awsNameFields = [
      'ecrRepositoryName',
      'serviceName', 
      'taskDefinitionFamily',
      'albName',
      'targetGroupName'
    ];

    for (const field of awsNameFields) {
      const value = config[field as keyof ApplicationConfig] as string;
      if (value && !awsNamePattern.test(value)) {
        errors.push({
          type: ValidationErrorType.AWS_NAMING_VIOLATION,
          field,
          message: `Field '${field}' contains invalid characters for AWS resources`,
          value,
          suggestion: 'Use only alphanumeric characters and hyphens, cannot start or end with hyphen'
        });
      }
    }
  }

  /**
   * Validate port configuration.
   */
  private validatePortConfiguration(config: ResolvedApplicationConfig, errors: string[]): void {
    const port = config.containerPort;
    if (port !== undefined) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push(`Container port must be an integer between 1 and 65535, got: ${port}`);
      }
    }
  }

  /**
   * Validate port configuration with detailed errors.
   */
  private validatePortConfigurationDetailed(config: ResolvedApplicationConfig, errors: ValidationError[]): void {
    const port = config.containerPort;
    if (port !== undefined) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push({
          type: ValidationErrorType.INVALID_PORT,
          field: 'containerPort',
          message: 'Container port must be an integer between 1 and 65535',
          value: port,
          suggestion: 'Use a valid port number (e.g., 3000, 8080, 80)'
        });
      }
    }
  }

  /**
   * Validate paths and directories.
   */
  private validatePaths(config: ResolvedApplicationConfig, errors: string[], warnings: string[]): void {
    // Validate health check path
    if (config.healthCheckPath && !config.healthCheckPath.startsWith('/')) {
      errors.push(`Health check path must start with '/', got: ${config.healthCheckPath}`);
    }

    // Validate dockerfile path
    if (config.dockerfilePath && config.dockerfilePath.includes('..')) {
      warnings.push(`Dockerfile path contains '..' which may cause security issues: ${config.dockerfilePath}`);
    }
  }

  /**
   * Validate paths with detailed errors.
   */
  private validatePathsDetailed(config: ResolvedApplicationConfig, errors: ValidationError[], warnings: string[]): void {
    // Validate health check path
    if (config.healthCheckPath && !config.healthCheckPath.startsWith('/')) {
      errors.push({
        type: ValidationErrorType.INVALID_PATH,
        field: 'healthCheckPath',
        message: 'Health check path must start with \'/\'',
        value: config.healthCheckPath,
        suggestion: 'Use an absolute path like \'/api/health\' or \'/health\''
      });
    }

    // Validate dockerfile path
    if (config.dockerfilePath && config.dockerfilePath.includes('..')) {
      warnings.push(`Dockerfile path contains '..' which may cause security issues: ${config.dockerfilePath}`);
    }
  }

  /**
   * Validate build configuration.
   */
  private validateBuildConfiguration(config: ResolvedApplicationConfig, errors: string[], warnings: string[]): void {
    // Validate build commands exist
    if (!config.buildCommands || config.buildCommands.length === 0) {
      warnings.push('No build commands specified, build may fail');
    }

    // Validate docker build args
    if (config.dockerBuildArgs) {
      for (const [key, value] of Object.entries(config.dockerBuildArgs)) {
        if (typeof value !== 'string') {
          errors.push(`Docker build arg '${key}' must be a string, got: ${typeof value}`);
        }
      }
    }
  }

  /**
   * Validate resource names for uniqueness and length constraints.
   */
  private validateResourceNames(config: ResolvedApplicationConfig, errors: string[], warnings: string[]): void {
    const resourceNames = config.resourceNames;
    const nameValues = Object.values(resourceNames);
    const duplicates = nameValues.filter((name, index) => nameValues.indexOf(name) !== index);
    
    if (duplicates.length > 0) {
      warnings.push(`Duplicate resource names detected: ${duplicates.join(', ')}`);
    }
  }

  /**
   * Get available environment stages.
   * 
   * @returns Array of configured environment stage names
   */
  public getAvailableStages(): string[] {
    return Array.from(this.environmentConfigs.keys());
  }

  /**
   * Check if a stage is valid/configured.
   * 
   * @param stage - Stage name to validate
   * @returns True if stage is configured
   */
  public isValidStage(stage: string): boolean {
    return this.environmentConfigs.has(stage);
  }
}

/**
 * Default configuration resolver instance using default configurations.
 * Can be imported and used directly for most use cases.
 */
export const defaultConfigurationResolver = new ConfigurationResolver();

/**
 * Export the ConfigurationResolver class as default for convenient importing.
 */
export default ConfigurationResolver;