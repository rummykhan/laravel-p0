/**
 * Configuration interfaces and types for configurable deployment paths
 * 
 * This module defines the core interfaces used throughout the configurable
 * deployment system to replace hardcoded values with configurable parameters.
 */

/**
 * Main application configuration interface containing all configurable properties
 * for an application deployment.
 */
export interface ApplicationConfig {
  // Application identification
  /** Unique identifier for the application (used in resource naming) */
  applicationName: string;
  /** Human-readable display name for the application */
  applicationDisplayName: string;
  
  // Repository and build configuration
  /** Source directory containing the application code */
  sourceDirectory: string;
  /** ECR repository name for storing Docker images */
  ecrRepositoryName: string;
  /** Path to the Dockerfile relative to source directory */
  dockerfilePath: string;
  
  // Container configuration
  /** Port the container exposes for the application */
  containerPort: number;
  /** Health check endpoint path */
  healthCheckPath: string;
  
  // ECS configuration
  /** ECS service name */
  serviceName: string;
  /** Suffix for ECS cluster name (will be combined with environment) */
  clusterNameSuffix: string;
  /** ECS task definition family name */
  taskDefinitionFamily: string;
  
  // Load balancer configuration
  /** Application Load Balancer name */
  albName: string;
  /** Target group name for the load balancer */
  targetGroupName: string;
  
  // Build configuration
  /** Commands to run during the build process */
  buildCommands: string[];
  /** Docker build arguments passed during image build */
  dockerBuildArgs: { [key: string]: string };
}

/**
 * Environment-specific configuration interface for overriding default
 * application settings per deployment stage.
 */
export interface EnvironmentConfig {
  /** Deployment stage this configuration applies to */
  stage: string;
  
  /** Resource naming patterns for this environment */
  namingConvention: {
    /** Whether to prefix resource names with stage name */
    useStagePrefix: boolean;
    /** Whether to suffix resource names with stage name */
    useStageSuffix: boolean;
    /** Separator character between name components */
    separator: string;
  };
  
  /** Partial application configuration overrides for this environment */
  applicationOverrides?: Partial<ApplicationConfig>;
  
  /** Environment-specific build setting overrides */
  buildOverrides?: {
    /** Docker build arguments specific to this environment */
    dockerBuildArgs?: { [key: string]: string };
    /** Build commands specific to this environment */
    buildCommands?: string[];
  };
}

/**
 * Interface defining all generated resource names for AWS resources
 * created during deployment.
 */
export interface ResourceNames {
  // ECR resources
  /** Generated ECR repository name */
  ecrRepositoryName: string;
  
  // ECS resources
  /** Generated ECS cluster name */
  clusterName: string;
  /** Generated ECS service name */
  serviceName: string;
  /** Generated ECS task definition family name */
  taskDefinitionFamily: string;
  
  // Load balancer resources
  /** Generated Application Load Balancer name */
  albName: string;
  /** Generated target group name */
  targetGroupName: string;
  
  // CloudWatch resources
  /** Generated CloudWatch log group name */
  logGroupName: string;
  
  // Security group names
  /** Generated ALB security group name */
  albSecurityGroupName: string;
  /** Generated ECS security group name */
  ecsSecurityGroupName: string;
}

/**
 * Result interface for configuration validation operations.
 */
export interface ValidationResult {
  /** Whether the configuration is valid */
  isValid: boolean;
  /** Array of validation error messages */
  errors: string[];
  /** Array of validation warning messages */
  warnings: string[];
  /** Additional context or suggestions for fixing issues */
  suggestions?: string[];
}

/**
 * Resolved application configuration after merging defaults with
 * environment-specific overrides.
 */
export interface ResolvedApplicationConfig extends ApplicationConfig {
  /** The stage this configuration was resolved for */
  resolvedStage: string;
  /** Generated resource names for this configuration */
  resourceNames: ResourceNames;
}

/**
 * Configuration validation error types for better error handling.
 */
export enum ValidationErrorType {
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_LENGTH = 'INVALID_LENGTH',
  NAMING_CONFLICT = 'NAMING_CONFLICT',
  AWS_NAMING_VIOLATION = 'AWS_NAMING_VIOLATION',
  INVALID_PORT = 'INVALID_PORT',
  INVALID_PATH = 'INVALID_PATH',
}

/**
 * Detailed validation error with type and context information.
 */
export interface ValidationError {
  /** Type of validation error */
  type: ValidationErrorType;
  /** Field name that failed validation */
  field: string;
  /** Error message describing the issue */
  message: string;
  /** Current value that failed validation */
  value?: any;
  /** Suggested fix for the error */
  suggestion?: string;
}

/**
 * Enhanced validation result with detailed error information.
 */
export interface DetailedValidationResult {
  /** Whether the configuration is valid */
  isValid: boolean;
  /** Array of detailed validation errors */
  errors: ValidationError[];
  /** Array of validation warning messages */
  warnings: string[];
  /** Overall validation summary */
  summary: string;
}