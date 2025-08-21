export interface Repository {
    owner: string;
    repository: string;
    repoString: string;
    branch: string;
  }
  
  export const CDK_APP_REPOSITORY: Repository = {
    owner: `rummykhan`,
    repository: `laravel-p0`,
    repoString: `rummykhan/laravel-p0`,
    branch: `main`,
  };
  
  
  export const USERS_WEB_APP_REPOSITORY: Repository = {
    owner: `devo-ws`,
    repository: `nextjs-users`,
    repoString: `devo-ws/nextjs-users`,
    branch: `main`,
  };