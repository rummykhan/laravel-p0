import { ACCOUNTS_BY_STAGE } from "./account-config"
import { CDK_APP_REPOSITORY, SERVICE_REPO_NAME, USERS_WEB_APP_REPOSITORY } from "./packages";

/**
 * Default Application Configuration
 * 
 * This module defines the default configuration for application deployments,
 * replacing hardcoded values throughout the pipeline with configurable parameters.
 * These defaults are based on the current hardcoded values used in the system.
 */

import { ApplicationConfig } from '../lib/types/configuration-types';

const APP_NAME = SERVICE_REPO_NAME;

/**
 * Default application configuration containing all the current hardcoded values
 * as configurable defaults. This ensures backward compatibility while enabling
 * customization for different applications and environments.
 * 
 * Note: This is a base configuration without resource names. Use createApplicationConfig
 * to get a complete configuration with generated resource names for a specific stage.
 */
const APPLICATION_CONFIG: ApplicationConfig = {
  // Application identification
  applicationName: `MetaCAPIInfrastructure`,
  applicationDescription: 'Application for META CAPI Service & API',

  githubTokenSecretName: `github/pipeline`,

  accounts: ACCOUNTS_BY_STAGE,
  
  repositories: {
    infra: CDK_APP_REPOSITORY,
    service: USERS_WEB_APP_REPOSITORY
  },

  serviceBuildConfig: {
    repositoryName: APP_NAME,
    
    sourceDirectory: APP_NAME,
    
    ecrRepositoryName: APP_NAME,
    
    dockerfilePath: 'Dockerfile',

    buildCommands: [
      'npm ci',
      'NODE_ENV=production npm run build'
    ],

    dockerBuildArgs: {
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1'
    }

  },
};

/**
 * Export the default configuration for use throughout the application.
 * This constant can be imported and used as the base configuration,
 * with environment-specific overrides applied as needed.
 */
export default APPLICATION_CONFIG;