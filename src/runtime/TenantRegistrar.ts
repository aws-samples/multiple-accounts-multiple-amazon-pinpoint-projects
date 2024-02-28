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

import {BatchProcessor, EventType, processPartialResponse,} from "@aws-lambda-powertools/batch";
import {Logger} from "@aws-lambda-powertools/logger";
import {logMetrics, Metrics} from "@aws-lambda-powertools/metrics";
import {captureLambdaHandler, Tracer} from "@aws-lambda-powertools/tracer";

import {marshall} from "@aws-sdk/util-dynamodb";
import middy from "@middy/core";
import {SQSBatchResponse, SQSEvent, SQSRecord} from "aws-lambda";

import {SQSHandler} from "aws-lambda/trigger/sqs";
import {Aws, AwsApiCalls} from "./Aws";

const logger = new Logger({
	serviceName: "TenantRegistrar",
});
const metrics = new Metrics({
	namespace: process.env.METRIC_NAMESPACE!,
	serviceName: "TenantRegistrar",
});
const tracer = new Tracer({
	serviceName: "TenantRegistrar",
	enabled: true,
	captureHTTPsRequests: true,
});

interface RegistrationEvent {
	tenantId: string;
	accountId: string;
	region: string;
	deliveryStreamRoleArn?: string;
	eventName: string;
}

const processor = new BatchProcessor(EventType.SQS);
type RecordHandler = (record: SQSRecord) => Promise<void>;
const recordHandlerFactory = (aws: AwsApiCalls): RecordHandler => {
	return async (record: SQSRecord): Promise<void> => {
		const payload = record.body;
		if (payload) {
			const item = JSON.parse(payload);
			const registrationEvent = item.detail as RegistrationEvent;
			logger.info(
				`Processing tenant registration event: ${JSON.stringify(registrationEvent)}`,
			);
			const eventName = registrationEvent.eventName;
			switch (eventName) {
			case "Create":
			case "Update":
				await registerTenant(registrationEvent, aws);
				break;
			case "Delete":
				await deregisterTenant(registrationEvent, aws);
				break;
			default:
				logger.warn(`Unknown event type: ${eventName}`);
			}
		}
	};
};

async function deregisterTenant(registration: RegistrationEvent,
																aws: AwsApiCalls,
) {
	const segment = tracer.getSegment()?.addNewSubsegment("### deregisterTenant");
	try {
		logger.info(`Registering tenantId ${registration.tenantId}`);
		await aws.deleteItem({
			TableName: process.env.TABLE_NAME!,
			Key: {
				"pk": {
					"S": registration.tenantId
				}
			}
		});
		if (registration.deliveryStreamRoleArn != undefined) {
			await removeFirehoseArnToBucketPolicy(registration, aws);
		}
	} catch (e) {
		const error = e as Error;
		logger.error(`${error.name} - ${error.message}`);
		segment?.addError(error);
		throw e;
	} finally {
		segment?.close();
	}
}

async function registerTenant(
	registration: RegistrationEvent,
	aws: AwsApiCalls,
) {
	const segment = tracer.getSegment()?.addNewSubsegment("### registerTenant");
	try {
		logger.info(`Registering tenantId ${registration.tenantId}`);
		await aws.putItem({
			TableName: process.env.TABLE_NAME!,
			Item: marshall({
				pk: registration.tenantId,
				accountId: registration.accountId,
				region: registration.region,
				deliveryStreamRoleArn: registration.deliveryStreamRoleArn,
			}),
		});
		if (registration.deliveryStreamRoleArn != undefined) {
			await addFirehoseArnToBucketPolicy(registration, aws);
		}
	} catch (e) {
		const error = e as Error;
		logger.error(`${error.name} - ${error.message}`);
		segment?.addError(error);
		throw e;
	} finally {
		segment?.close();
	}
}

export async function removeFirehoseArnToBucketPolicy(
	registration: RegistrationEvent,
	aws: AwsApiCalls,
) {
	const segment = tracer
	.getSegment()
	?.addNewSubsegment("### removeFirehoseArnToBucketPolicy");
	try {
		const getBucketPolicyResponse = await aws.getBucketPolicy({
			Bucket: process.env.EVENT_BUCKET_NAME,
		});
		logger.debug(
			`getBucketPolicyResponse: ${JSON.stringify(getBucketPolicyResponse)}`,
		);
		if (getBucketPolicyResponse.Policy != undefined) {
			const policy = JSON.parse(getBucketPolicyResponse.Policy)
			let statements = policy?.Statement as Array<Record<string, any | undefined>>;
			const [sid0Idx] = statement0(policy, registration)
			if (sid0Idx != -1) {
				logger.debug(`Removing statement index ${sid0Idx}`)
				statements = statements.splice(sid0Idx, 1);
			}
			const [sid1Idx] = statement1(policy, registration)
			if (sid1Idx != -1) {
				logger.debug(`Removing statement index ${sid1Idx}`)
				statements = statements.splice(sid1Idx, 1);
			}
			policy.Statement = statements
			const policyString = JSON.stringify(policy, null, 0);
			logger.info(`Setting BucketPolicy: ${policyString}`);
			await aws.putBucketPolicy({
				Bucket: process.env.EVENT_BUCKET_NAME,
				Policy: policyString,
			});
		}


	} catch (e) {
		const error = e as Error;
		if (error.name != "NoSuchBucketPolicy") {
			logger.error(`${error.name} - ${error.message}: ${error.stack}`);
			segment?.addError(error);
			throw e;
		}
	} finally {
		segment?.close();
	}
}

