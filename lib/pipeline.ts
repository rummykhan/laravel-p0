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
          'nextjs-users': usersWebAppSource,
        },
        commands: [
          // Phase 1: Build CDK Infrastructure Code
          'echo "=== Phase 1: Building CDK Infrastructure ==="',
          'echo "Installing CDK dependencies..."',
          'npm ci',
          'echo "Building CDK project..."',
          'npm run build',
          'echo "CDK build completed successfully"',

          // Phase 2: Build and Push Next.js Application Docker Image
          'echo "=== Phase 2: Building Next.js Application ==="',
          'echo "Switching to Next.js application directory..."',
          'cd nextjs-users',
          'echo "Installing Next.js dependencies..."',
          'npm ci',
          'echo "Building Next.js application for production..."',
          'NODE_ENV=production npm run build',

          // Phase 3: Docker Image Build and Push
          'echo "=== Phase 3: Docker Image Build and Push ==="',
          'echo "Setting up AWS environment variables..."',
          'export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
          'export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}',
          'export ECR_REPOSITORY_URI=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/nextjs-users',
          'echo "AWS Account ID: ${AWS_ACCOUNT_ID}"',
          'echo "AWS Region: ${AWS_DEFAULT_REGION}"',
          'echo "ECR Repository URI: ${ECR_REPOSITORY_URI}"',

          // Login to ECR with error handling
          'echo "Logging into ECR..."',
          'aws ecr get-login-password --region ${AWS_DEFAULT_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com',

          // Create ECR repository if it doesn't exist (will be handled by CDK, but this ensures it exists during build)
          'echo "Ensuring ECR repository exists..."',
          'aws ecr describe-repositories --repository-names nextjs-users --region ${AWS_DEFAULT_REGION} || aws ecr create-repository --repository-name nextjs-users --region ${AWS_DEFAULT_REGION}',

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
          `docker build --build-arg NODE_ENV=${PipelineConfig.buildConfig.dockerBuildArgs.NODE_ENV} --build-arg NEXT_TELEMETRY_DISABLED=${PipelineConfig.buildConfig.dockerBuildArgs.NEXT_TELEMETRY_DISABLED} -t \${ECR_REPOSITORY_URI}:\${IMAGE_TAG} -t \${ECR_REPOSITORY_URI}:latest -t \${ECR_REPOSITORY_URI}:\${GIT_COMMIT_SHA} .`,

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
    PipelineConfig.stageAccounts.forEach((stageAccount) => {
      const stageProps: cdk.StageProps = {
        env: {
          account: stageAccount.accountId,
          region: stageAccount.region
        }
      };

      // Create stage name based on stage type and environment
      const stageName = `${stageAccount.stage.charAt(0).toUpperCase() + stageAccount.stage.slice(1)}Stage`;

      const betaStage = new BetaStage(this, stageName, stageProps);

      // Add the stage to the pipeline
      const stageDeployment = pipeline.addStage(betaStage);

      // CDK automatically handles ECS service updates when task definition changes
      // No additional post-deployment step needed
    });
  }
}
