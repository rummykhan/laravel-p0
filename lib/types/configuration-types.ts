import { DeploymentStage, AccountsByStage } from "../../config/types";
import { Repository } from "../../config/packages";
import { EcsEnvironmentConfig } from "../../config/types";

/**
 * Configuration interfaces and types for configurable deployment paths
 * 
 * This module defines the core interfaces used throughout the configurable
 * deployment system to replace hardcoded values with configurable parameters.
 */

/**
 * Application configuration interface containing all application settings
 * including resolved stage information and generated resource names.
 * 
 * This interface represents the complete, ready-to-use configuration
 * with resource names generated during initialization.
 */
export interface ApplicationConfig {
  // Application identification
  /** Unique identifier for the application (used in resource naming) */
  applicationName: string;
  /** Human-readable display name for the application */
  applicationDisplayName: string;

  // Pipeline configuration
  /** GitHub token secret name for repository access */
  githubTokenSecretName: string;
  /** Deployment stages/accounts configuration */
  accounts: AccountsByStage;
  /** Repository configuration for infrastructure and service code */
  repositories: {
    infraRepository: Repository;
    serviceRepository: Repository;
  };

  // Application settings (may be overridden per environment)
  /** Source directory containing the application code */
  sourceDirectory: string;
  /** ECR repository name for storing Docker images */
  ecrRepositoryName: string;
  /** Path to the Dockerfile relative to source directory */
  dockerfilePath: string;
  /** Port the container exposes for the application */
  containerPort: number;
  /** Health check endpoint path */
  healthCheckPath: string;

  // Build configuration (may be overridden per environment)
  /** Commands to run during the build process */
  buildCommands: string[];
  /** Docker build arguments passed during image build */
  dockerBuildArgs: { [key: string]: string };

  /** Generated resource names for this configuration */
  resourceNames: ResourceNames;
}

/**
 * Secrets Manager configuration interface for managing sensitive environment variables.
 * Secrets are stored as JSON objects in AWS Secrets Manager and injected into ECS tasks.
 */
export interface SecretsConfig {
  /** Environment-specific secrets keys, this will be injected as env variables */
  environmentKeys: string[];

  /** Custom secret name override (optional) */
  secretName: string;

  /** Custom secret name override (optional) */
  secretArn: string;
}

/**
 * Environment-specific configuration interface containing all environment-level
 * settings including deployment, infrastructure, and application overrides.
 */
export interface EnvironmentConfig {
  /** Deployment stage this configuration applies to */
  stage: string;

  /** Application configuration overrides for this environment */
  applicationOverrides?: Partial<Omit<ApplicationConfig, 'resolvedStage' | 'resourceNames'>>;

  /** Build configuration overrides for this environment */
  buildOverrides?: {
    /** Docker build arguments specific to this environment */
    dockerBuildArgs?: { [key: string]: string };
    /** Build commands specific to this environment */
    buildCommands?: string[];
  };

  /** ECS deployment configuration for this environment */
  ecsConfig: EcsEnvironmentConfig;

  /** Infrastructure monitoring and observability settings */
  monitoring: {
    /** Enable detailed CloudWatch monitoring */
    enableDetailedMonitoring: boolean;
    /** Enable AWS X-Ray tracing */
    enableXRayTracing: boolean;
    /** Enable ECS Container Insights */
    enableContainerInsights: boolean;
  };

  /** Secrets Manager configuration for this environment */
  secretsConfig?: SecretsConfig;
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