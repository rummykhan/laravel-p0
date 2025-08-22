import {BetaAccount} from "./account-config"
import {DeploymentStage, Stage} from "./types";
import {CDK_APP_REPOSITORY, Repository, USERS_WEB_APP_REPOSITORY} from "./packages";

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
}

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
  // Build configuration for container deployment
  buildConfig: {
    dockerBuildArgs: {
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    ecrRepositoryName: 'nextjs-users',
    buildTimeout: 30, // 30 minutes timeout for build process
    enableBuildCache: true, // Enable Docker layer caching for faster builds
  }
};


export default PipelineConfig;