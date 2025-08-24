# CDK Application Template

This is a CDK TypeScript project template for deploying applications with automated CI/CD pipelines using a comprehensive configuration system.

## Configuration Architecture

This project uses a layered configuration system that flows from the entry point through multiple stages to the final AWS resources:

### Configuration Flow Overview

```
bin/app.ts
    ↓ (imports applicationConfig)
config/application-config.ts
    ↓ (uses accounts, repositories)
lib/pipeline.ts
    ↓ (creates stages for each environment)
lib/stages/application-stage.ts
    ↓ (resolves environment config, creates stacks)
lib/stacks/ecs-stack.ts
    ↓ (uses resolved config for AWS resources)
```

### Configuration Layers

#### 1. **Entry Point** (`bin/app.ts`)
- Creates the CDK App
- Imports the base application configuration
- Sets the pipeline account and region
- Instantiates the main Pipeline stack

#### 2. **Application Configuration** (`config/application-config.ts`)
- Defines base application settings (name, description)
- Configures repository information for infrastructure and service code
- Sets up service build configuration including Docker build arguments and build commands
- Configures GitHub token secret name for pipeline access
- Uses accounts from `config/account-config.ts` and repositories from `config/packages.ts`

#### 3. **Account Configuration** (`config/account-config.ts`)
- Defines AWS account IDs organized by stage and region
- Maps deployment stages (beta, gamma, prod) to specific AWS accounts
- Supports multi-region deployments (NA, EU, FE)

#### 4. **Environment-Specific Configuration** (`config/environment-configs.ts`)
- Provides environment-specific overrides for each deployment stage
- Configures ECS resource sizing (CPU, memory, scaling parameters)
- Sets environment variables, logging retention, and monitoring settings
- Defines deployment strategies and health check configurations
- Contains environment-specific resource names for all AWS resources
- Supports build configuration overrides per environment

#### 5. **Pipeline Processing** (`lib/pipeline.ts`)
- Processes the application configuration
- Creates deployment stages for each configured environment
- Handles Docker image building and ECR repository management
- Orchestrates the CI/CD pipeline with GitHub integration

#### 6. **Application Stage** (`lib/stages/application-stage.ts`)
- Resolves environment-specific configuration for each deployment stage
- Creates the necessary stacks (VPC, ECS) with resolved configuration
- Applies stage-specific tags and naming conventions

#### 7. **ECS Stack** (`lib/stacks/ecs-stack.ts`)
- Uses the fully resolved configuration to create AWS resources
- Applies environment-specific settings for ECS services, load balancers, and security groups
- Configures auto-scaling, monitoring, and logging based on environment requirements

### Configuration Resolution Process

1. **Base Configuration**: Application-wide defaults are defined in `application-config.ts`
2. **Environment Resolution**: Stage-specific overrides are applied from `environment-configs.ts`
3. **Resource Naming**: Environment-specific resource names are defined in each environment configuration
4. **Validation**: Configuration is validated at multiple points to ensure consistency
5. **Deployment**: Resolved configuration is used to create AWS resources

## Setup for New Account

### 1. First Time Setup

1. **Clone the repository:**
   ```bash
   git clone git@github.com:clickpattern-dev/cdk-template.git
   cd cdk-template
   ```

2. **Update configuration files in order:**

   - **Update `config/packages.ts`**: Configure your GitHub repositories and organization
   - **Update `config/account-config.ts`**: Add your AWS account IDs for each stage and region
   - **Update `config/application-config.ts`**: Configure application-specific settings (name, ports, build commands)
   - **Update `config/environment-configs.ts`**: Customize environment-specific settings (resource sizing, environment variables)
   - **Update `tsconfig.json`**: Add your service repository name to the exclude list

### 2. Configuration Details

#### Repository Configuration (`config/packages.ts`)
```typescript
// Update these values for your organization and repositories
const OWNER = `your-github-org`;
export const INFRA_REPO_NAME = `your-infrastructure-repo`;
export const SERVICE_REPO_NAME = `your-application-repo`;
```

