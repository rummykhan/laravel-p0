import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { getDeploymentConfig, validateDeploymentConfig } from '../../config/deployment-config';

// Environment-specific configuration interface
export interface EcsEnvironmentConfig {
    // Resource sizing
    cpu: number;
    memoryLimitMiB: number;
    memoryReservationMiB: number;

    // Service configuration
    desiredCount: number;
    minCapacity: number;
    maxCapacity: number;

    // Auto-scaling configuration
    targetCpuUtilization: number;
    scaleInCooldown: cdk.Duration;
    scaleOutCooldown: cdk.Duration;

    // Deployment configuration
    maxHealthyPercent: number;
    minHealthyPercent: number;
    healthCheckGracePeriod: cdk.Duration;

    // Circuit breaker configuration
    circuitBreakerEnabled: boolean;
    circuitBreakerRollback: boolean;

    // Environment variables
    environmentVariables: { [key: string]: string };

    // Logging configuration
    logRetention: logs.RetentionDays;

    // Security configuration
    enableExecuteCommand: boolean;
}

export interface EcsStackProps extends cdk.StackProps {
    environmentConfig?: EcsEnvironmentConfig;
    stage?: string;
}

// Default environment configurations
function getDefaultEnvironmentConfig(stage: string = 'beta'): EcsEnvironmentConfig {
    const baseConfig: EcsEnvironmentConfig = {
        // Base configuration for development/beta
        cpu: 512, // 0.5 vCPU
        memoryLimitMiB: 1024, // 1 GB
        memoryReservationMiB: 512, // 512 MB soft limit
        desiredCount: 2,
        minCapacity: 1,
        maxCapacity: 10,
        targetCpuUtilization: 70,
        scaleInCooldown: cdk.Duration.seconds(300),
        scaleOutCooldown: cdk.Duration.seconds(300),
        maxHealthyPercent: 200,
        minHealthyPercent: 50,
        healthCheckGracePeriod: cdk.Duration.seconds(60),
        circuitBreakerEnabled: true,
        circuitBreakerRollback: true,
        environmentVariables: {
            NODE_ENV: 'production',
            PORT: '3000',
            SECURITY_HEADERS_ENABLED: 'true',
            NEXT_TELEMETRY_DISABLED: '1',
        },
        logRetention: logs.RetentionDays.TWO_WEEKS,
        enableExecuteCommand: false,
    };

    // Environment-specific overrides
    switch (stage.toLowerCase()) {
        case 'prod':
        case 'production':
            return {
                ...baseConfig,
                // Production configuration - higher resources and stricter settings
                cpu: 1024, // 1 vCPU
                memoryLimitMiB: 2048, // 2 GB
                memoryReservationMiB: 1024, // 1 GB soft limit
                desiredCount: 3, // Higher availability
                minCapacity: 2, // Always keep at least 2 tasks
                maxCapacity: 20, // Allow more scaling
                targetCpuUtilization: 60, // Lower threshold for better performance
                scaleInCooldown: cdk.Duration.seconds(600), // Longer cooldown for stability
                scaleOutCooldown: cdk.Duration.seconds(180), // Faster scale-out
                maxHealthyPercent: 150, // More conservative deployment
                minHealthyPercent: 75, // Keep more tasks running during deployment
                healthCheckGracePeriod: cdk.Duration.seconds(120), // More time for startup
                environmentVariables: {
                    ...baseConfig.environmentVariables,
                    NODE_ENV: 'production',
                    // Production-specific environment variables
                    ENABLE_PERFORMANCE_MONITORING: 'true',
                    LOG_LEVEL: 'warn',
                },
                logRetention: logs.RetentionDays.ONE_MONTH, // Longer retention for production
                enableExecuteCommand: false, // Disabled for security
            };

        case 'gamma':
        case 'staging':
            return {
                ...baseConfig,
                // Gamma/staging configuration - similar to production but with some relaxed settings
                cpu: 1024, // 1 vCPU
                memoryLimitMiB: 1536, // 1.5 GB
                memoryReservationMiB: 768, // 768 MB soft limit
                desiredCount: 2,
                minCapacity: 1,
                maxCapacity: 15,
                targetCpuUtilization: 65,
                environmentVariables: {
                    ...baseConfig.environmentVariables,
                    NODE_ENV: 'staging',
                    LOG_LEVEL: 'info',
                },
                logRetention: logs.RetentionDays.ONE_MONTH, // Closest available option
                enableExecuteCommand: true, // Enabled for debugging
            };

        case 'beta':
        case 'development':
        case 'dev':
        default:
            return {
                ...baseConfig,
                // Beta/development configuration - optimized for cost and debugging
                environmentVariables: {
                    ...baseConfig.environmentVariables,
                    NODE_ENV: 'development',
                    LOG_LEVEL: 'debug',
                    // Development-specific environment variables
                    ENABLE_DEBUG_LOGGING: 'true',
                },
                enableExecuteCommand: true, // Enabled for debugging
            };
    }
}

