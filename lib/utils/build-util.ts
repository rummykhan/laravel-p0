import { BuildConfig } from '../types/configuration-types';


/**
 * Generate CDK Build commands.
 * 
 * @returns Array of commands for building CDK package.
 */
export const generateCDKBuildCommands = (): string[] => {
    return [
        'echo "Installing CDK dependencies..."',
        'npm ci',
        'echo "Building CDK project..."',
        'npm run build',
        'echo "CDK build completed successfully"',
    ];
}

/**
 * 
 * @returns Array of commands for synthesizing CDK package.
 */
export const generateCDKSynthCommands = (): string[] => {
    return [
        
        // Verify image information files
        'echo "Verifying Docker image information..."',
        'echo "Image URI: $(cat image-uri.txt)"',
        'echo "Image Tag: $(cat image-tag.txt)"',
        'echo "Git Commit: $(cat git-commit.txt)"',

        // Synthesize CDK templates
        'echo "Synthesizing CDK CloudFormation templates..."',
        'npx cdk synth',
    ];
}


export const generateCommandsToBuildAndUploadDockerImageToECR = (buildConfig: BuildConfig): string[] => {
    return [
        // Phase 1: Build and Push Application Docker Image
        'echo "=== Building Application ==="',
        ...generateBuildCommands(buildConfig.sourceDirectory, buildConfig.buildCommands),

        // Phase 2: Docker Image Build and Push
        'echo "=== Docker Image Build and Push ==="',
        ...generateDockerBuildCommand(buildConfig.ecrRepositoryName, buildConfig.dockerBuildArgs),

        // Push Docker image to ECR with error handling
        'echo "=== Pushing Docker Image To ECR ==="',
        ...generateDockerImageToECRCommands(),

        'echo "Returning to parent directory..."',
        'cd ..',
    ];
}

/**
* Generate build commands from the resolved configuration.
 * Replaces hardcoded build commands with configurable ones.
 * 
 * @param sourceDirectory - source directory for the cloned repository.
 * @param buildCommands - commands to build the package.
 * @returns Array of build command strings
 */
export const generateBuildCommands = (sourceDirectory: string, buildCommands: string[]): string[] => {
    const commands: string[] = [
        `echo "Switching to application directory: ${sourceDirectory}..."`,
        `cd ${sourceDirectory}`,
        'echo "Installing application dependencies..."',
    ];

    // Add each configured build command with echo for visibility
    buildCommands.forEach((command, index) => {
        commands.push(`echo "Running build command ${index + 1}: ${command}"`);
        commands.push(command);
    });

    return commands;
}


/**
   * Generate Docker build command with configured build arguments.
   * Replaces hardcoded Docker build args with configurable ones.
   * 
   * @param config - Resolved application configuration
   * @returns Array of Docker build command strings
   */
export const generateDockerBuildCommand = (ecrRepositoryName: string, dockerBuildArgs: { [key: string]: string }): string[] => {
    // Build the build args string from configuration

    const commands: string[] = [
        'echo "Setting up AWS environment variables..."',
        'export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
        'export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}',
        `export ECR_REPOSITORY_URI=\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_DEFAULT_REGION}.amazonaws.com/${ecrRepositoryName}`,
        'echo "AWS Account ID: ${AWS_ACCOUNT_ID}"',
        'echo "AWS Region: ${AWS_DEFAULT_REGION}"',
        'echo "ECR Repository URI: ${ECR_REPOSITORY_URI}"',

        // Login to ECR with error handling
        'echo "Logging into ECR..."',
        'aws ecr get-login-password --region ${AWS_DEFAULT_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com',

        // Create ECR repository if it doesn't exist (will be handled by CDK, but this ensures it exists during build)
        'echo "Ensuring ECR repository exists..."',
        `aws ecr describe-repositories --repository-names ${ecrRepositoryName} --region \${AWS_DEFAULT_REGION} || aws ecr create-repository --repository-name ${ecrRepositoryName} --region \${AWS_DEFAULT_REGION}`,

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
    ];

    const buildArgs = Object.entries(dockerBuildArgs)
        .map(([key, value]) => `--build-arg ${key}=${value}`)
        .join(' ');

    return [
        ...commands,
        `echo "Building Docker image with configured build args: ${buildArgs}"`,
        `docker build ${buildArgs} -t \${ECR_REPOSITORY_URI}:\${IMAGE_TAG} -t \${ECR_REPOSITORY_URI}:latest -t \${ECR_REPOSITORY_URI}:\${GIT_COMMIT_SHA} .`,
        ...generateDockerImageToECRCommands()
    ];
}

/**
 * Generate commands to push docker image to AWS ECR.
 * 
 * @returns Array of commands to push docker image to ECR.
 */
export const generateDockerImageToECRCommands = (): string[] => {
    return [
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
    ];
}