import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ApplicationConfig } from '../types/configuration-types';

export interface VpcStackProps extends cdk.StackProps {
    stage?: string;
    /** Resolved application configuration with resource names */
    applicationConfig?: ApplicationConfig;
}

export class VpcStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;
    public readonly ecrApiEndpoint: ec2.InterfaceVpcEndpoint;
    public readonly ecrDkrEndpoint: ec2.InterfaceVpcEndpoint;
    public readonly cloudWatchLogsEndpoint: ec2.InterfaceVpcEndpoint;
    public readonly s3GatewayEndpoint: ec2.GatewayVpcEndpoint;

    constructor(scope: Construct, id: string, props?: VpcStackProps) {
        super(scope, id, props);

        const stage = props?.stage || 'beta';
        const appConfig = props?.applicationConfig;
        
        if (!appConfig) {
            throw new Error('Application configuration is required. Please provide a resolved application configuration.');
        }

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
                            logGroupName: `/aws/vpc/flowlogs/${appConfig.applicationName}-${stage}`,
                            retention: logs.RetentionDays.ONE_WEEK,
                            removalPolicy: cdk.RemovalPolicy.DESTROY,
                        })
                    ),
                    trafficType: ec2.FlowLogTrafficType.ALL, // Log all traffic for security analysis
                },
            },
        });

        // Create VPC endpoints for enhanced security
        // ECR API VPC Endpoint
        this.ecrApiEndpoint = new ec2.InterfaceVpcEndpoint(this, 'EcrApiEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            privateDnsEnabled: true,
        });

        // ECR DKR VPC Endpoint (for Docker registry operations)
        this.ecrDkrEndpoint = new ec2.InterfaceVpcEndpoint(this, 'EcrDkrEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            privateDnsEnabled: true,
        });

        // CloudWatch Logs VPC Endpoint
        this.cloudWatchLogsEndpoint = new ec2.InterfaceVpcEndpoint(this, 'CloudWatchLogsEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            privateDnsEnabled: true,
        });

        // S3 Gateway VPC Endpoint (for ECR layer storage)
        this.s3GatewayEndpoint = new ec2.GatewayVpcEndpoint(this, 'S3GatewayEndpoint', {
            vpc: this.vpc,
            service: ec2.GatewayVpcEndpointAwsService.S3,
            subnets: [
                {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
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

        // VPC Endpoint outputs
        new cdk.CfnOutput(this, 'EcrApiEndpointId', {
            value: this.ecrApiEndpoint.vpcEndpointId,
            description: 'ECR API VPC Endpoint ID',
            exportName: `${this.stackName}-EcrApiEndpointId`,
        });

        new cdk.CfnOutput(this, 'CloudWatchLogsEndpointId', {
            value: this.cloudWatchLogsEndpoint.vpcEndpointId,
            description: 'CloudWatch Logs VPC Endpoint ID',
            exportName: `${this.stackName}-CloudWatchLogsEndpointId`,
        });

        new cdk.CfnOutput(this, 'S3GatewayEndpointId', {
            value: this.s3GatewayEndpoint.vpcEndpointId,
            description: 'S3 Gateway VPC Endpoint ID',
            exportName: `${this.stackName}-S3GatewayEndpointId`,
        });

        // Add tags
        cdk.Tags.of(this).add('Stage', stage);
        cdk.Tags.of(this).add('Application', appConfig.applicationName);
        cdk.Tags.of(this).add('Component', 'VPC');
    }
}