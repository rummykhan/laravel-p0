export interface Repository {
    owner: string;
    repository: string;
    repoString: string;
    branch: string;
  }

  const OWNER = `clickpattern-dev`;
  const INFRA_REPO = `meta-capi-cdk`;
  const SERVICE_REPO = `meta-capi-web`;
  
  export const CDK_APP_REPOSITORY: Repository = {
    owner: OWNER,
    repository: INFRA_REPO,
    repoString: `${OWNER}/${INFRA_REPO}`,
    branch: `main`,
  };
  
  
  export const USERS_WEB_APP_REPOSITORY: Repository = {
    owner: OWNER,
    repository: SERVICE_REPO,
    repoString: `${OWNER}/${SERVICE_REPO}`,
    branch: `main`,
  };