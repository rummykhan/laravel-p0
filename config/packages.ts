export interface Repository {
    owner: string;
    repository: string;
    repoString: string;
    branch: string;
  }
  
  export const CDK_APP_REPOSITORY: Repository = {
    owner: `clickpattern-dev`,
    repository: `meta-capi-cdk`,
    repoString: `clickpattern-dev/meta-capi-cdk`,
    branch: `main`,
  };
  
  
  export const USERS_WEB_APP_REPOSITORY: Repository = {
    owner: `clickpattern-dev`,
    repository: `meta-capi-web`,
    repoString: `clickpattern-dev/meta-capi-web`,
    branch: `main`,
  };