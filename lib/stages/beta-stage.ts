import * as cdk from 'aws-cdk-lib';
import {Construct} from "constructs";
import {DevStack} from "../stacks/dev-stack";

export class BetaStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const devStack = new DevStack(this, `DevStack`, props);

  }
}