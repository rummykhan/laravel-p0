import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { BetaStage } from "./stages/beta-stage";
import PipelineConfig from "../config/pipeline-config";

export default class Pipeline extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const { CDK_APP_REPOSITORY, USERS_WEB_APP_REPOSITORY } = PipelineConfig.repositories;

    // Create source for CDK app repository with explicit trigger configuration
    const cdkSource = CodePipelineSource.gitHub(CDK_APP_REPOSITORY.repoString, CDK_APP_REPOSITORY.branch, {
      authentication: cdk.SecretValue.secretsManager(PipelineConfig.githubTokenSecretName),
      trigger: cdk.aws_codepipeline_actions.GitHubTrigger.WEBHOOK // Explicit webhook trigger
    });

    // Create source for Users Web App repository with explicit trigger configuration
    const usersWebAppSource = CodePipelineSource.gitHub(USERS_WEB_APP_REPOSITORY.repoString, USERS_WEB_APP_REPOSITORY.branch, {
      authentication: cdk.SecretValue.secretsManager(PipelineConfig.githubTokenSecretName),
      trigger: cdk.aws_codepipeline_actions.GitHubTrigger.WEBHOOK // Explicit webhook trigger
    });

    const pipeline = new CodePipeline(this, 'DevoWSPipeline', {
      pipelineName: 'DevoWSPipeline',
      synth: new ShellStep('Synth', {
        input: cdkSource,
        commands: [
          // Install CDK dependencies only
          'npm ci',
          // Build CDK project only
          'npm run build',
          // Synthesize CDK templates
          'npx cdk synth'
        ],
      }),
      // Enable cross-account deployments if needed
      crossAccountKeys: true,
    });

    // Add build step for the users web app as a separate wave
    const usersBuildStep = new ShellStep('BuildUsersWebApp', {
      input: usersWebAppSource,
      commands: [
        'npm ci',
        'npm run build'
      ]
    });

    // Add the users web app build step to the pipeline
    pipeline.addWave('BuildUsersWebApp', {
      post: [usersBuildStep]
    });

    // Deploy to all configured environments
    PipelineConfig.stageAccounts.forEach((stageAccount) => {
      const stageProps: cdk.StageProps = {
        env: {
          account: stageAccount.accountId,
          region: stageAccount.region
        }
      };

      // Create stage name based on stage type and environment
      const stageName = `${stageAccount.stage.charAt(0).toUpperCase() + stageAccount.stage.slice(1)}Stage`;
      
      pipeline.addStage(new BetaStage(this, stageName, stageProps));
    });
  }
}
