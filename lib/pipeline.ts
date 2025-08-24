import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { ApplicationStage } from "./stages/application-stage";
import { ApplicationConfig } from "../lib/types/configuration-types";
import { DeploymentStage, Stage, AwsRegion } from "../config/types";

export interface PipelineProps extends cdk.StackProps {
  applicationConfig: ApplicationConfig;
}

export default class Pipeline extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id, props);

    const { infra: infraRepository, service: serviceRepository } = props.applicationConfig.repositories;

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

    const pipeline = new CodePipeline(this, `CodePipeline-${props.applicationConfig.applicationName}`, {
      pipelineName: props.applicationConfig.applicationName,

      synth: new ShellStep('Synth', {
        input: infraRepositorySource,
        additionalInputs: {
          [props.applicationConfig.serviceBuildConfig.sourceDirectory]: serviceRepositorySource,
        },
        commands: [
          // Phase 1: Build CDK Infrastructure Code
          'echo "=== Phase 1: Building CDK Infrastructure ==="',
          'echo "Installing CDK dependencies..."',
          'npm ci',
          'echo "Building CDK project..."',
          'npm run build',
          'echo "CDK build completed successfully"',

          // Phase 2: Build and Push Application Docker Image
          'echo "=== Phase 2: Building Application ==="',
          `echo "Switching to application directory: ${props.applicationConfig.serviceBuildConfig.sourceDirectory}..."`,
          `cd ${props.applicationConfig.serviceBuildConfig.sourceDirectory}`,
          'echo "Installing application dependencies..."',
          ...this.generateBuildCommands(props.applicationConfig),

          // Phase 3: Docker Image Build and Push
          'echo "=== Phase 3: Docker Image Build and Push ==="',
          'echo "Setting up AWS environment variables..."',
          'export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
          'export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}',
          `export ECR_REPOSITORY_URI=\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com/${props.applicationConfig.serviceBuildConfig.ecrRepositoryName}`,
          'echo "AWS Account ID: ${AWS_ACCOUNT_ID}"',
          'echo "AWS Region: ${AWS_DEFAULT_REGION}"',
          'echo "ECR Repository URI: ${ECR_REPOSITORY_URI}"',

          // Login to ECR with error handling
          'echo "Logging into ECR..."',
          'aws ecr get-login-password --region ${AWS_DEFAULT_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com',

          // Create ECR repository if it doesn't exist (will be handled by CDK, but this ensures it exists during build)
          'echo "Ensuring ECR repository exists..."',
          `aws ecr describe-repositories --repository-names ${props.applicationConfig.serviceBuildConfig.ecrRepositoryName} --region \${AWS_DEFAULT_REGION} || aws ecr create-repository --repository-name ${props.applicationConfig.serviceBuildConfig.ecrRepositoryName} --region \${AWS_DEFAULT_REGION}`,

          // Build Docker image with build timestamp as tag
          'echo "Building Docker image..."',
          'export IMAGE_TAG=$(date +%Y%m%d%H%M%S)',
          'export GIT_COMMIT_SHA=${CODEBUILD_RESOLVED_SOURCE_VERSION:-$(git rev-parse --short HEAD)}',
          'echo "Image tag: ${IMAGE_TAG}"',
          'echo "Git commit: ${GIT_COMMIT_SHA}"',
          'echo "Docker version: $(docker --version)"',
          'echo "Current directory: $(pwd)"',
          'echo "Directory contents:"',
          'ls -la',

          // Build with multiple tags for better tracking and build args from config
          ...this.generateDockerBuildCommand(props.applicationConfig),

          // Push Docker image to ECR with error handling
          'echo "Pushing Docker images to ECR..."',
          'docker push ${ECR_REPOSITORY_URI}:${IMAGE_TAG}',
          'docker push ${ECR_REPOSITORY_URI}:latest',
          'docker push ${ECR_REPOSITORY_URI}:${GIT_COMMIT_SHA}',

          // Store image information for deployment
          'echo "Storing image information..."',
          'echo "${ECR_REPOSITORY_URI}:${IMAGE_TAG}" > ../image-uri.txt',
          'echo "${IMAGE_TAG}" > ../image-tag.txt',
          'echo "${GIT_COMMIT_SHA}" > ../git-commit.txt',

          // Phase 4: Return to CDK and Synthesize
          'echo "=== Phase 4: CDK Template Synthesis ==="',
          'echo "Returning to CDK directory..."',
          'cd ..',

          // Verify image information files
          'echo "Verifying Docker image information..."',
          'echo "Image URI: $(cat image-uri.txt)"',
          'echo "Image Tag: $(cat image-tag.txt)"',
          'echo "Git Commit: $(cat git-commit.txt)"',

          // Synthesize CDK templates
          'echo "Synthesizing CDK CloudFormation templates..."',
          'npx cdk synth',
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
   * Generate build commands from the resolved configuration.
   * Replaces hardcoded build commands with configurable ones.
   * 
   * Requirements addressed:
   * - 1.3: Replace hardcoded build commands with configured build commands
   * - 2.3: Use configured build commands for application building
   * 
   * @param config - Resolved application configuration
   * @returns Array of build command strings
   */
  private generateBuildCommands(config: ApplicationConfig): string[] {
    const commands: string[] = [];

    // Add each configured build command with echo for visibility
    config.serviceBuildConfig.buildCommands.forEach((command, index) => {
      commands.push(`echo "Running build command ${index + 1}: ${command}"`);
      commands.push(command);
    });

    return commands;
  }

  /**
   * Generate Docker build command with configured build arguments.
   * Replaces hardcoded Docker build args with configurable ones.
   * 
   * Requirements addressed:
   * - 1.2: Use configured values instead of hardcoded ones
   * - 2.2: Use configured Docker build arguments
   * 
   * @param config - Resolved application configuration
   * @returns Array of Docker build command strings
   */
  private generateDockerBuildCommand(config: ApplicationConfig): string[] {
    // Build the build args string from configuration
    const buildArgs = Object.entries(config.serviceBuildConfig.dockerBuildArgs)
      .map(([key, value]) => `--build-arg ${key}=${value}`)
      .join(' ');

    return [
      `echo "Building Docker image with configured build args: ${buildArgs}"`,
      `docker build ${buildArgs} -t \${ECR_REPOSITORY_URI}:\${IMAGE_TAG} -t \${ECR_REPOSITORY_URI}:latest -t \${ECR_REPOSITORY_URI}:\${GIT_COMMIT_SHA} .`
    ];
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
