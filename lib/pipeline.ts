import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { ApplicationStage } from "./stages/application-stage";
import { ApplicationConfig } from "../lib/types/configuration-types";
import { DeploymentStage, Stage, AwsRegion } from "../config/types";
import * as buildUtil from "./utils/build-util";

export interface PipelineProps extends cdk.StackProps {
  applicationConfig: ApplicationConfig;
}

export default class Pipeline extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id, props);

    const { infra: infraRepository, service: serviceRepository, admin: adminRepository } = props.applicationConfig.repositories;

    // Create source for CDK app repository with explicit trigger configuration
    const infraRepositorySource = CodePipelineSource.gitHub(infraRepository.repoString, infraRepository.branch, {
      authentication: cdk.SecretValue.secretsManager(props.applicationConfig.githubTokenSecretName),
      trigger: cdk.aws_codepipeline_actions.GitHubTrigger.WEBHOOK // Explicit webhook trigger
    });

    // Create source for Users Web App repository with explicit trigger configuration
    const serviceRepositorySource = CodePipelineSource.gitHub(serviceRepository.repoString, serviceRepository.branch, {
      authentication: cdk.SecretValue.secretsManager(props.applicationConfig.githubTokenSecretName),
      trigger: cdk.aws_codepipeline_actions.GitHubTrigger.WEBHOOK // Explicit webhook trigger
    });

    const adminRepositorySource = CodePipelineSource.gitHub(adminRepository.repoString, adminRepository.branch, {
      authentication: cdk.SecretValue.secretsManager(props.applicationConfig.githubTokenSecretName),
      trigger: cdk.aws_codepipeline_actions.GitHubTrigger.WEBHOOK // Explicit webhook trigger
    });

    const pipeline = new CodePipeline(this, `CodePipeline-${props.applicationConfig.applicationName}`, {
      pipelineName: props.applicationConfig.applicationName,

      synth: new ShellStep('Synth', {
        input: infraRepositorySource,
        additionalInputs: {
          [props.applicationConfig.serviceBuildConfig.sourceDirectory]: serviceRepositorySource,
          [props.applicationConfig.adminBuildConfig.sourceDirectory]: adminRepositorySource,
        },
        commands: [
          // Phase 1: Build CDK Infrastructure Code
          'echo "=== Building CDK Infrastructure ==="',
          ...buildUtil.generateCDKBuildCommands(),

          // Phase 2: Build and Push service application Docker Image
          ...buildUtil.generateCommandsToBuildAndUploadDockerImageToECR(props.applicationConfig.serviceBuildConfig),

          // Phase 3: Build and Push admin application Docker Image
          ...buildUtil.generateCommandsToBuildAndUploadDockerImageToECR(props.applicationConfig.adminBuildConfig),

          // Phase 4: Return to CDK and Synthesize
          'echo "=== CDK Template Synthesis ==="',
          ...buildUtil.generateCDKSynthCommands(),

          'echo "=== Build Process Completed Successfully ==="'
        ],
        env: {
          // Enable Docker buildkit for better performance
          'DOCKER_BUILDKIT': '1',
          // Enable Docker CLI experimental features
          'DOCKER_CLI_EXPERIMENTAL': 'enabled',
          // Note: NODE_ENV is not set here to allow dev dependencies installation for CDK build
        },
        // Note: ECR permissions are handled by the pipeline's default role
      }),
      // Enable Docker support in CodeBuild
      dockerEnabledForSynth: true,
      // Enable cross-account deployments if needed
      crossAccountKeys: true,
      // Add additional IAM permissions for ECR operations
      synthCodeBuildDefaults: {
        buildEnvironment: {
          buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: cdk.aws_codebuild.ComputeType.SMALL,
        },
        rolePolicy: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: [
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
              'ecr:GetAuthorizationToken',
              'ecr:PutImage',
              'ecr:InitiateLayerUpload',
              'ecr:UploadLayerPart',
              'ecr:CompleteLayerUpload',
              'ecr:DescribeRepositories',
              'ecr:CreateRepository',
              'ecr:ListImages',
              'ecr:DescribeImages',
            ],
            resources: ['*'],
          }),
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: [
              'sts:GetCallerIdentity',
            ],
            resources: ['*'],
          }),
        ],
      },
    });

    // Deploy to all configured environments
    const deploymentStages = this.convertAccountsToDeploymentStages(props.applicationConfig.accounts);

    deploymentStages.forEach((deploymentStage) => {
      // Add the stage to the pipeline
      pipeline.addStage(new ApplicationStage(this, `stage-${deploymentStage.stage}-${this.getRegionKey(deploymentStage.region)}`,
        props.applicationConfig,
        {
          env: {
            account: deploymentStage.accountId,
            region: deploymentStage.region
          },
          stageName: `${deploymentStage.stage.toLowerCase()}-${this.getRegionKey(deploymentStage.region)}`,
        }));
    });
  }

  /**
   * Convert nested accounts structure to flat array of deployment stages.
   * This allows the pipeline to iterate over all stage-region combinations.
   * 
   * @param accounts - Nested accounts structure organized by stage and region
   * @returns Array of deployment stages for pipeline deployment
   */
  private convertAccountsToDeploymentStages(accounts: any): DeploymentStage[] {
    const deploymentStages: DeploymentStage[] = [];

    // Iterate through each stage (beta, gamma, prod)
    Object.entries(accounts).forEach(([stageName, regions]) => {
      if (regions && typeof regions === 'object') {
        // Iterate through each region (na, eu, fe) within the stage
        Object.entries(regions).forEach(([regionKey, accountId]) => {
          if (accountId && typeof accountId === 'string') {
            deploymentStages.push({
              stage: stageName as Stage,
              isProd: stageName === 'prod',
              region: this.getAwsRegionFromKey(regionKey),
              accountId: accountId
            });
          }
        });
      }
    });

    return deploymentStages;
  }

  /**
   * Map region keys to AWS regions.
   * 
   * @param regionKey - Region key (na, eu, fe)
   * @returns AWS region string
   */
  private getAwsRegionFromKey(regionKey: string): string {
    const regionMap: { [key: string]: string } = {
      'na': AwsRegion.IAD, // us-east-1
      'eu': AwsRegion.DUB, // eu-west-1
      'fe': AwsRegion.PDX, // us-west-2
    };

    return regionMap[regionKey] || AwsRegion.IAD; // Default to us-east-1
  }

  /**
   * Get region key from AWS region string.
   * 
   * @param region - AWS region string
   * @returns Region key (na, eu, fe)
   */
  private getRegionKey(region: string): string {
    const regionKeyMap: { [key: string]: string } = {
      [AwsRegion.IAD]: 'na', // us-east-1
      [AwsRegion.DUB]: 'eu', // eu-west-1
      [AwsRegion.PDX]: 'fe', // us-west-2
    };

    return regionKeyMap[region] || 'na'; // Default to na
  }
}
