#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import PipelineStack from '../lib/pipeline';
import {Stage} from '../config/types'
import { PipelineAccount } from '../config/account-config';
import { resolveConfiguration } from '../lib/utils/simple-config-resolver';


const app = new cdk.App();


// Create a single pipeline that will deploy to multiple environments
// The pipeline itself runs in a central account (usually tools/CICD account)
new PipelineStack(app, 'PipelineStack', {
  // Pipeline stack environment - where the pipeline infrastructure runs
  env: {
    account: PipelineAccount.account,
    region: PipelineAccount.region
  },
  applicationConfig: resolveConfiguration(Stage.beta.toLowerCase()),
});