export async function addFirehoseArnToBucketPolicy(
	registration: RegistrationEvent,
	aws: AwsApiCalls,
) {
	const segment = tracer
	.getSegment()
	?.addNewSubsegment("### addFirehoseArnToBucketPolicy");
	try {
		const getBucketPolicyResponse = await aws.getBucketPolicy({
			Bucket: process.env.EVENT_BUCKET_NAME,
		});
		logger.debug(
			`getBucketPolicyResponse: ${JSON.stringify(getBucketPolicyResponse)}`,
		);
		const policyString = generatePolicy(getBucketPolicyResponse.Policy != undefined ? JSON.parse(getBucketPolicyResponse.Policy) : undefined, registration)
		logger.info(`Setting BucketPolicy: ${policyString}`);
		await aws.putBucketPolicy({
			Bucket: process.env.EVENT_BUCKET_NAME,
			Policy: policyString,
		});
	} catch (e) {
		const error = e as Error;

		if (error.name == "NoSuchBucketPolicy") {
			const policyString = generatePolicy(undefined, registration)
			logger.info(`Setting BucketPolicy: ${policyString}`);
			await aws.putBucketPolicy({
				Bucket: process.env.EVENT_BUCKET_NAME,
				Policy: policyString,
			});
		} else {
			logger.error(`${error.name} - ${error.message}: ${error.stack}`);
			segment?.addError(error);
			throw e;
		}
	} finally {
		segment?.close();
	}
}

function generatePolicy(policy: Record<string, any | undefined> | undefined, registration: RegistrationEvent): string {
	if (policy == undefined) {
		policy = {
			Version: "2012-10-17",
			Statement: [
				sid0(registration),
				sid1(registration)
			],
		};
	} else {
		const statements = policy?.Statement as Array<Record<string, any | undefined>>;
		const [sid0Idx, sid0] = statement0(policy, registration)
		if (sid0Idx != -1) {
			statements[sid0Idx] = sid0
		} else {
			statements.push(sid0)
		}
		const [sid1Idx, sid1] = statement1(policy, registration)
		if (sid1Idx != -1) {
			statements[sid1Idx] = sid1
		} else {
			statements.push(sid1)
		}

	}
	return JSON.stringify(policy, null, 0);
}

function statement0(policy: Record<string, any | undefined>, registration: RegistrationEvent): [number, Record<string, any | undefined>] {
	const statements = policy?.Statement as Array<any>;
	let tenantStatement0Idx = statements.findIndex((value) => {
		return value.Sid == `${registration.accountId}-0`
	});
	if (tenantStatement0Idx != -1) {
		logger.debug(`Found statement for tenantId: ${registration.tenantId}`);
		return [tenantStatement0Idx, sid0(registration)]

	} else {
		logger.debug(
			`No existing statement0 for tenantId: ${registration.tenantId}`,
		);
		return [-1, sid0(registration)]
	}
}

function statement1(policy: Record<string, any | undefined>, registration: RegistrationEvent): [number, Record<string, any | undefined>] {
	const statements = policy?.Statement as Array<any>;
	let tenantStatement0Idx = statements.findIndex((value) => {
		return value.Sid == `${registration.accountId}-1`
	});
	if (tenantStatement0Idx != -1) {
		logger.debug(`Found statement for tenantId: ${registration.tenantId}`);
		return [tenantStatement0Idx, sid1(registration)]

	} else {
		logger.debug(
			`No existing statement0 for tenantId: ${registration.tenantId}`,
		);
		return [-1, sid1(registration)]
	}
}

function sid0(registration: RegistrationEvent) {
	return {
		Sid: `${registration.accountId}-0`,
		Principal: {
			AWS: [registration.deliveryStreamRoleArn],
		},
		Effect: "Allow",
		Action: ["s3:AbortMultipartUpload",
			"s3:GetBucketLocation",
			"s3:GetObject",
			"s3:ListBucket",
			"s3:ListBucketMultipartUploads",
			"s3:PutObject",
			"s3:PutObjectAcl"],
		Resource: [`arn:aws:s3:::${process.env.EVENT_BUCKET_NAME}`, `arn:aws:s3:::${process.env.EVENT_BUCKET_NAME}/accountId=${registration.accountId}/*`],

	}
}

function sid1(registration: RegistrationEvent) {
	return {
		Sid: `${registration.accountId}-1`,
		Principal: {
			AWS: [registration.deliveryStreamRoleArn],
		},
		Effect: "Allow",
		Action: ["s3:PutObject"],
		Resource: [`arn:aws:s3:::${process.env.EVENT_BUCKET_NAME}/accountId=${registration.accountId}/*`],
		Condition: {
			StringEquals: {
				"s3:x-amz-acl": "bucket-owner-full-control"
			}
		}
	}
}

export const onEventHandler: SQSHandler = async (
	event: SQSEvent,
	//@ts-ignore
	context: Context,
	//@ts-ignore
	callback: Callback,
	aws: AwsApiCalls = Aws.instance({}, tracer),
): Promise<SQSBatchResponse | undefined> => {
	console.log(`Event: ${JSON.stringify(event)}`);
	return processPartialResponse(event, recordHandlerFactory(aws), processor, {
		context,
	});
};

//@ts-ignore
export const onEvent = middy(onEventHandler)
.use(captureLambdaHandler(tracer))
.use(logMetrics(metrics, {captureColdStartMetric: true}));
