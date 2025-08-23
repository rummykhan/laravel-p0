import * as cdk from 'aws-cdk-lib';
import {Construct} from "constructs";
import {DevStack} from "../stacks/dev-stack";
import {EcsStack} from "../stacks/ecs-stack";
import { resolveConfiguration } from "../utils/simple-config-resolver";
import { ApplicationConfig } from "../types/configuration-types";

export class ApplicationStage extends cdk.Stage {
  public readonly devStack: DevStack;
  public readonly ecsStack: EcsStack;
  public readonly resolvedConfiguration: ApplicationConfig;

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    // Resolve configuration for the beta deployment stage
    this.resolvedConfiguration = resolveConfiguration('beta');

    // Create DevStack first (existing infrastructure)
    this.devStack = new DevStack(this, `DevStack`, {
      ...props,
      description: 'Development stack with existing resources',
    });

    // Create EcsStack for containerized application deployment with resolved configuration
    this.ecsStack = new EcsStack(this, `EcsStack`, {
      ...props,
      description: `ECS Fargate stack for ${this.resolvedConfiguration.applicationDisplayName} with ALB`,
      stage: 'beta',
      applicationConfig: this.resolvedConfiguration, // Pass resolved configuration to ECS stack
    });

    // Add stage-specific tags to all resources in this stage
    cdk.Tags.of(this).add('Stage', 'beta');
    cdk.Tags.of(this).add('Application', this.resolvedConfiguration.applicationName);
    cdk.Tags.of(this).add('Environment', 'beta');
    cdk.Tags.of(this).add('DeploymentType', 'ECS-Fargate');

    // Note: No explicit dependencies needed between DevStack and EcsStack
    // as they are independent infrastructure components
    // EcsStack creates its own VPC and networking resources
  }
}