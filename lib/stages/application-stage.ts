import * as cdk from 'aws-cdk-lib';
import {Construct} from "constructs";
import {DevStack} from "../stacks/dev-stack";
import {EcsStack} from "../stacks/ecs-stack";
import {VpcStack} from "../stacks/vpc-stack";
import { resolveConfiguration } from "../utils/simple-config-resolver";
import { ApplicationConfig } from "../types/configuration-types";
import { Stage } from '../../config/types';

export class ApplicationStage extends cdk.Stage {
  public readonly devStack: DevStack;
  public readonly vpcStack: VpcStack;
  public readonly ecsStack: EcsStack;
  public readonly resolvedConfiguration: ApplicationConfig;

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const stage = props?.stageName || Stage.beta.toLowerCase();

    // Resolve configuration for the beta deployment stage
    this.resolvedConfiguration = resolveConfiguration(stage);

    // Create DevStack first (existing infrastructure)
    this.devStack = new DevStack(this, `DevStack-${stage}`, {
      ...props,
      description: 'Development stack with existing resources',
    });

    // Create VPC Stack for network infrastructure
    this.vpcStack = new VpcStack(this, `VpcStack-${stage}`, {
      ...props,
      description: `VPC infrastructure for ${this.resolvedConfiguration.applicationDisplayName}`,
      stage: stage,
      applicationConfig: this.resolvedConfiguration,
    });

    // Create EcsStack for containerized application deployment with resolved configuration
    this.ecsStack = new EcsStack(this, `EcsStack-${stage}`, {
      ...props,
      description: `ECS Fargate stack for ${this.resolvedConfiguration.applicationDisplayName} with ALB`,
      stage: stage,
      applicationConfig: this.resolvedConfiguration, // Pass resolved configuration to ECS stack
      vpc: this.vpcStack.vpc, // Pass VPC from VPC stack
    });

    // Add stage-specific tags to all resources in this stage
    cdk.Tags.of(this).add('Stage', stage);
    cdk.Tags.of(this).add('Application', this.resolvedConfiguration.applicationName);
    cdk.Tags.of(this).add('Environment', stage);
    cdk.Tags.of(this).add('DeploymentType', 'ECS-Fargate');
  }
}