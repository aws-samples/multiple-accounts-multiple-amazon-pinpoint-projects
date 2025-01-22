/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {Construct, Dependable, IDependable} from "constructs";
import {AuroraPostgresEngineVersion, ClusterInstance, Credentials, DatabaseCluster, DatabaseClusterEngine, ParameterGroup} from "aws-cdk-lib/aws-rds";
import {InterfaceVpcEndpoint, InterfaceVpcEndpointAwsService, IVpc, SecurityGroup, SubnetType} from "aws-cdk-lib/aws-ec2";
import {CfnOutput, Duration, RemovalPolicy} from "aws-cdk-lib";
import {Alarm} from "aws-cdk-lib/aws-cloudwatch";

export interface DatabaseConfig {
	vpc: IVpc

	defaultDatabaseName:string
}

export class Database extends Construct implements IDependable {

	readonly dbSecurityGroup: SecurityGroup
	readonly cluster: DatabaseCluster
	readonly defaultDatabaseName:string

	constructor(scope: Construct, id: string, config: DatabaseConfig) {
		super(scope, id);
		this.defaultDatabaseName=config.defaultDatabaseName
		Dependable.implement(this, {
			dependencyRoots: [this],
		});
		// Create a security group for the database
		this.dbSecurityGroup = new SecurityGroup(this, 'DatabaseSecurityGroup', {
			vpc: config.vpc,
			description: 'Security group for Aurora Serverless v2 database',
			allowAllOutbound: false,
		});

		// Create the Aurora Serverless v2 cluster
		this.cluster = new DatabaseCluster(this, 'Database', {
			securityGroups: [this.dbSecurityGroup],
			engine: DatabaseClusterEngine.auroraPostgres({
				version: AuroraPostgresEngineVersion.VER_16_6,
			}),
			enableDataApi:true,
			port:5433,
			defaultDatabaseName: this.defaultDatabaseName,
			// Default database name
			writer: ClusterInstance.serverlessV2('writer', {
				// Configure scaling
				scaleWithWriter: true,
				autoMinorVersionUpgrade: true,

			}),
			storageEncrypted: true,  // Enable encryption at rest
			iamAuthentication: true,  // Enable IAM authentication for the database
			readers: [
				ClusterInstance.serverlessV2('reader', {
					scaleWithWriter: true,
					autoMinorVersionUpgrade: true,
				}),
			],
			serverlessV2MinCapacity: 0.5,  // Minimum ACU
			serverlessV2MaxCapacity: 16,    // Maximum ACU
			vpc: config.vpc,
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_ISOLATED,
			},
			credentials: Credentials.fromGeneratedSecret('clusteradmin'),
			backup: {
				retention: Duration.days(7),
				preferredWindow: '03:00-04:00',
			},
			parameterGroup: new ParameterGroup(this, 'ParameterGroup', {
				engine: DatabaseClusterEngine.auroraPostgres({
					version: AuroraPostgresEngineVersion.VER_16_6,
				}),
				parameters: {
					'timezone': 'UTC',
					// Add other parameters as needed
				},
			}),
			removalPolicy: RemovalPolicy.RETAIN,
		});
		new InterfaceVpcEndpoint(this, 'RDSDataApiEndpoint', {
			vpc: config.vpc,
			service: InterfaceVpcEndpointAwsService.RDS_DATA,
			subnets: {
				subnetType: SubnetType.PRIVATE_ISOLATED
			},
			privateDnsEnabled: true,
		});

// If you need to monitor the database
		this.cluster.addRotationSingleUser({
			automaticallyAfter: Duration.days(30),
			excludeCharacters: ' %+:;{}',
			vpcSubnets: {
				subnetType: SubnetType.PRIVATE_ISOLATED,
			},
		});


// Add CloudWatch alarms
		new Alarm(this, 'HighCPUAlarm', {
			metric: this.cluster.metricCPUUtilization(),
			threshold: 90,
			evaluationPeriods: 3,

		});


// Output the endpoints
		new CfnOutput(this, 'ClusterEndpoint', {
			value: this.cluster.clusterEndpoint.hostname,
		});
		new CfnOutput(this, 'ReaderEndpoint', {
			value: this.cluster.clusterReadEndpoint.hostname,
		});
		new CfnOutput(this, 'SecretName', {
			value: this.cluster.secret?.secretName || '',
		});
	}
}