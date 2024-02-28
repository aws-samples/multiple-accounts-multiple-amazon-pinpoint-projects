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

import path from "path";
import {Aws, CfnOutput, Duration, RemovalPolicy} from "aws-cdk-lib";
import {AttributeType, BillingMode, Table, TableEncryption,} from "aws-cdk-lib/aws-dynamodb";
import {EventBus, Rule} from "aws-cdk-lib/aws-events";

import {SqsQueue} from "aws-cdk-lib/aws-events-targets";
import {AnyPrincipal, Effect, OrganizationPrincipal, PolicyStatement,} from "aws-cdk-lib/aws-iam";
import {Runtime, Tracing} from "aws-cdk-lib/aws-lambda";
import {SqsEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {BlockPublicAccess, Bucket} from "aws-cdk-lib/aws-s3";
import {Queue, QueueEncryption} from "aws-cdk-lib/aws-sqs";
import {Construct} from "constructs";
import {PinpointApiProxy} from "./PinpointApiProxy";
import {REGISTRATION_EVENT_DETAIL_TYPE, REGISTRATION_EVENT_SOURCE} from "../../index";


export interface PinpointManagementAccountConfig {
	organizationId: string;
	api: {

		apiHostName?: string
		apiTempPassword: string
		apiDomainPrefix?: string
		parentHostedZoneId?: string
		parentHostedZoneName?: string
		crossAccountZoneDelegationRoleArn?: string
		apiStageName?: string
	}
}


export class PinpointManagementAccount extends Construct {
	readonly eventBus: EventBus;
	readonly eventBucket: Bucket;

	constructor(
		scope: Construct,
		id: string,
		config: PinpointManagementAccountConfig,
	) {
		super(scope, id);
		const pinpointTenantsTable = new Table(this, "PinpointTenantsTable", {
			tableName: "PinpointTenantsTable",
			partitionKey: {
				name: "pk",
				type: AttributeType.STRING,
			},
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN,
			encryption: TableEncryption.AWS_MANAGED,
			pointInTimeRecovery: true,
		});
		//s3 bucket with an access logging bucket
		const accessLogsBucket = new Bucket(this, "AccessLogsBucket", {
			removalPolicy: RemovalPolicy.RETAIN,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			bucketName: `pinpoint-bucket-access-logs-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			enforceSSL: true
		});
		this.eventBucket = new Bucket(this, "PinpointEventStream", {
			removalPolicy: RemovalPolicy.RETAIN,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			bucketName: `pinpoint-event-stream-data-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			serverAccessLogsBucket: accessLogsBucket,
			enforceSSL: true
		});

		this.eventBus = new EventBus(this, "PinpointTenantRegistrarBus", {
			eventBusName: "PinpointTenantRegistrarBus",
		});
		this.eventBus.addToResourcePolicy(
			new PolicyStatement({
				sid: "AllowTenantEventsFromOrganizationAccounts",
				effect: Effect.ALLOW,
				actions: ["events:PutEvents"],
				principals: [new OrganizationPrincipal(config.organizationId)],
				resources: [this.eventBus.eventBusArn],
			}),
		);
		const logGroup = new LogGroup(this, "TenantRegistrarFnLogGroup", {
			retention: RetentionDays.ONE_MONTH,
		});
		const tenantRegistrarFunction = new NodejsFunction(
			this,
			"TenantRegistrarFn",
			{
				description: "TenantRegistrar Function",
				memorySize: 256,
				timeout: Duration.seconds(30),
				runtime: Runtime.NODEJS_LATEST,
				handler: "index.onEvent",
				entry: path.join(
					__dirname,
					"..",
					"..",
					"runtime",
					"TenantRegistrar.ts",
				),
				logGroup: logGroup,

				environment: {
					LOG_LEVEL: "DEBUG",
					EVENT_BUCKET_NAME: this.eventBucket.bucketName,
					TABLE_NAME: pinpointTenantsTable.tableName,
				},
				tracing: Tracing.ACTIVE,
				initialPolicy: [
					new PolicyStatement({
						effect: Effect.ALLOW,
						resources: [this.eventBucket.bucketArn],
						actions: ["s3:*BucketPolicy"],
					}),
				],
			},
		);
		pinpointTenantsTable.grantReadWriteData(tenantRegistrarFunction);

		const registrationDLQ = new Queue(this, "RegistrationDLQ", {
			removalPolicy: RemovalPolicy.DESTROY,
			visibilityTimeout: Duration.seconds(30),
			encryption:QueueEncryption.SQS_MANAGED
		});
		registrationDLQ.addToResourcePolicy(new PolicyStatement({
			effect: Effect.DENY,
			principals: [
				new AnyPrincipal(),
			],
			actions: [
				"sqs:*",
			],
			conditions: {
				"Bool": {"aws:SecureTransport": "false"},
			},
		}))

		const registrationQueue = new Queue(this, "RegistrationQueue", {
			visibilityTimeout: Duration.seconds(30),
			deadLetterQueue: {
				queue: registrationDLQ,
				maxReceiveCount: 10,
			},
			encryption:QueueEncryption.SQS_MANAGED
		});
		registrationQueue.addToResourcePolicy(new PolicyStatement({
			effect: Effect.DENY,
			principals: [
				new AnyPrincipal(),
			],
			actions: [
				"sqs:*",
			],
			conditions: {
				"Bool": {"aws:SecureTransport": "false"},
			},
		}))
		const eventSource = new SqsEventSource(registrationQueue, {
			batchSize: 25,
			enabled: true,
			maxBatchingWindow: Duration.seconds(3),
			reportBatchItemFailures: true,
		});
		tenantRegistrarFunction.addEventSource(eventSource);
		registrationQueue.grant(
			tenantRegistrarFunction,
			"sqs:DeleteMessage",
			"sqs:DeleteMessageBatch",
			"sqs:GetQueueUrl",
		);
		registrationQueue.grantConsumeMessages(tenantRegistrarFunction);

		const queueTarget = new SqsQueue(registrationQueue, {
			deadLetterQueue: registrationDLQ,
			retryAttempts: 3,
		});
		new Rule(this, "PinpointTenantRegistrationEventsToQueueRule", {
			eventBus: this.eventBus,
			ruleName: "PinpointTenantRegistrationEventsToQueueRule",
			eventPattern: {
				detailType: [REGISTRATION_EVENT_DETAIL_TYPE],
				source: [REGISTRATION_EVENT_SOURCE],
			},
			targets: [queueTarget],
		});
		new PinpointApiProxy(this, "PinpointApiProxy", {
			pinpointTenantsTable: pinpointTenantsTable,
			...config.api
		})
		new CfnOutput(this, "EventBusOutput", {
			key: "EventBusArn",
			value: this.eventBus.eventBusArn,
		});
		new CfnOutput(this, "EventBucketOutput", {
			key: "EventBucketName",
			value: this.eventBucket.bucketName,
		});

	}


}
