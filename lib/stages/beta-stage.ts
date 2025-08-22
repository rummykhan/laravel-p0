import * as cdk from 'aws-cdk-lib';
import {Construct} from "constructs";
import {DevStack} from "../stacks/dev-stack";
import {EcsStack} from "../stacks/ecs-stack";

export class BetaStage extends cdk.Stage {
  public readonly devStack: DevStack;
  public readonly ecsStack: EcsStack;

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    // Create DevStack first (existing infrastructure)
    this.devStack = new DevStack(this, `DevStack`, {
      ...props,
      description: 'Development stack with existing resources',
    });

    // Create EcsStack for containerized Next.js application deployment with stage-specific configuration
    this.ecsStack = new EcsStack(this, `EcsStack`, {
      ...props,
      description: 'ECS Fargate stack for Next.js users application with ALB',
      stage: 'beta', // Pass the stage for environment-specific configuration
    });

    // Note: No explicit dependencies needed between DevStack and EcsStack
    // as they are independent infrastructure components
    // EcsStack creates its own VPC and networking resources
  }
}