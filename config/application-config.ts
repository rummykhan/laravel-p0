/**
 * Default Application Configuration
 * 
 * This module defines the default configuration for application deployments,
 * replacing hardcoded values throughout the pipeline with configurable parameters.
 * These defaults are based on the current hardcoded values used in the system.
 */

import { ApplicationConfig } from './configuration-types';

/**
 * Default application configuration containing all the current hardcoded values
 * as configurable defaults. This ensures backward compatibility while enabling
 * customization for different applications and environments.
 * 
 * These values are extracted from the existing hardcoded implementation:
 * - Source directory: 'nextjs-users' (from pipeline.ts additionalInputs)
 * - ECR repository: 'nextjs-users' (from pipeline-config.ts and pipeline.ts)
 * - Container port: 3000 (from ecs-stack.ts port mappings and environment variables)
 * - Health check path: '/api/health' (from ecs-stack.ts target group health check)
 * - Build commands: npm ci and production build (from pipeline.ts synth commands)
 * - Docker build args: NODE_ENV and NEXT_TELEMETRY_DISABLED (from pipeline-config.ts)
 */
export const DEFAULT_APPLICATION_CONFIG: ApplicationConfig = {
  // Application identification
  /** 
   * Unique identifier for the application used in resource naming.
   * Default: 'nextjs-users' (extracted from existing hardcoded values)
   */
  applicationName: 'nextjs-users',
  
  /** 
   * Human-readable display name for the application.
   * Used in documentation, logs, and user interfaces.
   */
  applicationDisplayName: 'Next.js Users Application',
  
  // Repository and build configuration
  /** 
   * Source directory containing the application code.
   * Default: 'nextjs-users' (from pipeline.ts additionalInputs mapping)
   */
  sourceDirectory: 'nextjs-users',
  
  /** 
   * ECR repository name for storing Docker images.
   * Default: 'nextjs-users' (from pipeline-config.ts buildConfig.ecrRepositoryName)
   */
  ecrRepositoryName: 'nextjs-users',
  
  /** 
   * Path to the Dockerfile relative to the source directory.
   * Default: 'Dockerfile' (standard Docker convention)
   */
  dockerfilePath: 'Dockerfile',
  
  // Container configuration
  /** 
   * Port the container exposes for the application.
   * Default: 3000 (from ecs-stack.ts port mappings and environment PORT variable)
   */
  containerPort: 3000,
  
  /** 
   * Health check endpoint path for load balancer and container health checks.
   * Default: '/api/health' (from ecs-stack.ts target group health check configuration)
   */
  healthCheckPath: '/api/health',
  
  // ECS configuration
  /** 
   * ECS service name used for the Fargate service.
   * Default: 'nextjs-users-service' (following current naming convention)
   */
  serviceName: 'nextjs-users-service',
  
  /** 
   * Suffix for ECS cluster name, will be combined with environment/stage.
   * Default: 'cluster' (from ecs-stack.ts cluster naming pattern)
   */
  clusterNameSuffix: 'cluster',
  
  /** 
   * ECS task definition family name.
   * Default: 'nextjs-users' (from ecs-stack.ts task definition family pattern)
   */
  taskDefinitionFamily: 'nextjs-users',
  
  // Load balancer configuration
  /** 
   * Application Load Balancer name.
   * Default: 'nextjs-users-alb' (from ecs-stack.ts ALB loadBalancerName)
   */
  albName: 'nextjs-users-alb',
  
  /** 
   * Target group name for the load balancer.
   * Default: 'nextjs-users-tg' (from ecs-stack.ts target group targetGroupName)
   */
  targetGroupName: 'nextjs-users-tg',
  
  // Build configuration
  /** 
   * Commands to run during the build process.
   * Default: npm ci and production build (from pipeline.ts synth commands)
   */
  buildCommands: [
    'npm ci',
    'NODE_ENV=production npm run build'
  ],
  
  /** 
   * Docker build arguments passed during image build.
   * Default: NODE_ENV=production and NEXT_TELEMETRY_DISABLED=1 
   * (from pipeline-config.ts buildConfig.dockerBuildArgs)
   */
  dockerBuildArgs: {
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1'
  }
};

/**
 * Export the default configuration for use throughout the application.
 * This constant can be imported and used as the base configuration,
 * with environment-specific overrides applied as needed.
 */
export default DEFAULT_APPLICATION_CONFIG;