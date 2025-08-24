import * as logs from 'aws-cdk-lib/aws-logs';
import * as cdk from 'aws-cdk-lib';

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

// New nested account structure
export interface AccountsByRegion {
  na?: string;
  eu?: string;
  fe?: string;
}

export interface AccountsByStage {
  beta?: AccountsByRegion;
  gamma?: AccountsByRegion;
  prod?: AccountsByRegion;
}

// Environment-specific configuration interface
export interface EcsEnvironmentConfig {
  // Resource sizing
  cpu: number;
  memoryLimitMiB: number;
  memoryReservationMiB: number;

  // Service configuration
  desiredCount: number;
  minCapacity: number;
  maxCapacity: number;

  // Auto-scaling configuration
  targetCpuUtilization: number;
  scaleInCooldown: cdk.Duration;
  scaleOutCooldown: cdk.Duration;

  // Deployment configuration
  maxHealthyPercent: number;
  minHealthyPercent: number;
  healthCheckGracePeriod: cdk.Duration;

  // Circuit breaker configuration
  circuitBreakerEnabled: boolean;
  circuitBreakerRollback: boolean;

  // Environment variables
  environmentVariables: { [key: string]: string };

  // Logging configuration
  logRetention: logs.RetentionDays;

  // Security configuration
  enableExecuteCommand: boolean;

  containerPort: number;
  healthCheckPath: string;
}

// Re-export configuration types for convenient access
export * from '../lib/types/configuration-types';