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

import {DeliveryStream, StreamEncryption} from "@aws-cdk/aws-kinesisfirehose-alpha";
import {S3Bucket} from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";
import {EventType, MessageType} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import {Aws, Duration, RemovalPolicy, Size} from "aws-cdk-lib";
import {EventBus, IEventBus, IRule, Rule} from "aws-cdk-lib/aws-events";
import {EventBus as EventBusTarget} from "aws-cdk-lib/aws-events-targets";
import {AccountPrincipal, AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal,} from "aws-cdk-lib/aws-iam";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {Bucket} from "aws-cdk-lib/aws-s3";
import {Topic} from "aws-cdk-lib/aws-sns";
import {Construct} from "constructs";
import {ConfigurationSet} from "./ConfigurationSet";
import {CloudWatchLogsEventDestination, KinesisFirehoseEventDestination, SnsEventDestination,} from "./EventDestination";
import {PhoneNumber, PhoneNumberConfig} from "./PhoneNumber";
import {PhonePool} from "./PhonePool";

import {TenantRegistration} from "./TenantRegistration";
import {Queue, QueueEncryption} from "aws-cdk-lib/aws-sqs";
import {REGISTRATION_EVENT_DETAIL_TYPE, REGISTRATION_EVENT_SOURCE} from "../../index";


export interface PhonePoolWithNumbersConfig {
	isoCountryCode: string;
	messageType: MessageType;
	originationIdentity: PhoneNumberConfig | string;
	phoneNumbers?: PhoneNumberConfig[];
}

export interface EventDestinationForConfigurationSet {
	eventDestinationName: string; // required
	matchingEventTypes: EventType[];
	enableCloudwatchLogsDestination?: boolean;
	enableKinesisFirehoseDestination?: boolean;
	enableSnsDestination?: boolean;
}

export interface ConfigurationSetWithEventDestinationConfig {
	configurationSetName: string;
	eventDestination: EventDestinationForConfigurationSet;
}

export interface PinpointTenantAccountConfig {
	managementAccountId: string;
	eventStreamingBucketName: string;
	targetEventBusArn: string;
	phonePool: PhonePoolWithNumbersConfig;
	configurationSet: ConfigurationSetWithEventDestinationConfig;
	tenantId: string;
}

export class PinpointTenantAccount extends Construct {
	constructor(
		scope: Construct,
		id: string,
		config: PinpointTenantAccountConfig,
	) {
		super(scope, id);
		const phonePool = this.createPhonePool(config);
		this.createPhoneNumbers(phonePool, config);
		const configurationSet = this.createConfigurationSet(config);
		const eventDestination = configurationSet.getEventDestination(
			`${config.configurationSet.eventDestination.eventDestinationName}-Firehose`,
		) as KinesisFirehoseEventDestination | undefined;
		const [eventBus,rule] = this.createEventBus(config);
		new Role(this, "ManagementAccountAccessRole", {
			assumedBy: new AccountPrincipal(config.managementAccountId),
			roleName: "PinpointManagementAccountAccessRole",
			description:
				"Role used by the Pinpoint management account to access Pinpoint resources in this tenant account",
			inlinePolicies: {
				"ManagementAccountAccessPolicy": new PolicyDocument({
					assignSids: true,
					statements: [new PolicyStatement({
						effect: Effect.ALLOW,
						actions: ["sms-voice:*", "mobiletargeting:*",],
						resources: ["*"],
					})]
				})
			}
		});
		const registration = new TenantRegistration(this, "Registration", {
			tenantId: config.tenantId,
			deliveryStreamRoleArn: eventDestination?.bucketWriterRoleArn,
			eventBus: eventBus,
		});
		registration.node.addDependency(eventBus);
		registration.node.addDependency(rule);
	}


