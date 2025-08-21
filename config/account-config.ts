import { AWSAccount, AwsRegion } from "./types";


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