export class EcsStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;
    public readonly cluster: ecs.Cluster;
    public readonly albSecurityGroup: ec2.SecurityGroup;
    public readonly ecsSecurityGroup: ec2.SecurityGroup;
    public readonly ecrRepository: ecr.IRepository;
    public readonly applicationLoadBalancer: elbv2.ApplicationLoadBalancer;
    public readonly targetGroup: elbv2.ApplicationTargetGroup;
    public readonly taskDefinition: ecs.FargateTaskDefinition;
    public readonly taskExecutionRole: iam.Role;
    public readonly taskRole: iam.Role;
    public readonly ecsService: ecs.FargateService;
    public readonly scalableTarget: ecs.ScalableTaskCount;

    constructor(scope: Construct, id: string, props?: EcsStackProps) {
        super(scope, id, props);

        // Get environment configuration
        const stage = props?.stage || 'beta';
        const deploymentConfig = getDeploymentConfig(stage);
        const envConfig = props?.environmentConfig || deploymentConfig.ecsConfig;

        // Validate the deployment configuration
        validateDeploymentConfig(deploymentConfig);

        // Create VPC with enhanced security configuration
        this.vpc = new ec2.Vpc(this, 'EcsVpc', {
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
            maxAzs: 2, // Use 2 availability zones for high availability
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, // NAT Gateway for secure outbound access
                },
            ],
            // Enable DNS hostnames and resolution for proper service discovery
            enableDnsHostnames: true,
            enableDnsSupport: true,
            // Configure NAT Gateway for enhanced security and cost optimization
            natGateways: 1, // Use single NAT Gateway for cost optimization (can be increased for production)
            // Enable VPC Flow Logs for security monitoring
            flowLogs: {
                'VpcFlowLogs': {
                    destination: ec2.FlowLogDestination.toCloudWatchLogs(
                        new logs.LogGroup(this, 'VpcFlowLogsGroup', {
                            logGroupName: '/aws/vpc/flowlogs',
                            retention: logs.RetentionDays.ONE_WEEK,
                            removalPolicy: cdk.RemovalPolicy.DESTROY,
                        })
                    ),
                    trafficType: ec2.FlowLogTrafficType.ALL, // Log all traffic for security analysis
                },
            },
        });

        // Create ECS Cluster with environment-specific configuration
        this.cluster = new ecs.Cluster(this, 'EcsCluster', {
            vpc: this.vpc,
            clusterName: `nextjs-users-cluster-${stage}`,
            // Enable CloudWatch Container Insights based on deployment configuration
            containerInsightsV2: deploymentConfig.enableContainerInsights ?
                ecs.ContainerInsights.ENABLED :
                ecs.ContainerInsights.DISABLED,
        });

        // Reference existing ECR repository created during synth step
        this.ecrRepository = ecr.Repository.fromRepositoryName(this, 'NextjsUsersRepository', 'nextjs-users');

        // Note: ECR repository is created and managed during the synth step
        // CodeBuild permissions are handled by the pipeline's synthCodeBuildDefaults

        // Create security group for Application Load Balancer with least privilege access
        this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for Application Load Balancer - least privilege access',
            allowAllOutbound: false, // Explicitly define all egress rules for security
        });

        // Allow inbound HTTP traffic from internet to ALB (port 80)
        this.albSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(80),
            'Allow HTTP traffic from internet to ALB'
        );

        // Allow inbound HTTPS traffic from internet to ALB (port 443) for future HTTPS support
        this.albSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(443),
            'Allow HTTPS traffic from internet to ALB (future use)'
        );

        // Create security group for ECS tasks with strict least privilege access
        this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for ECS tasks - least privilege access',
            allowAllOutbound: false, // Explicitly define all egress rules for security
        });

        // Allow inbound traffic from ALB to ECS tasks on port 3000 ONLY
        this.ecsSecurityGroup.addIngressRule(
            this.albSecurityGroup,
            ec2.Port.tcp(3000),
            'Allow traffic from ALB to ECS tasks on port 3000 only'
        );

        // Allow outbound HTTPS traffic for ECS tasks to AWS services (ECR, CloudWatch, etc.)
        // Restrict to AWS IP ranges for better security
        this.ecsSecurityGroup.addEgressRule(
            ec2.Peer.anyIpv4(), // Note: AWS services require internet access, could be restricted to AWS IP ranges
            ec2.Port.tcp(443),
            'Allow HTTPS outbound for AWS services (ECR, CloudWatch, ECS APIs)'
        );

        // Allow outbound HTTP traffic for ECS tasks (package downloads during container startup)
        // This is needed for npm/yarn package installations if not using multi-stage builds
        this.ecsSecurityGroup.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(80),
            'Allow HTTP outbound for package downloads (if needed)'
        );

        // Allow outbound DNS resolution (UDP 53) for ECS tasks
        this.ecsSecurityGroup.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.udp(53),
            'Allow DNS resolution for ECS tasks'
        );

        // Allow outbound DNS resolution (TCP 53) for ECS tasks (some DNS queries use TCP)
        this.ecsSecurityGroup.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(53),
            'Allow DNS resolution (TCP) for ECS tasks'
        );

        // Allow outbound traffic from ALB to ECS tasks on port 3000 ONLY
        this.albSecurityGroup.addEgressRule(
            this.ecsSecurityGroup,
            ec2.Port.tcp(3000),
            'Allow traffic from ALB to ECS tasks on port 3000 only'
        );

        // Create VPC endpoints for enhanced security (simplified configuration)
        // ECR API VPC Endpoint
        const ecrApiEndpoint = new ec2.InterfaceVpcEndpoint(this, 'EcrApiEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            privateDnsEnabled: true,
        });

        // ECR DKR VPC Endpoint (for Docker registry operations)
        const ecrDkrEndpoint = new ec2.InterfaceVpcEndpoint(this, 'EcrDkrEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            privateDnsEnabled: true,
        });

        // CloudWatch Logs VPC Endpoint
        const cloudWatchLogsEndpoint = new ec2.InterfaceVpcEndpoint(this, 'CloudWatchLogsEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            privateDnsEnabled: true,
        });

        // S3 Gateway VPC Endpoint (for ECR layer storage)
        const s3GatewayEndpoint = new ec2.GatewayVpcEndpoint(this, 'S3GatewayEndpoint', {
            vpc: this.vpc,
            service: ec2.GatewayVpcEndpointAwsService.S3,
            subnets: [
                {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
        });

        // Create Application Load Balancer in public subnets
        this.applicationLoadBalancer = new elbv2.ApplicationLoadBalancer(this, 'NextjsUsersAlb', {
            vpc: this.vpc,
            internetFacing: true, // Internet-facing ALB for public access
            loadBalancerName: 'nextjs-users-alb',
            securityGroup: this.albSecurityGroup,
            // Place ALB in public subnets across multiple AZs
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
            // Enable deletion protection in production (disabled for development)
            deletionProtection: false,
        });

        // Create target group for ECS tasks on port 3000
        this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'NextjsUsersTargetGroup', {
            vpc: this.vpc,
            port: 3000,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP, // Required for Fargate tasks
            targetGroupName: 'nextjs-users-tg',
            // Health check configuration for target group - aligned with container health check
            healthCheck: {
                enabled: true,
                path: '/api/health', // Health check endpoint path
                port: '3000',
                protocol: elbv2.Protocol.HTTP,
                healthyHttpCodes: '200', // Consider 200 as healthy
                interval: cdk.Duration.seconds(30), // Check every 30 seconds
                timeout: cdk.Duration.seconds(15), // Increased timeout for Next.js startup
                healthyThresholdCount: 2, // 2 consecutive successful checks = healthy
                unhealthyThresholdCount: 3, // 3 consecutive failed checks = unhealthy
            },
            // Deregistration delay for graceful shutdown
            deregistrationDelay: cdk.Duration.seconds(30),
        });

        // Configure HTTP listener on port 80
        this.applicationLoadBalancer.addListener('HttpListener', {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            // Default action: forward traffic to target group
            defaultAction: elbv2.ListenerAction.forward([this.targetGroup]),
        });

        // Create CloudWatch log groups for ECS tasks with environment-specific retention
        const logGroup = new logs.LogGroup(this, 'NextjsUsersLogGroup', {
            logGroupName: `/ecs/nextjs-users-${stage}`,
            retention: envConfig.logRetention,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Remove log group when stack is deleted
        });

        // Create separate log group for ALB access logs (optional, for future use)
        const albLogGroup = new logs.LogGroup(this, 'NextjsUsersAlbLogGroup', {
            logGroupName: '/aws/applicationloadbalancer/nextjs-users',
            retention: logs.RetentionDays.ONE_WEEK, // ALB logs can have shorter retention
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create log group for ECS service events and deployment logs
        const ecsServiceLogGroup = new logs.LogGroup(this, 'NextjsUsersServiceLogGroup', {
            logGroupName: '/aws/ecs/service/nextjs-users',
            retention: logs.RetentionDays.ONE_MONTH, // Service events kept longer for troubleshooting
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create task execution role for ECS tasks with enhanced security
        // This role is used by ECS to pull images and write logs
        this.taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            description: 'Role for ECS task execution (pulling images, writing logs)',
            managedPolicies: [
                // Standard ECS task execution role policy
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
            ],
            // Add inline policy for specific ECR and CloudWatch permissions with least privilege
            inlinePolicies: {
                'TaskExecutionPolicy': new iam.PolicyDocument({
                    statements: [
                        // ECR permissions for pulling images from the nextjs-users repository
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'ecr:BatchCheckLayerAvailability',
                                'ecr:GetDownloadUrlForLayer',
                                'ecr:BatchGetImage',
                            ],
                            resources: [`arn:aws:ecr:${this.region}:${this.account}:repository/nextjs-users`],
                        }),
                        // ECR authorization token (required for all ECR operations)
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ecr:GetAuthorizationToken'],
                            resources: ['*'], // This action doesn't support resource-level permissions
                        }),
                        // CloudWatch Logs permissions for this specific log group
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                            ],
                            resources: [
                                logGroup.logGroupArn,
                                `${logGroup.logGroupArn}:*`, // Include log streams
                            ],
                        }),
                    ],
                }),
            },
        });

        // Create task role for application-specific AWS access with minimal permissions
        // This role is used by the application running inside the container
        this.taskRole = new iam.Role(this, 'TaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            description: 'Role for application-specific AWS access within ECS tasks',
            // Start with minimal permissions - add specific policies as needed for application functionality
            inlinePolicies: {
                'ApplicationPolicy': new iam.PolicyDocument({
                    statements: [
                        // Allow the application to describe its own task (useful for health checks and metadata)
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'ecs:DescribeTasks',
                            ],
                            resources: ['*'], // Task ARNs are dynamic, so we need wildcard
                            conditions: {
                                'StringEquals': {
                                    'ecs:cluster': this.cluster.clusterArn,
                                },
                            },
                        }),
                        // Allow application to write custom CloudWatch metrics (optional)
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'cloudwatch:PutMetricData',
                            ],
                            resources: ['*'], // CloudWatch metrics don't support resource-level permissions
                            conditions: {
                                'StringEquals': {
                                    'cloudwatch:namespace': 'NextJS/Users', // Restrict to specific namespace
                                },
                            },
                        }),
                    ],
                }),
            },
        });

        // Create Fargate task definition with environment-specific CPU and memory specifications
        this.taskDefinition = new ecs.FargateTaskDefinition(this, 'NextjsUsersTaskDefinition', {
            family: `nextjs-users-${stage}`,
            // CPU units (1024 = 1 vCPU) - environment-specific
            cpu: envConfig.cpu,
            // Memory in MB - environment-specific
            memoryLimitMiB: envConfig.memoryLimitMiB,
            // IAM roles
            executionRole: this.taskExecutionRole,
            taskRole: this.taskRole,
        });

        // Add container definition to task definition with environment-specific configuration
        const container = this.taskDefinition.addContainer('nextjs-users-container', {
            // Container name
            containerName: `nextjs-users-${stage}`,
            // ECR image reference - will be updated by pipeline with specific tags
            image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository, 'latest'),
            // Port mappings - only expose necessary ports
            portMappings: [
                {
                    containerPort: 3000,
                    protocol: ecs.Protocol.TCP,
                    name: 'http',
                    appProtocol: ecs.AppProtocol.http, // Specify application protocol for better routing
                },
            ],
            // CloudWatch logging configuration with enhanced security
            logging: ecs.LogDrivers.awsLogs({
                logGroup: logGroup,
                streamPrefix: `nextjs-users-${stage}`,
            }),
            // Environment variables for Next.js application - environment-specific
            environment: {
                ...envConfig.environmentVariables,
                // Add stage-specific environment variable
                DEPLOYMENT_STAGE: stage.toUpperCase(),
                // Add timestamp for deployment tracking
                DEPLOYMENT_TIMESTAMP: new Date().toISOString(),
            },
            // Health check configuration - temporarily disabled to rely on ALB health check only
            // healthCheck: {
            //     command: [
            //         'CMD-SHELL',
            //         'curl -f --connect-timeout 3 --max-time 5 http://127.0.0.1:3000/api/health || exit 1'
            //     ],
            //     interval: cdk.Duration.seconds(30),
            //     timeout: cdk.Duration.seconds(15),
            //     retries: 3,
            //     startPeriod: cdk.Duration.seconds(180),
            // },
            // Essential container - if this fails, the task stops
            essential: true,
            // Security configurations
            readonlyRootFilesystem: false, // Next.js needs write access for temp files, set to true if possible
            // Run container as non-root user for security (requires Dockerfile configuration)
            user: '1001', // Non-root user ID (must match Dockerfile USER directive)
            // Memory and CPU limits for security - environment-specific
            memoryLimitMiB: envConfig.memoryLimitMiB, // Hard limit to prevent memory exhaustion
            memoryReservationMiB: envConfig.memoryReservationMiB, // Soft limit for better resource allocation
            // Disable privileged mode for security
            privileged: false,
            // Linux parameters for enhanced security
            linuxParameters: new ecs.LinuxParameters(this, 'LinuxParameters', {
                // Initialize process to handle signals properly
                initProcessEnabled: true,
                // Note: sharedMemorySize is not supported for Fargate tasks
            }),
        });

        // Add stack outputs for cross-stack references
        new cdk.CfnOutput(this, 'VpcId', {
            value: this.vpc.vpcId,
            description: 'VPC ID for ECS deployment',
            exportName: `${this.stackName}-VpcId`,
        });

        new cdk.CfnOutput(this, 'PublicSubnetIds', {
            value: this.vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
            description: 'Public Subnet IDs for ALB deployment',
            exportName: `${this.stackName}-PublicSubnetIds`,
        });

        new cdk.CfnOutput(this, 'PrivateSubnetIds', {
            value: this.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
            description: 'Private Subnet IDs for ECS tasks',
            exportName: `${this.stackName}-PrivateSubnetIds`,
        });

        new cdk.CfnOutput(this, 'ClusterArn', {
            value: this.cluster.clusterArn,
            description: 'ECS Cluster ARN',
            exportName: `${this.stackName}-ClusterArn`,
        });

        new cdk.CfnOutput(this, 'ClusterName', {
            value: this.cluster.clusterName,
            description: 'ECS Cluster Name',
            exportName: `${this.stackName}-ClusterName`,
        });

        new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
            value: this.albSecurityGroup.securityGroupId,
            description: 'ALB Security Group ID',
            exportName: `${this.stackName}-AlbSecurityGroupId`,
        });

        new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
            value: this.ecsSecurityGroup.securityGroupId,
            description: 'ECS Security Group ID',
            exportName: `${this.stackName}-EcsSecurityGroupId`,
        });

        new cdk.CfnOutput(this, 'EcrRepositoryUri', {
            value: `${this.account}.dkr.ecr.${this.region}.amazonaws.com/nextjs-users`,
            description: 'ECR Repository URI for container images',
            exportName: `${this.stackName}-EcrRepositoryUri`,
        });

        new cdk.CfnOutput(this, 'EcrRepositoryName', {
            value: 'nextjs-users',
            description: 'ECR Repository Name',
            exportName: `${this.stackName}-EcrRepositoryName`,
        });

        new cdk.CfnOutput(this, 'AlbDnsName', {
            value: this.applicationLoadBalancer.loadBalancerDnsName,
            description: 'Application Load Balancer DNS Name',
            exportName: `${this.stackName}-AlbDnsName`,
        });

        new cdk.CfnOutput(this, 'AlbArn', {
            value: this.applicationLoadBalancer.loadBalancerArn,
            description: 'Application Load Balancer ARN',
            exportName: `${this.stackName}-AlbArn`,
        });

        new cdk.CfnOutput(this, 'TargetGroupArn', {
            value: this.targetGroup.targetGroupArn,
            description: 'Target Group ARN for ECS service integration',
            exportName: `${this.stackName}-TargetGroupArn`,
        });

        new cdk.CfnOutput(this, 'TaskDefinitionArn', {
            value: this.taskDefinition.taskDefinitionArn,
            description: 'ECS Task Definition ARN',
            exportName: `${this.stackName}-TaskDefinitionArn`,
        });

        new cdk.CfnOutput(this, 'TaskExecutionRoleArn', {
            value: this.taskExecutionRole.roleArn,
            description: 'ECS Task Execution Role ARN',
            exportName: `${this.stackName}-TaskExecutionRoleArn`,
        });

        new cdk.CfnOutput(this, 'TaskRoleArn', {
            value: this.taskRole.roleArn,
            description: 'ECS Task Role ARN',
            exportName: `${this.stackName}-TaskRoleArn`,
        });

        // Security-related outputs
        new cdk.CfnOutput(this, 'EcrApiEndpointId', {
            value: ecrApiEndpoint.vpcEndpointId,
            description: 'ECR API VPC Endpoint ID',
            exportName: `${this.stackName}-EcrApiEndpointId`,
        });

        new cdk.CfnOutput(this, 'CloudWatchLogsEndpointId', {
            value: cloudWatchLogsEndpoint.vpcEndpointId,
            description: 'CloudWatch Logs VPC Endpoint ID',
            exportName: `${this.stackName}-CloudWatchLogsEndpointId`,
        });

        new cdk.CfnOutput(this, 'S3GatewayEndpointId', {
            value: s3GatewayEndpoint.vpcEndpointId,
            description: 'S3 Gateway VPC Endpoint ID',
            exportName: `${this.stackName}-S3GatewayEndpointId`,
        });

        // Create ECS service with environment-specific deployment configuration
        this.ecsService = new ecs.FargateService(this, 'NextjsUsersService', {
            cluster: this.cluster,
            taskDefinition: this.taskDefinition,
            serviceName: `nextjs-users-service-${stage}`,
            // Environment-specific desired count for high availability
            desiredCount: envConfig.desiredCount,
            // Configure service to use private subnets for security
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            // Use ECS security group with least privilege access
            securityGroups: [this.ecsSecurityGroup],
            // Assign public IP is disabled for security (tasks in private subnets)
            assignPublicIp: false,
            // Configure deployment settings for zero-downtime updates - environment-specific
            maxHealthyPercent: envConfig.maxHealthyPercent,
            minHealthyPercent: envConfig.minHealthyPercent,
            // Enable deployment circuit breaker for automatic rollback on failure - environment-specific
            circuitBreaker: {
                enable: envConfig.circuitBreakerEnabled,
                rollback: envConfig.circuitBreakerRollback,
            },
            // Health check grace period - environment-specific
            healthCheckGracePeriod: envConfig.healthCheckGracePeriod,
            // Use latest Fargate platform version for security patches
            platformVersion: ecs.FargatePlatformVersion.LATEST,
            // Service discovery can be added later if needed for internal communication
            // Enable execute command for secure debugging - environment-specific
            enableExecuteCommand: envConfig.enableExecuteCommand,

            // Additional deployment settings for zero-downtime updates
            propagateTags: ecs.PropagatedTagSource.SERVICE, // Propagate tags to tasks
        });

        // Network ACLs provide additional security layer at subnet level
        // Using default VPC Network ACL which allows all traffic
        // Custom Network ACLs can be configured later if stricter controls are needed

        // Integrate service with ALB target group
        this.ecsService.attachToApplicationTargetGroup(this.targetGroup);

        // Add environment-specific auto-scaling configuration
        // Create Application Auto Scaling target for ECS service with environment-specific capacity
        this.scalableTarget = this.ecsService.autoScaleTaskCount({
            minCapacity: envConfig.minCapacity, // Environment-specific minimum number of tasks
            maxCapacity: envConfig.maxCapacity, // Environment-specific maximum number of tasks
        });

        // Configure CPU-based scaling policy with environment-specific settings
        this.scalableTarget.scaleOnCpuUtilization('CpuScalingPolicy', {
            targetUtilizationPercent: envConfig.targetCpuUtilization, // Environment-specific target CPU utilization
            scaleInCooldown: envConfig.scaleInCooldown, // Environment-specific cooldown for scale-in
            scaleOutCooldown: envConfig.scaleOutCooldown, // Environment-specific cooldown for scale-out
            policyName: `nextjs-users-cpu-scaling-policy-${stage}`,
        });

        // Add memory-based scaling policy for better resource management
        this.scalableTarget.scaleOnMemoryUtilization('MemoryScalingPolicy', {
            targetUtilizationPercent: envConfig.targetCpuUtilization + 10, // Slightly higher threshold for memory
            scaleInCooldown: envConfig.scaleInCooldown,
            scaleOutCooldown: envConfig.scaleOutCooldown,
            policyName: `nextjs-users-memory-scaling-policy-${stage}`,
        });

        // Add CloudWatch alarms for scaling triggers with environment-specific configuration
        if (deploymentConfig.enableDetailedMonitoring) {
            // High CPU utilization alarm
            const highCpuAlarm = new cloudwatch.Alarm(this, 'HighCpuAlarm', {
                alarmName: `nextjs-users-high-cpu-${stage}`,
                alarmDescription: `Alarm when CPU utilization is high for ${stage} environment`,
                metric: this.ecsService.metricCpuUtilization({
                    period: cdk.Duration.minutes(5),
                    statistic: cloudwatch.Stats.AVERAGE,
                }),
                threshold: envConfig.targetCpuUtilization + 20, // Trigger 20% above target
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });

            // High memory utilization alarm
            const highMemoryAlarm = new cloudwatch.Alarm(this, 'HighMemoryAlarm', {
                alarmName: `nextjs-users-high-memory-${stage}`,
                alarmDescription: `Alarm when memory utilization is high for ${stage} environment`,
                metric: this.ecsService.metricMemoryUtilization({
                    period: cdk.Duration.minutes(5),
                    statistic: cloudwatch.Stats.AVERAGE,
                }),
                threshold: 85, // Trigger when memory > 85%
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });

            // Service task count alarm (for availability monitoring)
            const lowTaskCountAlarm = new cloudwatch.Alarm(this, 'LowTaskCountAlarm', {
                alarmName: `nextjs-users-low-task-count-${stage}`,
                alarmDescription: `Alarm when running task count is below minimum for ${stage} environment`,
                metric: new cloudwatch.Metric({
                    namespace: 'AWS/ECS',
                    metricName: 'RunningTaskCount',
                    dimensionsMap: {
                        ServiceName: this.ecsService.serviceName,
                        ClusterName: this.cluster.clusterName,
                    },
                    period: cdk.Duration.minutes(1),
                    statistic: cloudwatch.Stats.AVERAGE,
                }),
                threshold: envConfig.minCapacity,
                comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.BREACHING,
            });

            // ALB target health alarm
            const unhealthyTargetsAlarm = new cloudwatch.Alarm(this, 'UnhealthyTargetsAlarm', {
                alarmName: `nextjs-users-unhealthy-targets-${stage}`,
                alarmDescription: `Alarm when ALB has unhealthy targets for ${stage} environment`,
                metric: this.targetGroup.metrics.unhealthyHostCount({
                    period: cdk.Duration.minutes(1),
                    statistic: cloudwatch.Stats.AVERAGE,
                }),
                threshold: 1,
                comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
                evaluationPeriods: 3,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });

            // Add outputs for alarm ARNs
            new cdk.CfnOutput(this, 'HighCpuAlarmArn', {
                value: highCpuAlarm.alarmArn,
                description: `High CPU alarm ARN for ${stage} environment`,
                exportName: `${this.stackName}-HighCpuAlarmArn-${stage}`,
            });

            new cdk.CfnOutput(this, 'HighMemoryAlarmArn', {
                value: highMemoryAlarm.alarmArn,
                description: `High memory alarm ARN for ${stage} environment`,
                exportName: `${this.stackName}-HighMemoryAlarmArn-${stage}`,
            });
        }

        // Create CloudWatch Dashboard for service health monitoring
        const dashboard = new cloudwatch.Dashboard(this, 'NextjsUsersDashboard', {
            dashboardName: 'nextjs-users-service-health',
            defaultInterval: cdk.Duration.hours(1), // Default time range: 1 hour
        });

        // Add ECS service metrics widgets
        dashboard.addWidgets(
            // ECS Service Overview Row
            new cloudwatch.GraphWidget({
                title: 'ECS Service - CPU & Memory Utilization',
                left: [
                    this.ecsService.metricCpuUtilization({
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.AVERAGE,
                        label: 'CPU Utilization (%)',
                    }),
                ],
                right: [
                    this.ecsService.metricMemoryUtilization({
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.AVERAGE,
                        label: 'Memory Utilization (%)',
                    }),
                ],
                width: 12,
                height: 6,
                leftYAxis: {
                    min: 0,
                    max: 100,
                },
                rightYAxis: {
                    min: 0,
                    max: 100,
                },
            }),

            // Task Count Widget
            new cloudwatch.GraphWidget({
                title: 'ECS Service - Running Tasks',
                left: [
                    new cloudwatch.Metric({
                        namespace: 'AWS/ECS',
                        metricName: 'RunningTaskCount',
                        dimensionsMap: {
                            ServiceName: this.ecsService.serviceName,
                            ClusterName: this.cluster.clusterName,
                        },
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.AVERAGE,
                        label: 'Running Tasks',
                    }),
                ],
                width: 6,
                height: 6,
                leftYAxis: {
                    min: 0,
                },
            }),

            // ALB Metrics Widget
            new cloudwatch.GraphWidget({
                title: 'ALB - Request Count & Response Time',
                left: [
                    this.applicationLoadBalancer.metrics.requestCount({
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.SUM,
                        label: 'Request Count',
                    }),
                ],
                right: [
                    this.targetGroup.metrics.targetResponseTime({
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.AVERAGE,
                        label: 'Response Time (seconds)',
                    }),
                ],
                width: 6,
                height: 6,
                rightYAxis: {
                    min: 0,
                },
            }),

            // ALB Target Health Widget
            new cloudwatch.GraphWidget({
                title: 'ALB - Target Health',
                left: [
                    this.targetGroup.metrics.healthyHostCount({
                        period: cdk.Duration.minutes(1),
                        statistic: cloudwatch.Stats.AVERAGE,
                        label: 'Healthy Targets',
                    }),
                    this.targetGroup.metrics.unhealthyHostCount({
                        period: cdk.Duration.minutes(1),
                        statistic: cloudwatch.Stats.AVERAGE,
                        label: 'Unhealthy Targets',
                    }),
                ],
                width: 6,
                height: 6,
                leftYAxis: {
                    min: 0,
                },
            }),

            // HTTP Status Codes Widget
            new cloudwatch.GraphWidget({
                title: 'ALB - HTTP Status Codes',
                left: [
                    this.applicationLoadBalancer.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_2XX_COUNT, {
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.SUM,
                        label: '2xx Success',
                    }),
                    this.applicationLoadBalancer.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_4XX_COUNT, {
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.SUM,
                        label: '4xx Client Error',
                    }),
                    this.applicationLoadBalancer.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.SUM,
                        label: '5xx Server Error',
                    }),
                ],
                width: 6,
                height: 6,
                leftYAxis: {
                    min: 0,
                },
            }),

            // Monitoring Status Widget
            new cloudwatch.TextWidget({
                markdown: `## Monitoring Configuration

**Environment:** ${stage.toUpperCase()}
**Detailed Monitoring:** ${deploymentConfig.enableDetailedMonitoring ? 'Enabled' : 'Disabled'}
**Container Insights:** ${deploymentConfig.enableContainerInsights ? 'Enabled' : 'Disabled'}
**X-Ray Tracing:** ${deploymentConfig.enableXRayTracing ? 'Enabled' : 'Disabled'}

**Resource Configuration:**
- CPU: ${envConfig.cpu} units
- Memory: ${envConfig.memoryLimitMiB} MB
- Desired Tasks: ${envConfig.desiredCount}
- Min/Max Capacity: ${envConfig.minCapacity}/${envConfig.maxCapacity}
`,
                width: 12,
                height: 4,
            }),

            // Log Group Information Widget
            new cloudwatch.TextWidget({
                markdown: `## Log Groups for Monitoring

**Application Logs:** [${logGroup.logGroupName}](https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:log-groups/log-group/${encodeURIComponent(logGroup.logGroupName)})

**ALB Access Logs:** [${albLogGroup.logGroupName}](https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:log-groups/log-group/${encodeURIComponent(albLogGroup.logGroupName)})

**Service Events:** [${ecsServiceLogGroup.logGroupName}](https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:log-groups/log-group/${encodeURIComponent(ecsServiceLogGroup.logGroupName)})

### Useful Log Insights Queries:

**Error Analysis:**
\`\`\`
fields @timestamp, @message
| filter @message like /ERROR/ or @message like /error/
| sort @timestamp desc
| limit 50
\`\`\`

**Health Check Monitoring:**
\`\`\`
fields @timestamp, @message
| filter @message like /health/
| stats count() by bin(5m)
\`\`\`

**Request Volume Analysis:**
\`\`\`
fields @timestamp, @message
| filter @message like /GET/ or @message like /POST/
| stats count() by bin(5m)
\`\`\`
`,
                width: 12,
                height: 8,
            }),
        );

        new cdk.CfnOutput(this, 'LogGroupName', {
            value: logGroup.logGroupName,
            description: 'CloudWatch Log Group Name for ECS tasks',
            exportName: `${this.stackName}-LogGroupName`,
        });

        new cdk.CfnOutput(this, 'AlbLogGroupName', {
            value: albLogGroup.logGroupName,
            description: 'CloudWatch Log Group Name for ALB access logs',
            exportName: `${this.stackName}-AlbLogGroupName`,
        });

        new cdk.CfnOutput(this, 'ServiceLogGroupName', {
            value: ecsServiceLogGroup.logGroupName,
            description: 'CloudWatch Log Group Name for ECS service events',
            exportName: `${this.stackName}-ServiceLogGroupName`,
        });

        new cdk.CfnOutput(this, 'EcsServiceArn', {
            value: this.ecsService.serviceArn,
            description: `ECS Service ARN for ${stage} environment`,
            exportName: `${this.stackName}-EcsServiceArn-${stage}`,
        });

        // Add environment-specific configuration outputs
        new cdk.CfnOutput(this, 'DeploymentStage', {
            value: stage,
            description: 'Deployment stage/environment',
            exportName: `${this.stackName}-DeploymentStage`,
        });

        new cdk.CfnOutput(this, 'EnvironmentConfig', {
            value: JSON.stringify({
                cpu: envConfig.cpu,
                memory: envConfig.memoryLimitMiB,
                desiredCount: envConfig.desiredCount,
                minCapacity: envConfig.minCapacity,
                maxCapacity: envConfig.maxCapacity,
                circuitBreakerEnabled: envConfig.circuitBreakerEnabled,
            }),
            description: 'Environment-specific configuration summary',
            exportName: `${this.stackName}-EnvironmentConfig-${stage}`,
        });

        new cdk.CfnOutput(this, 'EcsServiceName', {
            value: this.ecsService.serviceName,
            description: 'ECS Service Name',
            exportName: `${this.stackName}-EcsServiceName`,
        });

        // Auto-scaling outputs
        new cdk.CfnOutput(this, 'ScalableTargetResourceId', {
            value: this.scalableTarget.node.id,
            description: 'Auto Scaling Target Resource ID',
            exportName: `${this.stackName}-ScalableTargetResourceId`,
        });

        // Note: CPU scaling policy ARN is not directly accessible from scaleOnCpuUtilization method
        // The policy is created internally by CDK

        // CloudWatch alarm outputs are now created conditionally within the monitoring block

        new cdk.CfnOutput(this, 'DashboardName', {
            value: dashboard.dashboardName,
            description: 'CloudWatch Dashboard Name for Service Health',
            exportName: `${this.stackName}-DashboardName`,
        });

        new cdk.CfnOutput(this, 'DashboardUrl', {
            value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
            description: 'CloudWatch Dashboard URL for Service Health',
            exportName: `${this.stackName}-DashboardUrl`,
        });
    }
}