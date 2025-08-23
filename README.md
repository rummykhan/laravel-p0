# CDK Application Template

This is a CDK TypeScript project template for deploying applications with automated CI/CD pipelines.

## Setup for New Account

### 1. First Time Setup

1. **Clone the repository:**
   ```bash
   git clone git@github.com:clickpattern-dev/cdk-template.git
   cd cdk-template
   ```

2. **Update configuration files:**

   - **Update `config/packages.ts`**: Add your GitHub repositories
   - **Update `config/account-config.ts`**: Add your AWS accounts and regions
   - **Update `tsconfig.json`**: Add your service repository name to the exclude list
   - **Update `config/application-config.ts`**: Configure application-specific attributes
   - **Update `config/environment-configs.ts`**: Set environment-specific configurations

### 2. GitHub Token Setup

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

### 3. Deploy the Application

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

### 4. Monitor Deployment

Once deployment starts, you can monitor the pipeline progress in your AWS account:
- Navigate to [AWS CodePipeline Console](https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/application-name/view?region=us-east-1&stage=Build&tab=visualization)
- Replace the pipeline name and region as appropriate for your deployment

## Useful Commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
* `npx cdk list`    list all stacks in the app
