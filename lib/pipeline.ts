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
          // Install CDK dependencies (including dev dependencies for TypeScript)
          'echo "Installing CDK dependencies..."',
          'echo "Node version: $(node --version)"',
          'echo "NPM version: $(npm --version)"',
          'echo "Current directory: $(pwd)"',
          'echo "NODE_ENV: ${NODE_ENV:-not set}"',
          'npm ci',
          'echo "Verifying TypeScript installation..."',
          'npx tsc --version',
          
          // Build CDK project
          'echo "Building CDK project..."',
          'npm run build',
          
          // Build and push Docker image for Next.js application
          'echo "Building Next.js application..."',
          'cd nextjs-users',
          'npm ci',
          'NODE_ENV=production npm run build',
          
          // Get AWS account ID and region for ECR
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
          
          // Return to CDK directory
          'cd ..',
          
          // Verify image information files
          'echo "Image URI: $(cat image-uri.txt)"',
          'echo "Image Tag: $(cat image-tag.txt)"',
          'echo "Git Commit: $(cat git-commit.txt)"',
          
          // Synthesize CDK templates
          'echo "Synthesizing CDK templates..."',
          'npx cdk synth'
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

      // Add post-deployment step to update ECS service with new Docker image
      stageDeployment.addPost(new ShellStep('UpdateECSService', {
        commands: [
          // Get the current AWS account and region
          'echo "Setting up environment for ECS service update..."',
          'export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
          `export AWS_DEFAULT_REGION=${stageAccount.region}`,
          'export ECR_REPOSITORY_URI=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/nextjs-users',
          
          // Set ECS service names based on stage
          `export CLUSTER_NAME=nextjs-users-cluster-${stageAccount.stage}`,
          `export SERVICE_NAME=nextjs-users-service-${stageAccount.stage}`,
          
          'echo "AWS Account ID: ${AWS_ACCOUNT_ID}"',
          'echo "AWS Region: ${AWS_DEFAULT_REGION}"',
          'echo "ECS Cluster: ${CLUSTER_NAME}"',
          'echo "ECS Service: ${SERVICE_NAME}"',
          
          // Check if service exists before updating
          'echo "Checking if ECS service exists..."',
          'if aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_DEFAULT_REGION} --query "services[0].serviceName" --output text | grep -q "${SERVICE_NAME}"; then',
          '  echo "ECS service found, proceeding with update..."',
          '  ',
          '  # Get current service status before update',
          '  echo "Current service status:"',
          '  aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_DEFAULT_REGION} --query "services[0].{ServiceName:serviceName,Status:status,RunningCount:runningCount,DesiredCount:desiredCount,TaskDefinition:taskDefinition}" --output table',
          '  ',
          '  # Force new deployment to pick up the latest image',
          '  echo "Triggering ECS service deployment..."',
          '  DEPLOYMENT_ID=$(aws ecs update-service --cluster ${CLUSTER_NAME} --service ${SERVICE_NAME} --force-new-deployment --region ${AWS_DEFAULT_REGION} --query "service.deployments[0].id" --output text)',
          '  echo "Deployment ID: ${DEPLOYMENT_ID}"',
          '  ',
          '  # Wait for deployment to complete with timeout',
          '  echo "Waiting for deployment to complete (this may take several minutes)..."',
          '  if timeout 900 aws ecs wait services-stable --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_DEFAULT_REGION}; then',
          '    echo "Deployment completed successfully!"',
          '  else',
          '    echo "Deployment timed out or failed. Checking current status..."',
          '    aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_DEFAULT_REGION} --query "services[0].deployments[*].{Status:status,TaskDefinition:taskDefinition,RunningCount:runningCount,DesiredCount:desiredCount,CreatedAt:createdAt}" --output table',
          '    exit 1',
          '  fi',
          '  ',
          '  # Get the final service status',
          '  echo "Final service status:"',
          '  aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_DEFAULT_REGION} --query "services[0].deployments[?status==\'PRIMARY\'].{Status:status,TaskDefinition:taskDefinition,RunningCount:runningCount,DesiredCount:desiredCount,CreatedAt:createdAt}" --output table',
          '  ',
          '  # Get the load balancer URL',
          '  echo "Getting load balancer URL..."',
          '  ALB_DNS=$(aws elbv2 describe-load-balancers --region ${AWS_DEFAULT_REGION} --query "LoadBalancers[?contains(LoadBalancerName, \'nextjs-users\')].DNSName" --output text)',
          '  if [ ! -z "${ALB_DNS}" ]; then',
          '    echo "Application is available at: http://${ALB_DNS}"',
          '    echo "Health check endpoint: http://${ALB_DNS}/api/health"',
          '  else',
          '    echo "Warning: Could not retrieve load balancer DNS name"',
          '  fi',
          '  ',
          'else',
          '  echo "ECS service not found. This might be the first deployment."',
          '  echo "The service should be created by the CDK deployment."',
          '  ',
          '  # List available services for debugging',
          '  echo "Available ECS services in cluster:"',
          '  aws ecs list-services --cluster ${CLUSTER_NAME} --region ${AWS_DEFAULT_REGION} --query "serviceArns" --output table || echo "Cluster may not exist yet"',
          'fi',
        ],
        // Note: ECS permissions are handled by the pipeline's default role
      }));
    });
  }
}
