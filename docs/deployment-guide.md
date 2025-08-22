# ECS Fargate Deployment Guide

This guide provides step-by-step instructions for deploying the Next.js users application using Amazon ECS Fargate through the AWS CDK pipeline.

## Prerequisites

Before deploying, ensure you have:

1. **AWS CLI configured** with appropriate credentials
2. **AWS CDK CLI installed** (`npm install -g aws-cdk`)
3. **Docker installed** and running
4. **Node.js 18+** installed
5. **GitHub Personal Access Token** stored in AWS Secrets Manager

## Deployment Process

### Step 1: Verify Configuration

Run the deployment test script to ensure everything is configured correctly:

```bash
./scripts/test-deployment.sh
```

This script validates:
- CDK project builds successfully
- Next.js application builds correctly
- Dockerfile is properly configured
- Health check endpoint exists
- Pipeline and deployment configurations are valid
- Security configurations are in place
- Auto-scaling is configured

### Step 2: Bootstrap CDK (First Time Only)

If this is your first time using CDK in this AWS account/region:

```bash
npx cdk bootstrap
```

### Step 3: Deploy the Pipeline

Deploy the main pipeline stack:

```bash
npx cdk deploy DevoWSPipeline
```

This will create:
- AWS CodePipeline with GitHub integration
- CodeBuild project for building and pushing Docker images
- All necessary IAM roles and permissions

### Step 4: Monitor Deployment

1. **AWS Console**: Go to AWS CodePipeline console to monitor the deployment
2. **Pipeline Stages**:
   - **Source**: Pulls code from GitHub repositories
   - **Build**: Builds CDK project and Docker image
   - **UpdatePipeline**: Updates the pipeline itself if needed
   - **Deploy**: Deploys the ECS infrastructure and application

### Step 5: Verify Deployment

Once deployment completes:

1. **Check ECS Service**: Go to ECS console and verify the service is running
2. **Get ALB URL**: Find the Application Load Balancer DNS name in EC2 console
3. **Test Application**: Access `http://<ALB-DNS-NAME>` in your browser
4. **Test Health Check**: Access `http://<ALB-DNS-NAME>/api/health`

## Pipeline Configuration

### Build Process

The pipeline performs the following build steps:

1. **Install Dependencies**: Installs CDK and Next.js dependencies
2. **Build Applications**: Builds both CDK project and Next.js application
3. **Docker Operations**:
   - Logs into ECR
   - Builds Docker image with multiple tags (timestamp, latest, git commit)
   - Pushes images to ECR repository
4. **CDK Synthesis**: Generates CloudFormation templates

### Deployment Configuration

The deployment includes:

- **Environment-Specific Settings**: Different configurations for beta/gamma/prod
- **Auto-Scaling**: CPU-based scaling with configurable thresholds
- **Security**: VPC with private subnets, security groups, IAM roles
- **Monitoring**: CloudWatch logs and metrics
- **Health Checks**: Application and load balancer health checks

### Post-Deployment Actions

After each deployment, the pipeline:

1. **Updates ECS Service**: Forces new deployment with latest Docker image
2. **Waits for Stability**: Ensures deployment completes successfully
3. **Provides Status**: Shows service status and load balancer URL

## Environment Configuration

### Beta Environment (Default)

- **CPU**: 512 units (0.5 vCPU)
- **Memory**: 1024 MB
- **Desired Count**: 2 tasks
- **Auto-Scaling**: 1-10 tasks based on 70% CPU utilization
- **Features**: Debug logging enabled, execute command enabled

### Production Environment

To deploy to production:

1. Update `pipeline-config.ts` to include production stage
2. Configure production-specific settings in `deployment-config.ts`
3. Deploy with production parameters

## Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check CodeBuild logs in AWS console
   - Verify Docker daemon is running in build environment
   - Check ECR permissions

2. **Deployment Failures**:
   - Check CloudFormation stack events
   - Verify IAM permissions
   - Check resource limits and quotas

3. **Application Issues**:
   - Check ECS task logs in CloudWatch
   - Verify health check endpoint responds correctly
   - Check security group rules

### Debugging Commands

```bash
# Check pipeline status
aws codepipeline get-pipeline-state --name DevoWSPipeline

# Check ECS service status
aws ecs describe-services --cluster nextjs-users-cluster-beta --services nextjs-users-service-beta

# Check task logs
aws logs tail /ecs/nextjs-users-beta --follow

# Check load balancer health
aws elbv2 describe-target-health --target-group-arn <TARGET-GROUP-ARN>
```

## Security Considerations

### Network Security

- **VPC**: Dedicated VPC with public and private subnets
- **Security Groups**: Least privilege access rules
- **NAT Gateway**: Secure outbound internet access for private subnets

### Container Security

- **Non-root User**: Container runs as non-root user (UID 1001)
- **Read-only Root**: Root filesystem is read-only where possible
- **Resource Limits**: CPU and memory limits enforced
- **Image Scanning**: ECR image scanning enabled

### Access Control

- **IAM Roles**: Separate execution and task roles with minimal permissions
- **Secrets Management**: GitHub token stored in AWS Secrets Manager
- **VPC Endpoints**: Private connectivity to AWS services

## Monitoring and Logging

### CloudWatch Integration

- **Container Logs**: Streamed to CloudWatch Logs
- **Metrics**: ECS service and task metrics
- **Alarms**: Auto-scaling based on CPU utilization

### Health Monitoring

- **ECS Health Checks**: Container-level health monitoring
- **ALB Health Checks**: Load balancer target health
- **Custom Metrics**: Application-specific metrics (optional)

## Cost Optimization

### Resource Sizing

- **Fargate**: Pay only for resources used
- **Auto-Scaling**: Scales down during low usage
- **ECR**: Lifecycle policies remove old images

### Development vs Production

- **Beta**: Smaller resources, shorter log retention
- **Production**: Optimized for performance and availability

## Next Steps

1. **Set up Monitoring**: Configure CloudWatch dashboards and alarms
2. **Enable HTTPS**: Add SSL certificate and HTTPS listener
3. **Custom Domain**: Configure Route 53 for custom domain
4. **CI/CD Enhancements**: Add automated testing stages
5. **Multi-Environment**: Set up gamma and production environments

## Support

For issues or questions:

1. Check AWS CloudFormation stack events
2. Review CodePipeline execution history
3. Check ECS service events and task logs
4. Consult AWS documentation for specific services