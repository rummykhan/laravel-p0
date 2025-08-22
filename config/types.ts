export enum Stage {
  personal = 'personal',
  test = 'Test',
  beta = 'Beta',
  gamma = 'Gamma',
  prod = 'Prod',
}

export enum Realm {
  NA = 'NA',
  EU = 'EU',
  FE = 'FE',
}

export enum AwsRegion {
  IAD = 'us-east-1', // NA
  PDX = 'us-west-2', // FE
  DUB = 'eu-west-1', // EU
}

export interface AWSAccount {
  readonly account: string;
  readonly region: AwsRegion;
  readonly isProd: boolean;
}

export interface DeploymentStage {
  stage: Stage;
  isProd: boolean;
  region: string;
  accountId: string;
}

// Re-export configuration types for convenient access
export * from './configuration-types';