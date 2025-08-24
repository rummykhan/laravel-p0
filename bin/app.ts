#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import Pipeline from '../lib/pipeline';
import { PipelineAccount } from '../config/account-config';
import applicationConfig from '../config/application-config';

const app = new cdk.App();

// Create a single pipeline that will deploy to multiple environments
// The pipeline itself runs in a central account (usually tools/CICD account)
new Pipeline(app, 'Pipeline', {
  // Pipeline stack environment - where the pipeline infrastructure runs
  env: {
    account: PipelineAccount.account,
    region: PipelineAccount.region
  },
  applicationConfig: applicationConfig,
});