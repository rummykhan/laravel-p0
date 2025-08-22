import {BetaAccount} from "./account-config"
import {DeploymentStage, Stage, ResolvedApplicationConfig} from "./types";
import {CDK_APP_REPOSITORY, Repository, USERS_WEB_APP_REPOSITORY} from "./packages";
import {defaultConfigurationResolver} from "./configuration-resolver";

export interface PipelineInterface {
  githubTokenSecretName: string;
  stageAccounts: DeploymentStage[];
  repositories: {
    CDK_APP_REPOSITORY: Repository;
    USERS_WEB_APP_REPOSITORY: Repository;
  };
  // Build configuration for container deployment
  buildConfig: {
    dockerBuildArgs: { [key: string]: string };
    ecrRepositoryName: string;
    buildTimeout: number; // in minutes
    enableBuildCache: boolean;
  };
  // Configuration resolver for stage-specific settings
  getConfigurationForStage: (stage: string) => ResolvedApplicationConfig;
}

/**
 * Resolve configuration for a specific deployment stage
 * 
 * This function uses the configuration resolver to merge default application
 * configuration with environment-specific overrides for the given stage.
 * 
 * Requirements addressed:
 * - 1.2: Use configured directory name instead of hardcoded values
 * - 2.2: Use configured ECR repository name
 * - 4.4: Use centralized configuration across pipeline stages
 * - 6.1: Maintain backward compatibility with defaults
 * 
 * @param stage - The deployment stage to resolve configuration for
 * @returns Resolved application configuration with stage-specific overrides
 */
function getConfigurationForStage(stage: string): ResolvedApplicationConfig {
  try {
    return defaultConfigurationResolver.resolveConfiguration(stage);
  } catch (error) {
    console.error(`Failed to resolve configuration for stage '${stage}':`, error);
    // Fallback to default configuration with warning (Requirement 6.1)
    console.warn(`Using default configuration for stage '${stage}' due to resolution failure`);
    return defaultConfigurationResolver.resolveConfiguration('beta'); // Use beta as fallback
  }
}

/**
 * Pipeline configuration with configurable deployment paths support
 * 
 * This configuration now uses the configuration resolver to replace hardcoded
 * values with configurable parameters that can be customized per application
 * and environment.
 * 
 * Key changes:
 * - ECR repository name now comes from resolved configuration
 * - Docker build args now use resolved configuration values
 * - Added getConfigurationForStage function for stage-specific resolution
 * - Maintains backward compatibility by using current values as defaults
 */
const PipelineConfig: PipelineInterface = {
  githubTokenSecretName: `github/pipeline`,
  stageAccounts: [
    {
      stage: Stage.beta,
      isProd: BetaAccount.isProd,
      region: BetaAccount.region,
      accountId: BetaAccount.account,
    },
  ],
  repositories: {
    CDK_APP_REPOSITORY,
    USERS_WEB_APP_REPOSITORY
  },
  // Build configuration for container deployment - now uses resolved configuration
  buildConfig: (() => {
    // Get configuration for the default stage (beta) to populate build config
    // This replaces hardcoded values with configurable ones (Requirements 1.2, 2.2)
    const defaultStageConfig = getConfigurationForStage(Stage.beta);
    return {
      dockerBuildArgs: defaultStageConfig.dockerBuildArgs, // Now configurable per environment
      ecrRepositoryName: defaultStageConfig.resourceNames.ecrRepositoryName, // Now configurable
      buildTimeout: 30, // 30 minutes timeout for build process
      enableBuildCache: true, // Enable Docker layer caching for faster builds
    };
  })(),
  // Configuration resolver function for stage-specific settings (Requirement 4.4)
  getConfigurationForStage
};


export default PipelineConfig;