#### Account Configuration (`config/account-config.ts`)
```typescript
// Configure your AWS accounts for each stage and region
export const ACCOUNTS_BY_STAGE: AccountsByStage = {
  beta: {
    na: 'your-beta-account-id', // us-east-1
    // eu: 'your-beta-eu-account-id',  // eu-west-1 (optional)
    // fe: 'your-beta-fe-account-id',  // us-west-2 (optional)
  },
  // Add gamma and prod configurations as needed
};
```

#### Application Configuration (`config/application-config.ts`)
- **Application Identity**: Set `applicationName` and `applicationDescription`
- **Repository Configuration**: Configure infrastructure and service repositories
- **Service Build Configuration**: Set up `serviceBuildConfig` with build commands, Docker arguments, and ECR settings
- **GitHub Integration**: Configure `githubTokenSecretName` for pipeline access

#### Environment Configuration (`config/environment-configs.ts`)
- **Resource Sizing**: Configure CPU, memory, and scaling parameters per environment
- **Environment Variables**: Set stage-specific environment variables
- **Secrets Management**: Configure AWS Secrets Manager integration for secure environment variables
- **Build Overrides**: Override build commands and Docker arguments per environment
- **Resource Names**: Define environment-specific AWS resource names (ECS, ALB, CloudWatch, etc.)
- **Monitoring**: Configure logging retention and monitoring settings
- **Security**: Set security policies and access controls per environment

### 3. GitHub Token Setup

AWS CDK needs a GitHub token to create webhooks for the repositories.