	protected createEventBus(config: PinpointTenantAccountConfig): [IEventBus, IRule] {

		const pinpointTenantRegistrationBus = new EventBus(this, "PinpointTenantRegistrationBus", {
			eventBusName: "PinpointTenantRegistrationBus"
		})
		const pinpointTenantRegistrarBus = EventBus.fromEventBusArn(
			this,
			"PinpointTenantRegistrarBus",
			config.targetEventBusArn,
		)
		const pinpointTenantRegistrationRole = new Role(this, "PinpointTenantRegistrationRole", {
			roleName: "PinpointTenantRegistrationRole",
			assumedBy: new ServicePrincipal("events.amazonaws.com"),
			description: `This role forwards events to the ${pinpointTenantRegistrarBus} in the Pinpoint Management Account: ${config.managementAccountId}`
		})
		const registrationDLQ = new Queue(this, "PinpointTenantRegistrationRuleDLQ", {
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
		registrationDLQ.grantSendMessages(pinpointTenantRegistrationRole)
		pinpointTenantRegistrarBus.grantPutEventsTo(pinpointTenantRegistrationRole);

		const rule = new Rule(this, "PinpointTenantRegistrationRule", {
			eventBus: pinpointTenantRegistrationBus,
			ruleName: "PinpointTenantRegistrationRule",
			eventPattern: {
				detailType: [REGISTRATION_EVENT_DETAIL_TYPE],
				source: [REGISTRATION_EVENT_SOURCE],
			},
			targets: [new EventBusTarget(pinpointTenantRegistrarBus, {
				role: pinpointTenantRegistrationRole,
				deadLetterQueue: registrationDLQ
			})],
			enabled: true,
			description: `Sends registration event to ${pinpointTenantRegistrarBus} in the Pinpoint Management Account: ${config.managementAccountId}`
		});
		rule.node.addDependency(pinpointTenantRegistrationBus);
		return [pinpointTenantRegistrationBus, rule];
	}

	protected createPhonePool(config: PinpointTenantAccountConfig): PhonePool {
		let phonePool: PhonePool;
		if (typeof config.phonePool.originationIdentity == "string") {
			phonePool = new PhonePool(this, "PhonePool", {
				isoCountryCode: config.phonePool.isoCountryCode,
				messageType: config.phonePool.messageType,
				originationIdentity: config.phonePool.originationIdentity as string,
				tags: [
					{
						Key: "Name",
						Value: "Default",
					},
				],
			});
		} else {
			const originationIdentityConfig = config.phonePool
				.originationIdentity as PhoneNumberConfig;
			const originationIdentity = new PhoneNumber(
				this,
				`OriginationIdentity`,
				originationIdentityConfig,
			);
			phonePool = new PhonePool(this, "PhonePool", {
				isoCountryCode: config.phonePool.isoCountryCode,
				messageType: config.phonePool.messageType,
				originationIdentity: originationIdentity,
			});
			phonePool.node.addDependency(originationIdentity);
		}
		return phonePool;
	}

	protected createPhoneNumbers(
		phonePool: PhonePool,
		config: PinpointTenantAccountConfig,
	): PhoneNumber[] | undefined {
		return config.phonePool.phoneNumbers?.map(
			(phoneNumberConfig: PhoneNumberConfig, idx: number) => {
				const phoneNumber = new PhoneNumber(this, `RequestPhoneNumber${idx}`, {
					...phoneNumberConfig,
					poolId: phonePool.poolId,
				});
				phoneNumber.node.addDependency(phonePool);
				return phoneNumber;
			},
		);
	}

	protected createConfigurationSet(
		config: PinpointTenantAccountConfig,
	): ConfigurationSet {
		const configurationSet = new ConfigurationSet(
			this,
			`DefaultConfigurationSet`,
			{
				configurationSetName: config.configurationSet.configurationSetName,
			},
		);

		if (
			config.configurationSet.eventDestination.enableCloudwatchLogsDestination
		) {
			this.createCloudWatchLogEventDestination(configurationSet, config);
		}

		if (
			config.configurationSet.eventDestination.enableKinesisFirehoseDestination
		) {
			this.createKinesisFirehoseEventDestination(configurationSet, config);
		}

		if (config.configurationSet.eventDestination.enableSnsDestination) {
			this.createSnsEventDestination(configurationSet, config);
		}
		return configurationSet;
	}

	protected createCloudWatchLogEventDestination(
		configurationSet: ConfigurationSet,
		config: PinpointTenantAccountConfig,
	): CloudWatchLogsEventDestination {
		//create a cloudwatch log and role that has write access to the log
		const logGroup = new LogGroup(this, "DefaultConfigurationSetLogGroup", {
			retention: RetentionDays.ONE_MONTH,
		});
		const logGroupWriterRole = new Role(
			this,
			"DefaultConfigurationSetLogGroupWriterRole",
			{
				assumedBy: new ServicePrincipal(
					"sms-voice.amazonaws.com",
				).withConditions({
					StringEquals: {
						"aws:SourceAccount": Aws.ACCOUNT_ID,
					},
					ArnLike: {
						"aws:SourceArn": `arn:${Aws.PARTITION}:sms-voice:${Aws.REGION}:${Aws.ACCOUNT_ID}:configuration-set/${configurationSet.configurationSetName}`,
					},
				}),
			},
		);
		logGroup.grantWrite(logGroupWriterRole);
		const eventDestination = new CloudWatchLogsEventDestination(
			this,
			"CloudWatchLogsEventDestination",
			{
				configurationSetName: configurationSet.configurationSetName,
				eventDestinationName: `${config.configurationSet.eventDestination.eventDestinationName}-CloudWatch`,
				matchingEventTypes:
				config.configurationSet.eventDestination.matchingEventTypes,
				logGroup: logGroup,
				role: logGroupWriterRole,
			},
		);
		configurationSet.addEventDestination(eventDestination);
		return eventDestination;
	}

	protected createSnsEventDestination(
		configurationSet: ConfigurationSet,
		config: PinpointTenantAccountConfig,
	): SnsEventDestination {
		const topic = new Topic(this, "DefaultSnsTopic", {});
		topic.addToResourcePolicy(
			new PolicyStatement({
				effect: Effect.ALLOW,
				actions: ["SNS:Publish"],
				conditions: {
					StringEquals: {
						"aws:SourceAccount": Aws.ACCOUNT_ID,
					},
					ArnLike: {
						"aws:SourceArn": `arn:${Aws.PARTITION}:sms-voice:${Aws.REGION}:${Aws.ACCOUNT_ID}:configuration-set/${configurationSet.configurationSetName}`,
					},
				},
			}),
		);

		const eventDestination = new SnsEventDestination(
			this,
			"SnsEventDestination",
			{
				configurationSetName: configurationSet.configurationSetName,
				eventDestinationName: `${config.configurationSet.eventDestination.eventDestinationName}-SNS`,
				matchingEventTypes:
				config.configurationSet.eventDestination.matchingEventTypes,
				topic: topic,
			},
		);
		configurationSet.addEventDestination(eventDestination);
		return eventDestination;
	}

	protected createKinesisFirehoseEventDestination(
		configurationSet: ConfigurationSet,
		config: PinpointTenantAccountConfig,
	): KinesisFirehoseEventDestination {
		const bucket = Bucket.fromBucketName(
			this,
			"EventStreamingBucket",
			config.eventStreamingBucketName,
		);
		const managementAccountEventStreamingBucketWriterRole = new Role(
			this,
			"ManagementAccountEventStreamingBucketWriterRole",
			{
				assumedBy: new ServicePrincipal("firehose.amazonaws.com"),
			},
		);

		const deliveryStream = new DeliveryStream(
			this,
			"DefaultFirehoseDeliveryStream",
			{
				encryption: StreamEncryption.AWS_OWNED,
				destinations: [
					new S3Bucket(bucket, {
						dataOutputPrefix: `accountId=${Aws.ACCOUNT_ID}/date=!{timestamp:yyyy-MM-dd}/`,
						errorOutputPrefix: `${config.tenantId}/errors/accountId=${Aws.ACCOUNT_ID}/date=!{timestamp:yyyy-MM-dd}/hour=!{timestamp:HH}/!{firehose:error-output-type}/`,
						role: managementAccountEventStreamingBucketWriterRole,
						bufferingInterval: Duration.seconds(60),
						bufferingSize: Size.mebibytes(1),
						logging: true
					}),
				],

			},
		);
		managementAccountEventStreamingBucketWriterRole.grantAssumeRole(deliveryStream.grantPrincipal)
		const deliveryStreamWriterRole = new Role(
			this,
			"DefaultFirehoseDeliveryStreamWriterRole",
			{
				assumedBy: new ServicePrincipal(
					"sms-voice.amazonaws.com",
				).withConditions({
					StringEquals: {
						"aws:SourceAccount": Aws.ACCOUNT_ID,
					},
					ArnLike: {
						"aws:SourceArn": `arn:${Aws.PARTITION}:sms-voice:${Aws.REGION}:${Aws.ACCOUNT_ID}:configuration-set/${configurationSet.configurationSetName}`,
					},
				}),
			},
		);
		deliveryStream.grantPutRecords(deliveryStreamWriterRole);

		const eventDestination = new KinesisFirehoseEventDestination(
			this,
			"KinesisFirehoseEventDestination",
			{
				configurationSetName: configurationSet.configurationSetName,
				eventDestinationName: `${config.configurationSet.eventDestination.eventDestinationName}-Firehose`,
				matchingEventTypes:
				config.configurationSet.eventDestination.matchingEventTypes,
				destination: deliveryStream,
				streamWriterRole: deliveryStreamWriterRole,
				bucketWriterRole: managementAccountEventStreamingBucketWriterRole,
			},
		);

		configurationSet.addEventDestination(eventDestination);
		return eventDestination;
	}


}
