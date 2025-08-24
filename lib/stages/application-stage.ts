import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { DevStack } from "../stacks/dev-stack";
import { EcsStack } from "../stacks/ecs-stack";
import { VpcStack } from "../stacks/vpc-stack";

import { ApplicationConfig } from "../types/configuration-types";
import { Stage } from '../../config/types';
import { getEnvironmentConfig } from '../../config/environment-configs';

export class ApplicationStage extends cdk.Stage {
  public readonly devStack: DevStack;
  public readonly vpcStack: VpcStack;
  public readonly ecsStack: EcsStack;


  constructor(scope: Construct, id: string, applicationConfig: ApplicationConfig, props?: cdk.StageProps) {
    super(scope, id, props);

    const fullStageName = props?.stageName || Stage.beta.toLowerCase();

    // Extract base stage name from combined stage-region name (e.g., "beta-na" -> "beta")
    const stage = fullStageName.split('-')[0];

    // Get environment configuration for the stage
    const environmentConfig = getEnvironmentConfig(stage);
    if (!environmentConfig) {
      throw new Error(`No environment configuration found for stage: ${stage}`);
    }

    // Create DevStack first (existing infrastructure)
    this.devStack = new DevStack(this, `DevStack`, {
      ...props,
      description: 'Development stack with existing resources',
    });

    // Create VPC Stack for network infrastructure
    this.vpcStack = new VpcStack(this, `VpcStack`, {
      ...props,
      description: `VPC infrastructure for ${applicationConfig.applicationDisplayName}`,
      stage: stage, // Use base stage for configuration
      applicationConfig: applicationConfig,
    });

    // Create EcsStack for containerized application deployment with resolved configuration
    this.ecsStack = new EcsStack(this, `EcsStack`, {
      ...props,
      description: `ECS Fargate stack for ${applicationConfig.applicationDisplayName} with ALB`,
      stage: stage, // Use base stage for configuration
      environmentConfig: environmentConfig, // Pass full environment configuration to ECS stack
      applicationConfig: applicationConfig, // Pass resolved configuration to ECS stack
      vpc: this.vpcStack.vpc, // Pass VPC from VPC stack
    });

    // Add stage-specific tags to all resources in this stage
    cdk.Tags.of(this).add('Stage', fullStageName); // Use full stage name for tagging
    cdk.Tags.of(this).add('Application', applicationConfig.applicationName);
    cdk.Tags.of(this).add('Environment', stage); // Use base stage for environment
    cdk.Tags.of(this).add('DeploymentType', 'ECS-Fargate');
  }
}