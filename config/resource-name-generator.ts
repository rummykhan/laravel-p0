/**
 * Resource Name Generator
 * 
 * This module provides the ResourceNameGenerator class that generates AWS resource names
 * based on application configuration and naming conventions, with validation for AWS
 * resource naming rules and length limits.
 * 
 * Requirements addressed:
 * - 3.1: Configurable ECS service and cluster names
 * - 3.4: Naming conflict prevention
 * - 4.2: Configuration validation before deployment
 */

import {
  ApplicationConfig,
  EnvironmentConfig,
  ResourceNames,
  ValidationResult,
  ValidationError,
  ValidationErrorType
} from './configuration-types';

/**
 * AWS resource naming rules and constraints
 */
export const AWS_NAMING_RULES = {
  // General AWS naming pattern (alphanumeric and hyphens, cannot start/end with hyphen)
  GENERAL_PATTERN: /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/,
  
  // ECR repository naming (lowercase letters, numbers, hyphens, underscores, forward slashes)
  ECR_PATTERN: /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/,
  
  // CloudWatch log group pattern (alphanumeric, hyphens, underscores, periods, forward slashes)
  LOG_GROUP_PATTERN: /^[a-zA-Z0-9._/-]+$/,
  
  // Length limits for various AWS resources
  LENGTH_LIMITS: {
    ecrRepositoryName: 256,
    clusterName: 255,
    serviceName: 255,
    taskDefinitionFamily: 255,
    albName: 32,
    targetGroupName: 32,
    logGroupName: 512,
    securityGroupName: 255
  },
  
  // Reserved prefixes that should be avoided
  RESERVED_PREFIXES: ['aws', 'amazon', 'ecs', 'ec2'],
  
  // Maximum component length to prevent overly long names
  MAX_COMPONENT_LENGTH: 50
} as const;

/**
 * Naming collision detection and resolution strategies
 */
export enum CollisionResolutionStrategy {
  /** Append a numeric suffix (e.g., name-1, name-2) */
  NUMERIC_SUFFIX = 'NUMERIC_SUFFIX',
  /** Append a short hash (e.g., name-a1b2c3) */
  HASH_SUFFIX = 'HASH_SUFFIX',
  /** Throw an error and require manual resolution */
  ERROR = 'ERROR'
}

/**
 * Configuration for resource name generation
 */
export interface ResourceNameGeneratorConfig {
  /** Strategy for resolving naming conflicts */
  collisionResolution: CollisionResolutionStrategy;
  /** Maximum attempts to resolve naming conflicts */
  maxCollisionAttempts: number;
  /** Whether to validate generated names against AWS rules */
  validateAwsRules: boolean;
  /** Whether to check for reserved prefixes */
  checkReservedPrefixes: boolean;
}

/**
 * Default configuration for resource name generation
 */
export const DEFAULT_GENERATOR_CONFIG: ResourceNameGeneratorConfig = {
  collisionResolution: CollisionResolutionStrategy.NUMERIC_SUFFIX,
  maxCollisionAttempts: 10,
  validateAwsRules: true,
  checkReservedPrefixes: true
};

/**
 * Resource name generation context
 */
export interface NameGenerationContext {
  /** Application configuration */
  applicationConfig: ApplicationConfig;
  /** Deployment stage */
  stage: string;
  /** Environment configuration (optional) */
  environmentConfig?: EnvironmentConfig;
  /** Set of existing resource names to check for conflicts */
  existingNames?: Set<string>;
}

/**
 * Resource Name Generator class that creates AWS resource names based on
 * application configuration and naming conventions.
 */
export class ResourceNameGenerator {
  private config: ResourceNameGeneratorConfig;
  private existingNames: Set<string>;

  /**
   * Initialize the resource name generator.
   * 
   * @param config - Generator configuration options
   * @param existingNames - Set of existing resource names to avoid conflicts
   */
  constructor(
    config: ResourceNameGeneratorConfig = DEFAULT_GENERATOR_CONFIG,
    existingNames: Set<string> = new Set()
  ) {
    this.config = config;
    this.existingNames = new Set(existingNames);
  }

