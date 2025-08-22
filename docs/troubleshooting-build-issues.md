# Build Issues Troubleshooting Guide

This document provides solutions for common build issues encountered during the ECS Fargate deployment pipeline.

## Issue: "tsc: not found" Error

### Problem
```
sh: 1: tsc: not found
Command did not exit successfully npm run build exit status 127
```

### Root Cause
This error occurs when TypeScript (`tsc`) is not available during the build process. This typically happens when:

1. `NODE_ENV=production` is set, causing `npm ci` to skip dev dependencies
2. TypeScript is only listed in `devDependencies` but not in `dependencies`
3. The build environment doesn't have TypeScript globally installed

### Solution Applied
We fixed this by:

1. **Moved TypeScript to production dependencies**: Moved TypeScript from `devDependencies` to `dependencies` in package.json to ensure it's always available
2. **Simplified pipeline commands**: Removed complex debugging and fallback logic
3. **Ensured consistent environment**: TypeScript is now available regardless of NODE_ENV setting

### Code Changes Made

#### Before (Problematic):
```json
"devDependencies": {
  "@types/jest": "^29.5.14",
  "@types/node": "22.7.9",
  "jest": "^29.7.0",
  "ts-jest": "^29.2.5",
  "aws-cdk": "2.1016.1",
  "ts-node": "^10.9.2",
  "typescript": "~5.6.3"  // TypeScript in devDependencies
},
"dependencies": {
  "aws-cdk-lib": "2.196.0",
  "constructs": "^10.0.0"
}
```

#### After (Fixed):
```json
"devDependencies": {
  "@types/jest": "^29.5.14",
  "@types/node": "22.7.9",
  "jest": "^29.7.0",
  "ts-jest": "^29.2.5",
  "aws-cdk": "2.1016.1",
  "ts-node": "^10.9.2"
},
"dependencies": {
  "aws-cdk-lib": "2.196.0",
  "constructs": "^10.0.0",
  "typescript": "~5.6.3"  // TypeScript moved to dependencies
}
```

### Prevention
To prevent this issue in the future:

1. **Consider build tool dependencies carefully**: For CDK projects, TypeScript is essential for the build process and should be in `dependencies` if the build environment might skip dev dependencies
2. **Test with npm ci**: Always test your build process with `npm ci` which mimics the production environment
3. **Use consistent environments**: Ensure your local development environment matches the CI/CD environment

## Issue: Build Timeout

### Problem
Build process times out during Docker image building or dependency installation.

### Solutions
1. **Increase build timeout**: Update `buildConfig.buildTimeout` in `pipeline-config.ts`
2. **Enable build caching**: Set `buildConfig.enableBuildCache: true`
3. **Optimize Docker layers**: Use multi-stage builds and layer caching

## Issue: ECR Authentication Failures

### Problem
```
Error response from daemon: Get https://123456789.dkr.ecr.us-east-1.amazonaws.com/v2/: no basic auth credentials
```

### Solutions
1. **Check IAM permissions**: Ensure CodeBuild role has ECR permissions
2. **Verify region**: Make sure ECR region matches build region
3. **Check ECR repository exists**: The pipeline creates it automatically, but verify in console

## Issue: Docker Build Failures

### Problem
Docker build fails with various errors during image creation.

### Debugging Steps
1. **Check Dockerfile syntax**: Ensure Dockerfile is valid
2. **Verify base image**: Make sure the Node.js base image is accessible
3. **Check build context**: Ensure all required files are in the build context
4. **Review build logs**: Look for specific error messages in CodeBuild logs

### Common Docker Issues
- **COPY failed**: Files not found in build context
- **npm install failed**: Network issues or package.json problems
- **Port conflicts**: Ensure EXPOSE matches application port (3000)

## Issue: CDK Synthesis Failures

### Problem
CDK synthesis fails with TypeScript compilation errors or missing dependencies.

### Solutions
1. **Check TypeScript version**: Ensure compatible version in devDependencies
2. **Verify CDK version**: Match aws-cdk and aws-cdk-lib versions
3. **Clean build**: Run `npm run clean-build` to start fresh

## Issue: Next.js Build Failures

### Problem
Next.js application fails to build during the pipeline.

### Common Causes
1. **TypeScript errors**: Fix type errors in the application
2. **Missing dependencies**: Ensure all required packages are in package.json
3. **Environment variables**: Check if build-time env vars are needed

## Debugging Commands

Add these commands to your pipeline for better debugging:

```bash
# System information
'echo "Node version: $(node --version)"',
'echo "NPM version: $(npm --version)"',
'echo "Docker version: $(docker --version)"',

# Environment debugging
'echo "NODE_ENV: ${NODE_ENV:-not set}"',
'echo "Current directory: $(pwd)"',
'echo "Directory contents:"',
'ls -la',

# Dependency verification
'echo "Verifying TypeScript installation..."',
'npx tsc --version',
```

## Pipeline Configuration Best Practices

1. **Separate concerns**: Don't set global environment variables that affect all commands
2. **Use specific commands**: Apply environment variables only where needed
3. **Add debugging**: Include version checks and directory listings
4. **Handle errors gracefully**: Use proper error handling and timeouts
5. **Test locally first**: Always test changes locally before pushing

## Getting Help

If you encounter issues not covered here:

1. **Check CodeBuild logs**: Full logs are available in AWS CodeBuild console
2. **Review CloudFormation events**: Check for infrastructure deployment issues
3. **Test locally**: Reproduce the issue in your local environment
4. **Check AWS service status**: Verify AWS services are operational

## Monitoring and Alerts

Consider setting up:

1. **CloudWatch alarms**: For build failures and timeouts
2. **SNS notifications**: Get notified of pipeline failures
3. **Dashboard**: Monitor build metrics and success rates
4. **Log aggregation**: Centralize logs for easier troubleshooting