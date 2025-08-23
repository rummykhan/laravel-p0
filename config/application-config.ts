import {BetaAccount, ACCOUNTS_BY_STAGE} from "./account-config"
import {Stage} from "./types";
import {CDK_APP_REPOSITORY, SERVICE_REPO_NAME, USERS_WEB_APP_REPOSITORY} from "./packages";

/**
 * Default Application Configuration
 * 
 * This module defines the default configuration for application deployments,
 * replacing hardcoded values throughout the pipeline with configurable parameters.
 * These defaults are based on the current hardcoded values used in the system.
 */

import { BaseApplicationConfig } from '../lib/types/configuration-types';

const APP_NAME = SERVICE_REPO_NAME;

/**
 * Default application configuration containing all the current hardcoded values
 * as configurable defaults. This ensures backward compatibility while enabling
 * customization for different applications and environments.
 */
export const DEFAULT_APPLICATION_CONFIG: BaseApplicationConfig = {
  // Application identification
  /** 
   * Unique identifier for the application used in resource naming.
   */
  applicationName: APP_NAME,
  
  /** 
   * Human-readable display name for the application.
   * Used in documentation, logs, and user interfaces.
   */
  applicationDisplayName: 'META CAPI Application',

  
  githubTokenSecretName: `github/pipeline`,

  accounts: ACCOUNTS_BY_STAGE,
  repositories: {
    infraRepository: CDK_APP_REPOSITORY,
    serviceRepository: USERS_WEB_APP_REPOSITORY
  },
  
  // Repository and build configuration
  /** 
   * Source directory containing the application code, it should be same as your github repository.
   */
  sourceDirectory: APP_NAME,
  
  /** 
   * ECR repository name for storing Docker images.
   */
  ecrRepositoryName: APP_NAME,
  
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
   * Default: '/health' (dedicated health check endpoint)
   */
  healthCheckPath: '/api/health',
  
  // ECS configuration
  /** 
   * ECS service name used for the Fargate service.
   */
  serviceName: `${APP_NAME}-service`,
  
  /** 
   * Suffix for ECS cluster name, will be combined with environment/stage.
   */
  clusterNameSuffix: 'cluster',
  
  /** 
   * ECS task definition family name.
   */
  taskDefinitionFamily: APP_NAME,
  
  // Load balancer configuration
  /** 
   * Application Load Balancer name.
   */
  albName: `${APP_NAME}-alb`,
  
  /** 
   * Target group name for the load balancer.
   */
  targetGroupName: `${APP_NAME}-tg`,
  
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