  /**
   * Generate all resource names for an application deployment.
   * 
   * @param context - Name generation context with application config and stage
   * @returns Generated resource names object
   * @throws Error if name generation fails or conflicts cannot be resolved
   */
  public generateResourceNames(context: NameGenerationContext): ResourceNames {
    const { applicationConfig, stage, environmentConfig } = context;
    
    // Merge existing names from context
    if (context.existingNames) {
      context.existingNames.forEach(name => this.existingNames.add(name));
    }

    // Get naming convention from environment config or use defaults
    const namingConvention = environmentConfig?.namingConvention || {
      useStagePrefix: false,
      useStageSuffix: true,
      separator: '-'
    };

    // Helper function to apply naming convention
    const applyNaming = (baseName: string): string => {
      let name = baseName;
      
      // Only apply stage naming if stage is not empty
      if (stage && stage.trim()) {
        if (namingConvention.useStagePrefix) {
          name = `${stage}${namingConvention.separator}${name}`;
        }
        
        if (namingConvention.useStageSuffix) {
          name = `${name}${namingConvention.separator}${stage}`;
        }
      }
      
      return name;
    };

    // Generate base resource names with unique suffixes to avoid conflicts
    const resourceNames: ResourceNames = {
      // ECR resources
      ecrRepositoryName: this.generateUniqueName(
        this.normalizeEcrName(applyNaming(applicationConfig.ecrRepositoryName)),
        'ecrRepositoryName'
      ),
      
      // ECS resources
      clusterName: this.generateUniqueName(
        applyNaming(`${applicationConfig.applicationName}-${applicationConfig.clusterNameSuffix}`),
        'clusterName'
      ),
      serviceName: this.generateUniqueName(
        applyNaming(applicationConfig.serviceName),
        'serviceName'
      ),
      taskDefinitionFamily: this.generateUniqueName(
        applyNaming(applicationConfig.taskDefinitionFamily),
        'taskDefinitionFamily'
      ),
      
      // Load balancer resources
      albName: this.generateUniqueName(
        applyNaming(applicationConfig.albName),
        'albName'
      ),
      targetGroupName: this.generateUniqueName(
        applyNaming(applicationConfig.targetGroupName),
        'targetGroupName'
      ),
      
      // CloudWatch resources - doesn't need uniqueness check as it's a path
      logGroupName: `/aws/ecs/${applyNaming(applicationConfig.applicationName)}`,
      
      // Security group names
      albSecurityGroupName: this.generateUniqueName(
        applyNaming(`${applicationConfig.applicationName}-alb-sg`),
        'securityGroupName'
      ),
      ecsSecurityGroupName: this.generateUniqueName(
        applyNaming(`${applicationConfig.applicationName}-ecs-sg`),
        'securityGroupName'
      )
    };

    // Validate all generated names
    const validation = this.validateResourceNames(resourceNames);
    if (!validation.isValid) {
      throw new Error(`Resource name validation failed: ${validation.errors.join(', ')}`);
    }

    // Add generated names to existing names set to prevent future conflicts
    Object.values(resourceNames).forEach(name => this.existingNames.add(name));

    return resourceNames;
  }

  /**
   * Generate a unique resource name, resolving conflicts if necessary.
   * 
   * @param baseName - Base name to make unique
   * @param resourceType - Type of resource for validation
   * @returns Unique resource name
   * @throws Error if unique name cannot be generated
   */
  private generateUniqueName(baseName: string, resourceType: keyof typeof AWS_NAMING_RULES.LENGTH_LIMITS): string {
    // First check if the base name is too long even before collision resolution
    const maxLength = AWS_NAMING_RULES.LENGTH_LIMITS[resourceType];
    if (baseName.length > maxLength) {
      throw new Error(`Base name '${baseName}' exceeds maximum length of ${maxLength} characters for ${resourceType}`);
    }

    let candidateName = baseName;
    let attempt = 0;

    // Check if base name is already unique and valid
    if (!this.existingNames.has(candidateName) && this.isValidResourceName(candidateName, resourceType)) {
      return candidateName;
    }

    // Try to resolve conflicts
    while (attempt < this.config.maxCollisionAttempts) {
      attempt++;
      
      switch (this.config.collisionResolution) {
        case CollisionResolutionStrategy.NUMERIC_SUFFIX:
          candidateName = `${baseName}-${attempt}`;
          break;
          
        case CollisionResolutionStrategy.HASH_SUFFIX:
          const hash = this.generateShortHash(baseName + attempt);
          candidateName = `${baseName}-${hash}`;
          break;
          
        case CollisionResolutionStrategy.ERROR:
          throw new Error(`Naming conflict detected for '${baseName}' and collision resolution is set to ERROR`);
      }

      // Check if candidate name is unique and valid
      if (!this.existingNames.has(candidateName) && this.isValidResourceName(candidateName, resourceType)) {
        return candidateName;
      }
    }

    throw new Error(`Unable to generate unique name for '${baseName}' after ${this.config.maxCollisionAttempts} attempts`);
  }

