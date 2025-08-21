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
        additionalInputs: {
          'users-app': usersWebAppSource, // Include users app source in synth step
        },
        commands: [
          'npm ci',
          'npm run build',
          'npx cdk synth'
        ],
      }),
      // Enable cross-account deployments if needed
      crossAccountKeys: true,
    });

    // Add build step for the users web app
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

    const stageDeployment = pipeline.addStage(new BetaStage(this, "BetaStage", props));
  }
}
