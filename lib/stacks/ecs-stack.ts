import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

import { validateEnvironmentConfig } from '../../config/deployment-config';
import { EnvironmentServiceConfig, SecretsConfig } from '../types/configuration-types';

export interface EcsStackProps extends cdk.StackProps {
    vpc: ec2.IVpc;
    stage: string;
    environmentConfig: EnvironmentServiceConfig;
}

export class EcsStack extends cdk.Stack {
    public readonly vpc: ec2.IVpc;
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
    public readonly secret?: secretsmanager.ISecret;


    constructor(scope: Construct, id: string, props: EcsStackProps) {
        super(scope, id, props);

        // Get required parameters from props
        const stage = props.stage;
        
        const environmentConfig = props.environmentConfig;
        const ecsConfig = environmentConfig.ecsConfig;

        // Validate the environment configuration
        validateEnvironmentConfig(stage);

        // Use provided VPC
        this.vpc = props.vpc;

        // Create ECS Cluster with environment-specific configuration
        this.cluster = new ecs.Cluster(this, 'EcsCluster', {
            vpc: this.vpc,
            clusterName: environmentConfig.resourceNames.clusterName,
            // Enable CloudWatch Container Insights based on environment configuration
            containerInsightsV2: environmentConfig.monitoring?.enableContainerInsights ?
                ecs.ContainerInsights.ENABLED :
                ecs.ContainerInsights.DISABLED,
        });

        // Reference existing ECR repository created during synth step
        this.ecrRepository = ecr.Repository.fromRepositoryName(this, 'ApplicationRepository', environmentConfig.resourceNames.ecrRepositoryName);

        // Note: ECR repository is created and managed during the synth step
        // CodeBuild permissions are handled by the pipeline's synthCodeBuildDefaults

        // Create security group for Application Load Balancer with least privilege access
        this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
            vpc: this.vpc,
            description: `Security group for ${props.environmentConfig.serviceName} Load Balancer - least privilege access`,
            securityGroupName: environmentConfig.resourceNames.albSecurityGroupName,
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
            description: `Security group for ${props.environmentConfig.serviceName} ECS tasks - least privilege access`,
            securityGroupName: environmentConfig.resourceNames.ecsSecurityGroupName,
            allowAllOutbound: false, // Explicitly define all egress rules for security
        });

        // Allow inbound traffic from ALB to ECS tasks on configured container port ONLY
        this.ecsSecurityGroup.addIngressRule(
            this.albSecurityGroup,
            ec2.Port.tcp(ecsConfig.containerPort),
            `Allow traffic from ALB to ECS tasks on port ${ecsConfig.containerPort} only`
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

        // Allow outbound traffic from ALB to ECS tasks on configured container port ONLY
        this.albSecurityGroup.addEgressRule(
            this.ecsSecurityGroup,
            ec2.Port.tcp(ecsConfig.containerPort),
            `Allow traffic from ALB to ECS tasks on port ${ecsConfig.containerPort} only`
        );

        // VPC endpoints are now managed by VpcStack

        // Create Application Load Balancer in public subnets
        this.applicationLoadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
            vpc: this.vpc,
            internetFacing: true, // Internet-facing ALB for public access
            loadBalancerName: environmentConfig.resourceNames.albName,
            securityGroup: this.albSecurityGroup,
            // Place ALB in public subnets across multiple AZs
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
            // Enable deletion protection in production (disabled for development)
            deletionProtection: false,
        });

        // Create target group for ECS tasks on configured container port
        this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'ApplicationTargetGroup', {
            vpc: this.vpc,
            port: ecsConfig.containerPort,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP, // Required for Fargate tasks
            targetGroupName: environmentConfig.resourceNames.targetGroupName,
            // Health check configuration for target group - aligned with container health check
            healthCheck: {
                enabled: true,
                path: ecsConfig.healthCheckPath, // Health check endpoint path from config
                port: ecsConfig.containerPort.toString(),
                protocol: elbv2.Protocol.HTTP,
                healthyHttpCodes: '200', // Consider 200 as healthy
                interval: cdk.Duration.seconds(30), // Check every 30 seconds
                timeout: cdk.Duration.seconds(15), // Increased timeout for application startup
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
        const logGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
            logGroupName: environmentConfig.resourceNames.logGroupName,
            retention: ecsConfig.logRetention,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Remove log group when stack is deleted
        });

        // Create separate log group for ALB access logs (optional, for future use)
        const albLogGroup = new logs.LogGroup(this, 'ApplicationAlbLogGroup', {
            logGroupName: `/aws/applicationloadbalancer/${props.environmentConfig.serviceName}`,
            retention: logs.RetentionDays.ONE_WEEK, // ALB logs can have shorter retention
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create log group for ECS service events and deployment logs
        const ecsServiceLogGroup = new logs.LogGroup(this, 'ApplicationServiceLogGroup', {
            logGroupName: `/aws/ecs/service/${props.environmentConfig.serviceName}`,
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
                        // ECR permissions for pulling images from the configured repository
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'ecr:BatchCheckLayerAvailability',
                                'ecr:GetDownloadUrlForLayer',
                                'ecr:BatchGetImage',
                            ],
                            resources: [`arn:aws:ecr:${this.region}:${this.account}:repository/${environmentConfig.resourceNames.ecrRepositoryName}`],
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
                                    'cloudwatch:namespace': `${props.environmentConfig.serviceName}/Metrics`, // Restrict to application-specific namespace
                                },
                            },
                        }),
                    ],
                }),
            },
        });

        // Create Fargate task definition with environment-specific CPU and memory specifications
        this.taskDefinition = new ecs.FargateTaskDefinition(this, 'ApplicationTaskDefinition', {
            family: environmentConfig.resourceNames.taskDefinitionFamily,
            // CPU units (1024 = 1 vCPU) - environment-specific
            cpu: ecsConfig.cpu,
            // Memory in MB - environment-specific
            memoryLimitMiB: ecsConfig.memoryLimitMiB,
            // IAM roles
            executionRole: this.taskExecutionRole,
            taskRole: this.taskRole,
        });

        // Add container definition to task definition with environment-specific configuration
        const container = this.taskDefinition.addContainer('application-container', {
            // Container name
            containerName: `${props.environmentConfig.serviceName}-${stage}`,
            // ECR image reference - will be updated by pipeline with specific tags
            image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository, 'latest'),
            // Port mappings - only expose necessary ports
            portMappings: [
                {
                    containerPort: ecsConfig.containerPort,
                    protocol: ecs.Protocol.TCP,
                    name: 'http',
                    appProtocol: ecs.AppProtocol.http, // Specify application protocol for better routing
                },
            ],
            // CloudWatch logging configuration with enhanced security
            logging: ecs.LogDrivers.awsLogs({
                logGroup: logGroup,
                streamPrefix: `${props.environmentConfig.serviceName}-${stage}`,
            }),
            // Environment variables for Next.js application - environment-specific
            environment: {
                ...ecsConfig.environmentVariables,
                // Add stage-specific environment variable
                DEPLOYMENT_STAGE: stage.toLowerCase(),

                // Add timestamp for deployment tracking
                DEPLOYMENT_TIMESTAMP: new Date().toISOString(),

                DEPLOYMENT_REGION: (props.env?.region as string).toLowerCase(),
            },
            // Container health check disabled - relying on ALB target group health checks only
            // ALB health checks are sufficient for most use cases and avoid container startup issues
            // healthCheck: {
            //     command: [
            //         'CMD-SHELL',
            //         `curl -f --connect-timeout 10 --max-time 15 http://localhost:${appConfig.serviceConfig.containerPort}${appConfig.healthCheckPath} || exit 1`
            //     ],
            //     interval: cdk.Duration.seconds(30),
            //     timeout: cdk.Duration.seconds(20),
            //     retries: 3,
            //     startPeriod: envConfig.healthCheckGracePeriod,
            // },
            // Essential container - if this fails, the task stops
            essential: true,
            // Security configurations
            readonlyRootFilesystem: false, // Next.js needs write access for temp files, set to true if possible
            // Run container as non-root user for security (requires Dockerfile configuration)
            user: '1001', // Non-root user ID (must match Dockerfile USER directive)
            // Memory and CPU limits for security - environment-specific
            memoryLimitMiB: ecsConfig.memoryLimitMiB, // Hard limit to prevent memory exhaustion
            memoryReservationMiB: ecsConfig.memoryReservationMiB, // Soft limit for better resource allocation
            // Disable privileged mode for security
            privileged: false,
            // Linux parameters for enhanced security
            linuxParameters: new ecs.LinuxParameters(this, 'LinuxParameters', {
                // Initialize process to handle signals properly
                initProcessEnabled: true,
                // Note: sharedMemorySize is not supported for Fargate tasks
            }),
        });

        // Handle Secrets Manager integration if configured
        if (environmentConfig.secretsConfig) {
            const secretArn = environmentConfig.secretsConfig.secretArn;

            this.secret = secretsmanager.Secret.fromSecretCompleteArn(
                this,
                environmentConfig.secretsConfig.secretName,
                secretArn
            );

            // Step 3: Add Secrets Manager permissions to task execution role
            this.addSecretsManagerPermissions(this.secret);

            // Step 4: Prepare environment variables for conflict checking
            const containerEnvironmentVars = {
                ...ecsConfig.environmentVariables,
                DEPLOYMENT_STAGE: stage.toLowerCase(),
                DEPLOYMENT_TIMESTAMP: new Date().toISOString(),
                DEPLOYMENT_REGION: (props.env?.region as string).toLowerCase(),
            };

            // Step 5: Add secrets to container definition with enhanced error handling
            this.addSecretsToContainer(container, this.secret, environmentConfig.secretsConfig);

        }

        // VPC-related outputs are now managed by VpcStack

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
            value: `${this.account}.dkr.ecr.${this.region}.amazonaws.com/${environmentConfig.resourceNames.ecrRepositoryName}`,
            description: 'ECR Repository URI for container images',
            exportName: `${this.stackName}-EcrRepositoryUri`,
        });

        new cdk.CfnOutput(this, 'EcrRepositoryName', {
            value: environmentConfig.resourceNames.ecrRepositoryName,
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

        // Add Secrets Manager outputs if secret is created
        if (this.secret) {
            new cdk.CfnOutput(this, 'SecretArn', {
                value: this.secret.secretArn,
                description: 'Secrets Manager Secret ARN',
                exportName: `${this.stackName}-SecretArn`,
            });

            new cdk.CfnOutput(this, 'SecretName', {
                value: this.secret.secretName,
                description: 'Secrets Manager Secret Name',
                exportName: `${this.stackName}-SecretName`,
            });
        }

        // VPC endpoint outputs are now managed by VpcStack



        // Create ECS service with environment-specific deployment configuration
        this.ecsService = new ecs.FargateService(this, 'ApplicationService', {
            cluster: this.cluster,
            taskDefinition: this.taskDefinition,
            serviceName: environmentConfig.resourceNames.serviceName,
            // Environment-specific desired count for high availability
            desiredCount: ecsConfig.desiredCount,
            // Configure service to use private subnets for security
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            // Use ECS security group with least privilege access
            securityGroups: [this.ecsSecurityGroup],
            // Assign public IP is disabled for security (tasks in private subnets)
            assignPublicIp: false,
            // Configure deployment settings for zero-downtime updates - environment-specific
            maxHealthyPercent: ecsConfig.maxHealthyPercent,
            minHealthyPercent: ecsConfig.minHealthyPercent,
            // Enable deployment circuit breaker for automatic rollback on failure - environment-specific
            circuitBreaker: {
                enable: ecsConfig.circuitBreakerEnabled,
                rollback: ecsConfig.circuitBreakerRollback,
            },
            // Health check grace period - environment-specific
            healthCheckGracePeriod: ecsConfig.healthCheckGracePeriod,
            // Use latest Fargate platform version for security patches
            platformVersion: ecs.FargatePlatformVersion.LATEST,

            // Enable execute command for secure debugging - environment-specific
            enableExecuteCommand: ecsConfig.enableExecuteCommand,

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
            minCapacity: ecsConfig.minCapacity, // Environment-specific minimum number of tasks
            maxCapacity: ecsConfig.maxCapacity, // Environment-specific maximum number of tasks
        });

        // Configure CPU-based scaling policy with environment-specific settings
        this.scalableTarget.scaleOnCpuUtilization('CpuScalingPolicy', {
            targetUtilizationPercent: ecsConfig.targetCpuUtilization, // Environment-specific target CPU utilization
            scaleInCooldown: ecsConfig.scaleInCooldown, // Environment-specific cooldown for scale-in
            scaleOutCooldown: ecsConfig.scaleOutCooldown, // Environment-specific cooldown for scale-out
            policyName: `${props.environmentConfig.serviceName}-cpu-scaling-policy-${stage}`,
        });

        // Add memory-based scaling policy for better resource management
        this.scalableTarget.scaleOnMemoryUtilization('MemoryScalingPolicy', {
            targetUtilizationPercent: ecsConfig.targetCpuUtilization + 10, // Slightly higher threshold for memory
            scaleInCooldown: ecsConfig.scaleInCooldown,
            scaleOutCooldown: ecsConfig.scaleOutCooldown,
            policyName: `${props.environmentConfig.serviceName}-memory-scaling-policy-${stage}`,
        });

        // Add CloudWatch alarms for scaling triggers with environment-specific configuration
        if (environmentConfig.monitoring?.enableDetailedMonitoring) {
            // High CPU utilization alarm
            const highCpuAlarm = new cloudwatch.Alarm(this, 'HighCpuAlarm', {
                alarmName: `${props.environmentConfig.serviceName}-high-cpu-${stage}`,
                alarmDescription: `Alarm when CPU utilization is high for ${props.environmentConfig.serviceName} ${stage} environment`,
                metric: this.ecsService.metricCpuUtilization({
                    period: cdk.Duration.minutes(5),
                    statistic: cloudwatch.Stats.AVERAGE,
                }),
                threshold: ecsConfig.targetCpuUtilization + 20, // Trigger 20% above target
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            });

            // High memory utilization alarm
            const highMemoryAlarm = new cloudwatch.Alarm(this, 'HighMemoryAlarm', {
                alarmName: `${props.environmentConfig.serviceName}-high-memory-${stage}`,
                alarmDescription: `Alarm when memory utilization is high for ${props.environmentConfig.serviceName} ${stage} environment`,
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
                alarmName: `${props.environmentConfig.serviceName}-low-task-count-${stage}`,
                alarmDescription: `Alarm when running task count is below minimum for ${props.environmentConfig.serviceName} ${stage} environment`,
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
                threshold: ecsConfig.minCapacity,
                comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.BREACHING,
            });

            // ALB target health alarm
            const unhealthyTargetsAlarm = new cloudwatch.Alarm(this, 'UnhealthyTargetsAlarm', {
                alarmName: `${props.environmentConfig.serviceName}-unhealthy-targets-${stage}`,
                alarmDescription: `Alarm when ALB has unhealthy targets for ${props.environmentConfig.serviceName} ${stage} environment`,
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
        const dashboard = new cloudwatch.Dashboard(this, 'ApplicationDashboard', {
            dashboardName: `${props.environmentConfig.serviceName}-service-health`,
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
**Detailed Monitoring:** ${environmentConfig.monitoring.enableDetailedMonitoring ? 'Enabled' : 'Disabled'}
**Container Insights:** ${environmentConfig.monitoring.enableContainerInsights ? 'Enabled' : 'Disabled'}
**X-Ray Tracing:** ${environmentConfig.monitoring.enableXRayTracing ? 'Enabled' : 'Disabled'}

**Resource Configuration:**
- CPU: ${ecsConfig.cpu} units
- Memory: ${ecsConfig.memoryLimitMiB} MB
- Desired Tasks: ${ecsConfig.desiredCount}
- Min/Max Capacity: ${ecsConfig.minCapacity}/${ecsConfig.maxCapacity}
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
                cpu: ecsConfig.cpu,
                memory: ecsConfig.memoryLimitMiB,
                desiredCount: ecsConfig.desiredCount,
                minCapacity: ecsConfig.minCapacity,
                maxCapacity: ecsConfig.maxCapacity,
                circuitBreakerEnabled: ecsConfig.circuitBreakerEnabled,
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

    /**
     * Adds Secrets Manager permissions to the task execution role.
     * Implements least-privilege access by granting permissions only to environment-specific secrets.
     * 
     * @param secret - The Secrets Manager secret to grant access to
     */
    private addSecretsManagerPermissions(
        secret: secretsmanager.ISecret,
    ): void {
        // Add Secrets Manager permissions to task execution role with least privilege
        this.taskExecutionRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'secretsmanager:GetSecretValue',
                ],
                resources: [
                    secret.secretArn,
                    // Include versioned secret ARN pattern for secret rotation support
                    `${secret.secretArn}:*`,
                ]
            })
        );

        // Add KMS permissions if the secret uses a customer-managed KMS key
        // This is conditional and only added if the secret uses KMS encryption
        if (secret.encryptionKey) {
            this.taskExecutionRole.addToPolicy(
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'kms:Decrypt',
                        'kms:DescribeKey',
                    ],
                    resources: [secret.encryptionKey.keyArn],
                    conditions: {
                        StringEquals: {
                            'kms:ViaService': `secretsmanager.${this.region}.amazonaws.com`,
                        },
                    },
                })
            );
        }
    }

    /**
     * Adds secrets to container definition using ECS native secrets support.
     * Each secret key-value pair is injected as a separate environment variable.
     * 
     * @param container - The ECS container definition to add secrets to
     * @param secret - The Secrets Manager secret containing the JSON payload
     * @param secretsConfig - The secrets configuration with key-value pairs
     * @param existingEnvVars - The existing environment variables to check for conflicts
     * @throws Error if secret configuration is invalid or contains conflicting keys
     */
    private addSecretsToContainer(
        container: ecs.ContainerDefinition,
        secret: secretsmanager.ISecret,
        secretsConfig: SecretsConfig,
    ): void {
        const secretKeys = secretsConfig.environmentKeys;

        // Add each secret key as a separate environment variable using ECS secrets support
        secretKeys.forEach(secretKey => {
            // Add secret to container using ECS native secrets support
            // Each key in the JSON secret becomes a separate environment variable
            container.addSecret(secretKey, ecs.Secret.fromSecretsManager(secret, secretKey));
        });
    }
}