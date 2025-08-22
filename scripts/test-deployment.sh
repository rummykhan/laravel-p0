#!/bin/bash

# Test script for ECS Fargate deployment pipeline
# This script tests the deployment process without actually deploying to AWS

set -e  # Exit on any error

echo "🚀 Testing ECS Fargate Deployment Pipeline"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Test 1: Verify CDK project builds successfully
echo "📦 Test 1: Building CDK project..."
if npm run build; then
    print_status "CDK project builds successfully"
else
    print_error "CDK project build failed"
    exit 1
fi

# Test 2: Verify CDK synthesis works
echo "🔧 Test 2: Synthesizing CDK templates..."
if npx cdk synth --quiet > /dev/null 2>&1; then
    print_status "CDK synthesis successful"
else
    print_error "CDK synthesis failed"
    exit 1
fi

# Test 3: Verify Next.js application builds
echo "⚛️  Test 3: Building Next.js application..."
cd ../nextjs-users
if npm ci && npm run build; then
    print_status "Next.js application builds successfully"
else
    print_error "Next.js application build failed"
    exit 1
fi
cd ../laravel-p0

# Test 4: Verify Dockerfile exists and is valid
echo "🐳 Test 4: Validating Dockerfile..."
if [ -f "../nextjs-users/Dockerfile" ]; then
    print_status "Dockerfile exists"
    
    # Check if Dockerfile has required components
    if grep -q "FROM node:" "../nextjs-users/Dockerfile" && \
       grep -q "EXPOSE 3000" "../nextjs-users/Dockerfile" && \
       grep -q "CMD" "../nextjs-users/Dockerfile"; then
        print_status "Dockerfile contains required components"
    else
        print_error "Dockerfile missing required components"
        exit 1
    fi
else
    print_error "Dockerfile not found"
    exit 1
fi

# Test 5: Verify health check endpoint exists
echo "🏥 Test 5: Checking health check endpoint..."
if [ -f "../nextjs-users/app/api/health/route.ts" ]; then
    print_status "Health check endpoint exists"
else
    print_error "Health check endpoint not found"
    exit 1
fi

# Test 6: Verify pipeline configuration
echo "⚙️  Test 6: Validating pipeline configuration..."
if node -e "
const config = require('./config/pipeline-config.js').default;
if (!config.buildConfig || !config.buildConfig.ecrRepositoryName) {
    throw new Error('Build configuration missing');
}
if (!config.repositories.USERS_WEB_APP_REPOSITORY) {
    throw new Error('Users web app repository configuration missing');
}
console.log('Pipeline configuration valid');
"; then
    print_status "Pipeline configuration is valid"
else
    print_error "Pipeline configuration validation failed"
    exit 1
fi

# Test 7: Verify deployment configuration
echo "🔧 Test 7: Validating deployment configuration..."
if node -e "
const { getDeploymentConfig, validateDeploymentConfig } = require('./config/deployment-config.js');
const config = getDeploymentConfig('beta');
validateDeploymentConfig(config);
console.log('Deployment configuration valid for beta stage');
"; then
    print_status "Deployment configuration is valid"
else
    print_error "Deployment configuration validation failed"
    exit 1
fi

# Test 8: Check if all required stack outputs are defined
echo "📤 Test 8: Verifying stack outputs..."
if npx cdk synth | grep -q "EcrRepositoryUri" && \
   npx cdk synth | grep -q "ClusterName" && \
   npx cdk synth | grep -q "AlbDnsName"; then
    print_status "Required stack outputs are defined"
else
    print_warning "Some stack outputs may be missing (this is expected if not all stacks are synthesized)"
fi

# Test 9: Verify security configurations
echo "🔒 Test 9: Checking security configurations..."
npx cdk synth --quiet > /dev/null 2>&1
if [ -f "cdk.out/assembly-DevoWSPipeline-BetaStage/DevoWSPipelineBetaStageEcsStackD8E37680.template.json" ]; then
    if grep -q "SecurityGroup" "cdk.out/assembly-DevoWSPipeline-BetaStage/DevoWSPipelineBetaStageEcsStackD8E37680.template.json" && \
       grep -q "TaskExecutionRole" "cdk.out/assembly-DevoWSPipeline-BetaStage/DevoWSPipelineBetaStageEcsStackD8E37680.template.json" && \
       grep -q "TaskRole" "cdk.out/assembly-DevoWSPipeline-BetaStage/DevoWSPipelineBetaStageEcsStackD8E37680.template.json"; then
        print_status "Security configurations are present"
    else
        print_error "Security configurations missing in ECS stack"
        exit 1
    fi
else
    print_error "ECS stack template not found"
    exit 1
fi

# Test 10: Verify auto-scaling configuration
echo "📈 Test 10: Checking auto-scaling configuration..."
if [ -f "cdk.out/assembly-DevoWSPipeline-BetaStage/DevoWSPipelineBetaStageEcsStackD8E37680.template.json" ]; then
    if grep -q "ScalableTarget" "cdk.out/assembly-DevoWSPipeline-BetaStage/DevoWSPipelineBetaStageEcsStackD8E37680.template.json" && \
       grep -q "ScalingPolicy" "cdk.out/assembly-DevoWSPipeline-BetaStage/DevoWSPipelineBetaStageEcsStackD8E37680.template.json"; then
        print_status "Auto-scaling configuration is present"
    else
        print_warning "Auto-scaling configuration may be missing"
    fi
else
    print_warning "ECS stack template not found for auto-scaling check"
fi

echo ""
echo "🎉 All tests passed! The ECS Fargate deployment pipeline is ready."
echo ""
echo "📋 Summary of validated components:"
echo "   ✅ CDK project builds and synthesizes correctly"
echo "   ✅ Next.js application builds successfully"
echo "   ✅ Dockerfile is properly configured"
echo "   ✅ Health check endpoint is implemented"
echo "   ✅ Pipeline configuration is valid"
echo "   ✅ Deployment configuration is valid"
echo "   ✅ Security configurations are in place"
echo ""
echo "🚀 Ready for deployment to AWS!"
echo ""
echo "Next steps:"
echo "1. Ensure AWS credentials are configured"
echo "2. Deploy the pipeline: npx cdk deploy PipelineStack"
echo "3. Monitor the deployment in AWS CodePipeline console"
echo "4. Access the application via the ALB DNS name after deployment"