  /**
   * Validate all resource names against AWS naming rules.
   * 
   * @param resourceNames - Resource names to validate
   * @returns Validation result with errors and warnings
   */
  public validateResourceNames(resourceNames: ResourceNames): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate each resource name
    for (const [resourceType, name] of Object.entries(resourceNames)) {
      const resourceKey = resourceType as keyof ResourceNames;
      
      try {
        // Map security group names to the generic security group type for validation
        let validationKey: keyof typeof AWS_NAMING_RULES.LENGTH_LIMITS;
        if (resourceKey === 'albSecurityGroupName' || resourceKey === 'ecsSecurityGroupName') {
          validationKey = 'securityGroupName';
        } else {
          validationKey = resourceKey as keyof typeof AWS_NAMING_RULES.LENGTH_LIMITS;
        }
        
        if (!this.isValidResourceName(name, validationKey)) {
          errors.push(`Invalid ${resourceType}: '${name}'`);
        }
      } catch (error) {
        errors.push(`Validation error for ${resourceType}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Check for duplicate names
    const nameValues = Object.values(resourceNames);
    const duplicates = nameValues.filter((name, index) => nameValues.indexOf(name) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate resource names detected: ${duplicates.join(', ')}`);
    }

    // Check for reserved prefixes
    if (this.config.checkReservedPrefixes) {
      for (const [resourceType, name] of Object.entries(resourceNames)) {
        if (name && typeof name === 'string') {
          const hasReservedPrefix = AWS_NAMING_RULES.RESERVED_PREFIXES.some(prefix => 
            name.toLowerCase().startsWith(prefix.toLowerCase())
          );
          if (hasReservedPrefix) {
            warnings.push(`${resourceType} '${name}' starts with reserved prefix`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a single resource name against AWS naming rules.
   * 
   * @param name - Resource name to validate
   * @param resourceType - Type of AWS resource
   * @returns True if name is valid
   */
  private isValidResourceName(name: string, resourceType: keyof typeof AWS_NAMING_RULES.LENGTH_LIMITS): boolean {
    if (!name || typeof name !== 'string') {
      return false;
    }

    // Check length limits
    const maxLength = AWS_NAMING_RULES.LENGTH_LIMITS[resourceType];
    if (name.length > maxLength) {
      return false;
    }

    // Apply specific validation rules based on resource type
    switch (resourceType) {
      case 'ecrRepositoryName':
        return AWS_NAMING_RULES.ECR_PATTERN.test(name);
        
      case 'logGroupName':
        return AWS_NAMING_RULES.LOG_GROUP_PATTERN.test(name);
        
      default:
        // Use general AWS naming pattern for most resources
        return AWS_NAMING_RULES.GENERAL_PATTERN.test(name);
    }
  }

  /**
   * Normalize ECR repository name to comply with ECR naming rules.
   * 
   * @param name - Original name
   * @returns Normalized ECR-compliant name
   */
  private normalizeEcrName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9._/-]/g, '-')  // Replace invalid chars with hyphens
      .replace(/^[._-]+|[._-]+$/g, '') // Remove leading/trailing special chars
      .replace(/[._-]{2,}/g, '-');     // Replace multiple consecutive special chars
  }

  /**
   * Generate a short hash for collision resolution.
   * 
   * @param input - Input string to hash
   * @returns Short hash string (6 characters)
   */
  private generateShortHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6);
  }

  /**
   * Add existing resource names to avoid conflicts.
   * 
   * @param names - Array of existing resource names
   */
  public addExistingNames(names: string[]): void {
    names.forEach(name => this.existingNames.add(name));
  }

  /**
   * Clear all existing resource names.
   */
  public clearExistingNames(): void {
    this.existingNames.clear();
  }

  /**
   * Get all existing resource names.
   * 
   * @returns Array of existing resource names
   */
  public getExistingNames(): string[] {
    return Array.from(this.existingNames);
  }

  /**
   * Check if a name already exists.
   * 
   * @param name - Name to check
   * @returns True if name exists
   */
  public nameExists(name: string): boolean {
    return this.existingNames.has(name);
  }

  /**
   * Validate AWS resource naming rules for a specific resource type.
   * 
   * @param name - Resource name to validate
   * @param resourceType - AWS resource type
   * @returns Detailed validation result
   */
  public validateSingleResourceName(name: string, resourceType: keyof typeof AWS_NAMING_RULES.LENGTH_LIMITS): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name || typeof name !== 'string') {
      errors.push('Resource name must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    // Check length
    const maxLength = AWS_NAMING_RULES.LENGTH_LIMITS[resourceType];
    if (name.length > maxLength) {
      errors.push(`Name exceeds maximum length of ${maxLength} characters (current: ${name.length})`);
    }

    // Check pattern based on resource type
    let isValidPattern = false;
    switch (resourceType) {
      case 'ecrRepositoryName':
        isValidPattern = AWS_NAMING_RULES.ECR_PATTERN.test(name);
        if (!isValidPattern) {
          errors.push('ECR repository name must contain only lowercase letters, numbers, hyphens, underscores, and forward slashes');
        }
        break;
        
      case 'logGroupName':
        isValidPattern = AWS_NAMING_RULES.LOG_GROUP_PATTERN.test(name);
        if (!isValidPattern) {
          errors.push('Log group name contains invalid characters');
        }
        break;
        
      default:
        isValidPattern = AWS_NAMING_RULES.GENERAL_PATTERN.test(name);
        if (!isValidPattern) {
          errors.push('Name must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen');
        }
    }

    // Check for reserved prefixes
    if (this.config.checkReservedPrefixes) {
      const hasReservedPrefix = AWS_NAMING_RULES.RESERVED_PREFIXES.some(prefix => 
        name.toLowerCase().startsWith(prefix.toLowerCase())
      );
      if (hasReservedPrefix) {
        warnings.push('Name starts with a reserved prefix which may cause issues');
      }
    }

    // Check if name already exists
    if (this.existingNames.has(name)) {
      errors.push('Name already exists and would cause a conflict');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Default resource name generator instance.
 */
export const defaultResourceNameGenerator = new ResourceNameGenerator();

/**
 * Export the ResourceNameGenerator class as default.
 */
export default ResourceNameGenerator;