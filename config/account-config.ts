import { AWSAccount, AwsRegion, AccountsByStage } from "./types";

export const BetaAccount: AWSAccount = {
  account: '713505378742',
  region: AwsRegion.IAD,
  isProd: false,
};

export const PipelineAccount: AWSAccount = {
  account: '713505378742',  // Same as beta for now, could be different
  region: AwsRegion.IAD,
  isProd: false,
};

// New nested accounts structure organized by stage and region
export const ACCOUNTS_BY_STAGE: AccountsByStage = {
  beta: {
    na: '713505378742', // Currently only NA region for beta
    // eu: 'account-id-for-eu-beta',  // Can be added when needed
    // fe: 'account-id-for-fe-beta',  // Can be added when needed
  },
  // gamma: {
  //   na: 'account-id-for-na-gamma',
  //   eu: 'account-id-for-eu-gamma',
  //   fe: 'account-id-for-fe-gamma',
  // },
  // prod: {
  //   na: 'account-id-for-na-prod',
  //   eu: 'account-id-for-eu-prod',
  //   fe: 'account-id-for-fe-prod',
  // },
};