import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { ApplicationConfig } from '../types/configuration-types';

export interface VpcStackProps extends cdk.StackProps {
    stage?: string;
    /** Resolved application configuration with resource names */
    applicationConfig: ApplicationConfig;
}

export class VpcStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;

    constructor(scope: Construct, id: string, props: VpcStackProps) {
        super(scope, id, props);

        const stage = props.stage || 'beta';

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
            // VPC Flow Logs removed - not used for monitoring and saves CloudWatch costs
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

        // VPC endpoint outputs removed - endpoints no longer created

        // Add tags
        cdk.Tags.of(this).add('Stage', stage);
        cdk.Tags.of(this).add('Application', props.applicationConfig.applicationName);
        cdk.Tags.of(this).add('Component', 'VPC');
    }
}