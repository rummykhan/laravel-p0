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
  }
};


export default PipelineConfig;