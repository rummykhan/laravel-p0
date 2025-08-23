export interface Repository {
  owner: string;
  repository: string;
  repoString: string;
  branch: string;
}

const OWNER = `clickpattern-dev`;
export const INFRA_REPO_NAME = `meta-capi-cdk`;
export const SERVICE_REPO_NAME = `meta-capi-web`;

export const CDK_APP_REPOSITORY: Repository = {
  owner: OWNER,
  repository: INFRA_REPO_NAME,
  repoString: `${OWNER}/${INFRA_REPO_NAME}`,
  branch: `main`,
};


export const USERS_WEB_APP_REPOSITORY: Repository = {
  owner: OWNER,
  repository: SERVICE_REPO_NAME,
  repoString: `${OWNER}/${SERVICE_REPO_NAME}`,
  branch: `main`,
};