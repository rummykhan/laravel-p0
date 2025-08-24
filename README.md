# CDK Application Template

This is a CDK TypeScript project template for deploying applications with automated CI/CD pipelines using a comprehensive configuration system.

## Configuration Architecture

This project uses a layered configuration system that flows from the entry point through multiple stages to the final AWS resources:

### Configuration Flow Overview

```
bin/app.ts
    ↓ (imports applicationConfig)
config/application-config.ts
    ↓ (uses accounts, repositories, resource names)
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
- Defines base application settings (name, display name, ports, health checks)
- Configures repository information and build commands
- Sets Docker build arguments and ECR repository names
- Generates standardized resource names for all AWS resources
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
3. **Resource Naming**: Standardized resource names are generated using the application name and stage
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
- **Application Identity**: Set `applicationName` and `applicationDisplayName`
- **Container Settings**: Configure `containerPort` and `healthCheckPath`
- **Build Configuration**: Customize `buildCommands` and `dockerBuildArgs`
- **Resource Naming**: Resource names are auto-generated based on the application name

#### Environment Configuration (`config/environment-configs.ts`)
- **Resource Sizing**: Configure CPU, memory, and scaling parameters per environment
- **Environment Variables**: Set stage-specific environment variables
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

### 4. Deploy the Application

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
   Make sure to configure your aws credentials (access key id / secret key ) uisng aws cli with `aws configure`
   
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

### 5. Monitor Deployment

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