1. **Generate GitHub Token:**
   - Go to [GitHub Token Settings](https://github.com/settings/tokens)
   - Click "Generate new token"
   - Select the following permissions:
     - `admin:org_hook`
     - `admin:repo_hook`
     - `repo`

2. **Store Token in AWS Secrets Manager:**
   - Create a new secret in AWS Secrets Manager
   - Store the GitHub token as plaintext
   - Update the secret name in `config/application-config.ts` → `githubTokenSecretName`

### 4. Application Secrets Setup

The application supports loading environment-specific secrets from AWS Secrets Manager during deployment.

1. **Create Application Secret in AWS Secrets Manager:**
   - Navigate to AWS Secrets Manager in your target account
   - Create a new secret (choose "Other type of secret")
   - Add key-value pairs for your application secrets
   - Note the secret ARN after creation

2. **Configure Secret in Environment Config:**
   - Update the environment-specific config file (e.g., `config/service/beta-environment-config.ts`)
   - Set the `secretArn` to the ARN of your created secret
   - Add the required environment variable keys to the `environmentKeys` array

   ```typescript
   secretsConfig: {
       environmentKeys: [
           'API_KEY',
           'DATABASE_PASSWORD',
           'JWT_SECRET'
           // Add your required secret keys here
       ],
       secretName: 'application/beta/secrets',
       secretArn: 'arn:aws:secretsmanager:region:account:secret:application/beta/secrets-XXXXXX'
   }
   ```

3. **Secret Key Management:**
   - The keys listed in `environmentKeys` will be automatically loaded as environment variables
   - Ensure all keys exist in your AWS Secrets Manager secret
   - Keys are case-sensitive and must match exactly

### 5. Deploy the Application

1. **Install dependencies and build:**
   ```bash
   npm install
   npm run build
   ```

2. **Verify CDK setup:**
   ```bash
   npx cdk list
   ```

3. **Bootstrap the AWS account:**
   Make sure to configure your aws credentials (access key id / secret key ) using aws cli with `aws configure`
   
   ```bash
   npx cdk bootstrap
   ```

4. **Commit and push your changes:**
   ```bash
   git add .
   git commit -m "Configure CDK application for new account"
   git push
   ```

5. **Deploy the application:**
   ```bash
   npx cdk deploy
   ```

### 6. Monitor Deployment

Once deployment starts, you can monitor the pipeline progress in your AWS account:
- Navigate to [AWS CodePipeline Console](https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/application-name/view?region=us-east-1&stage=Build&tab=visualization)
- Replace the pipeline name and region as appropriate for your deployment

## Configuration Management

### Adding New Environments

1. **Add Account Configuration**: Update `config/account-config.ts` with new account IDs
2. **Define Environment Config**: Add environment-specific settings in `config/environment-configs.ts`
3. **Deploy**: The pipeline will automatically create stages for all configured environments

### Customizing Resource Sizing

Environment-specific resource configurations are defined in `config/environment-configs.ts`:

```typescript
ecsConfig: {
  cpu: 1024,                    // 1 vCPU
  memoryLimitMiB: 2048,        // 2 GB RAM
  desiredCount: 3,             // Number of tasks
  minCapacity: 2,              // Minimum tasks for auto-scaling
  maxCapacity: 15,             // Maximum tasks for auto-scaling
  targetCpuUtilization: 60,    // CPU target for scaling
  // ... additional settings
}
```

### Environment Variables

Each environment can have specific environment variables configured:

```typescript
environmentVariables: {
  NODE_ENV: 'production',
  LOG_LEVEL: 'info',
  DEPLOYMENT_ENV: 'gamma',
  // Add your application-specific variables
}
```

### Service Build Configuration

The application uses a centralized service build configuration in `application-config.ts`:

```typescript
serviceBuildConfig: {
    repositoryName: 'your-service-repo',
    sourceDirectory: 'your-service-repo',
    ecrRepositoryName: 'your-service-repo',
    dockerfilePath: 'Dockerfile',
    buildCommands: [
        'npm ci',
        'NODE_ENV=production npm run build'
    ],
    dockerBuildArgs: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1'
    }
}
```

**Build Overrides per Environment:**
Each environment can override build settings:

```typescript
buildOverrides: {
    dockerBuildArgs: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_ENV: 'beta'
    },
    buildCommands: [
        'npm ci',
        'NODE_ENV=production npm run build'
    ]
}
```

### Resource Names Configuration

Resource names are now defined per environment in the environment configuration:

```typescript
resourceNames: {
    ecrRepositoryName: 'my-app',
    clusterName: 'my-app-cluster',
    serviceName: 'my-app-service',
    taskDefinitionFamily: 'my-app-task-definition-family',
    albName: 'my-app-alb',
    targetGroupName: 'my-app-tg',
    logGroupName: '/aws/ecs/my-app',
    albSecurityGroupName: 'my-app-alb-sg',
    ecsSecurityGroupName: 'my-app-ecs-sg'
}
```

### Secrets Management

The application supports secure loading of sensitive environment variables from AWS Secrets Manager:

```typescript
secretsConfig: {
    environmentKeys: [
        'DATABASE_PASSWORD',
        'API_KEY',
        'JWT_SECRET'
    ],
    secretName: 'application/beta/secrets',
    secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:application/beta/secrets-XXXXXX'
}
```

**Setup Process:**
1. Create a secret in AWS Secrets Manager with key-value pairs
2. Copy the secret ARN and update it in your environment config
3. List all required keys in the `environmentKeys` array
4. Keys will be automatically loaded as environment variables during deployment

### Validation and Error Handling

The configuration system includes validation at multiple levels:
- **Compile-time**: TypeScript interfaces ensure type safety
- **Runtime**: Configuration validation functions check for required fields and valid values
- **Deployment-time**: AWS CDK validates resource configurations before deployment

## Troubleshooting

### Common Configuration Issues

1. **Invalid CPU/Memory Combinations**: Ensure CPU and memory values follow AWS Fargate requirements
2. **Missing Environment Configuration**: Verify all required environments are defined in `environment-configs.ts`
3. **Resource Naming Conflicts**: Check that application names don't conflict with existing resources
4. **Account Access**: Ensure the pipeline account has permissions to deploy to target accounts

### Configuration Validation

Run configuration validation before deployment:

```bash
npm run build
npx cdk synth
```

This will catch most configuration issues before attempting deployment.

## Useful Commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
* `npx cdk list`    list all stacks in the app

## Architecture Benefits

This configuration system provides:

- **Type Safety**: Full TypeScript support with compile-time validation
- **Environment Isolation**: Clear separation between development, staging, and production settings
- **Scalability**: Easy addition of new environments and regions
- **Maintainability**: Centralized configuration with clear inheritance patterns
- **Flexibility**: Environment-specific overrides without duplicating base configuration
- **Validation**: Multiple layers of validation to catch errors early
- **Resource Management**: Automated resource naming and organization
