export interface Repository {
    owner: string;
    repository: string;
    repoString: string;
    branch: string;
  }
  
  export const CDK_APP_REPOSITORY: Repository = {
    owner: `devo-ws`,
    repository: `cdk-app`,
    repoString: `devo-ws/cdk-app`,
    branch: `main`,
  };
  
  
  export const USERS_WEB_APP_REPOSITORY: Repository = {
    owner: `devo-ws`,
    repository: `nextjs-users`,
    repoString: `devo-ws/nextjs-users`,
    branch: `main`,
  };