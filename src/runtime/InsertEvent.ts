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
import {Metrics} from "@aws-lambda-powertools/metrics";

import {Tracer} from "@aws-lambda-powertools/tracer";
import {captureLambdaHandler} from '@aws-lambda-powertools/tracer/middleware';
import {logMetrics} from '@aws-lambda-powertools/metrics/middleware';

import middy from "@middy/core";
import {SQSBatchResponse, SQSEvent, SQSRecord} from "aws-lambda";

import {SQSHandler} from "aws-lambda/trigger/sqs";
import {Aws, AwsApiCalls} from "./Aws";
import {ExecuteStatementCommandInput} from "@aws-sdk/client-rds-data";


const serviceName = "EventInsert";
const logger = new Logger({
	serviceName: serviceName,
});
const metrics = new Metrics({
	namespace: process.env.METRIC_NAMESPACE!,
	serviceName: serviceName,
});
const tracer = new Tracer({
	serviceName: serviceName,
	enabled: true,
	captureHTTPsRequests: true,
});

/*
{
  "eventType": "TEXT_BLOCKED",
  "eventVersion": "1.0",
  "eventTimestamp": 1737550671501,
  "isFinal": true,
  "destinationPhoneNumber": "+15707724799",
  "isoCountryCode": "US",
  "messageId": "1fdc2c24-69f6-458d-9e15-3d6f5e14f703",
  "messageRequestTimestamp": 1737550671412,
  "messageEncoding": "GSM",
  "messageType": "TRANSACTIONAL",
  "messageStatus": "BLOCKED",
  "messageStatusDescription": "Phone has blocked SMS",
  "totalMessageParts": 4,
  "totalMessagePrice": 0,
  "totalCarrierFee": 0,
  "protectConfiguration": {
    "protectConfigurationId": "protect-554ac06243454290818970dcc518f467",
    "protectStatus": "ALLOW"
  },
  "accountId": "200982613275"
}
 */
interface EndUserMessagingEvent {
	eventType: string,
	eventVersion: string,
	eventTimestamp: number,
	isFinal: boolean,
	originationPhoneNumber?: string,
	destinationPhoneNumber: string,
	isoCountryCode: string,
	messageId: string,
	messageRequestTimestamp: number,
	messageEncoding: string,
	messageType: string,
	messageStatus: string,
	messageStatusDescription: string,
	totalMessageParts: number,
	totalMessagePrice: number,
	totalCarrierFee: number,
	protectConfiguration?: {
		protectConfigurationId: string,
		protectStatus: string
	}
	accountId: string | undefined
}

interface S3EventRecord {
	eventVersion: string;
	eventSource: string;
	awsRegion: string;
	eventTime: string;
	eventName: string;
	s3: {
		bucket: {
			name: string;
			arn: string;
		};
		object: {
			key: string;
			size: number;
			eTag: string;
		};
	};
}

const sqsProcessor = new BatchProcessor(EventType.SQS);
type SQSRecordHandler = (record: SQSRecord) => Promise<void>;
const sqsRecordHandlerFactory = (aws: AwsApiCalls): SQSRecordHandler => {
	return async (record: SQSRecord): Promise<void> => {
		try {
			// Unwrap SNS message from SQS
			const snsMessage = JSON.parse(record.body);

			// Unwrap S3 event from SNS message
			const s3Event = JSON.parse(snsMessage.Message);

			// Process each S3 record
			for (const s3Record of s3Event.Records) {
				await processS3Event(s3Record, aws);
			}
		} catch (error) {
			logger.error('Error processing record', {
				error: error instanceof Error ? error.message : error,
				// If error is Error object, include stack trace
				errorStack: error instanceof Error ? error.stack : undefined
			});
			throw error; // Batch processor will handle the failure
		}
	};
};

async function processS3Event(s3Record: S3EventRecord, aws: AwsApiCalls) {
	try {

		// Decode the URI-encoded key
		const decodedKey = decodeURIComponent(s3Record.s3.object.key);
		const accountId = extractAccountId(decodedKey);
// Your processing logic here
		logger.debug(`Attempting to retrieve file ${decodedKey} from bucket ${s3Record.s3.bucket.name}`);
		// Get the object from S3
		const getObjectResponse = await aws.getObject({
			Bucket: s3Record.s3.bucket.name,
			Key: decodedKey,
		});

		// Get the object body as string
		const objectBody = await getObjectResponse.Body?.transformToString();

		if (objectBody) {
			// Split by newline and filter out empty lines
			const endUserMessagingEvents: EndUserMessagingEvent[] = objectBody
			.split('\n')
			.filter(line => line.trim() !== '')
			.map(line => JSON.parse(line));

			// Now jsonObjects is an array of parsed JSON objects
			for (const event of endUserMessagingEvents) {
				event.accountId = accountId
				await processEndUserMessagingEvent(event, aws);
			}
		} else {
			throw new Error(`No object body found for ${decodedKey} from bucket ${s3Record.s3.bucket.name}`);
		}
	} catch (error) {
		logger.error(`Error processing S3 event: ${error}`);
		throw error;
	}

}

function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp);

	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	const hours = String(date.getUTCHours()).padStart(2, '0');
	const minutes = String(date.getUTCMinutes()).padStart(2, '0');
	const seconds = String(date.getUTCSeconds()).padStart(2, '0');
	const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function extractAccountId(objectKey: string): string | undefined {
	const accountIdMatch = objectKey.match(/accountId=(\d+)/);
	if (accountIdMatch && accountIdMatch[1]) {
		return accountIdMatch[1];
	}
	return undefined
}

async function processEndUserMessagingEvent(event: EndUserMessagingEvent, aws: AwsApiCalls) {
	// Your processing logic here
	logger.debug(`Processing event: ${JSON.stringify(event)}`);
	const params: ExecuteStatementCommandInput = {
		resourceArn: process.env.DB_CLUSTER_ARN,
		secretArn: process.env.DB_SECRET_ARN,
		database: process.env.DB_NAME,
		sql:
			`INSERT INTO messaging_events (event_type, event_version, event_timestamp, is_final,
                                     origination_phone_number, destination_phone_number, iso_country_code,
                                     message_id, message_request_timestamp, message_encoding, message_type,
                                     message_status, message_status_description, total_message_parts,
                                     total_message_price, total_carrier_fee, protect_configuration_id,
                                     protect_status,account_id)
       VALUES (:eventType, :eventVersion, :eventTimestamp, :isFinal,
               :originationPhoneNumber, :destinationPhoneNumber, :isoCountryCode,
               :messageId, :messageRequestTimestamp, :messageEncoding, :messageType,
               :messageStatus, :messageStatusDescription, :totalMessageParts,
               :totalMessagePrice, :totalCarrierFee, :protectConfigurationId,
               :protectStatus,:accountId)`,
		parameters: [
			{name: 'eventType', value: {stringValue: event.eventType}},
			{name: 'eventVersion', value: {stringValue: event.eventVersion}},
			{name: 'eventTimestamp', value: {stringValue: formatTimestamp(event.eventTimestamp)}, typeHint: "TIMESTAMP"},
			{name: 'isFinal', value: {booleanValue: event.isFinal}},
			{name: 'originationPhoneNumber', value: event.originationPhoneNumber ? {stringValue: event.originationPhoneNumber} : {isNull: true} },
			{name: 'destinationPhoneNumber', value: {stringValue: event.destinationPhoneNumber}},
			{name: 'isoCountryCode', value: {stringValue: event.isoCountryCode}},
			{name: 'messageId', value: {stringValue: event.messageId}},
			{name: 'messageRequestTimestamp', value: {stringValue: formatTimestamp(event.messageRequestTimestamp)}, typeHint: "TIMESTAMP"},
			{name: 'messageEncoding', value: {stringValue: event.messageEncoding}},
			{name: 'messageType', value: {stringValue: event.messageType}},
			{name: 'messageStatus', value: {stringValue: event.messageStatus}},
			{name: 'messageStatusDescription', value: {stringValue: event.messageStatusDescription}},
			{name: 'totalMessageParts', value: {longValue: event.totalMessageParts}},
			{name: 'totalMessagePrice', value: {doubleValue: event.totalMessagePrice}},
			{name: 'totalCarrierFee', value: {doubleValue: event.totalCarrierFee}},
			{name: 'protectConfigurationId',  value: event.protectConfiguration ? {stringValue: event.protectConfiguration.protectConfigurationId} : {isNull: true} },
			{name: 'protectStatus', value: event.protectConfiguration ? {stringValue: event.protectConfiguration.protectStatus} : {isNull: true} },
			{name: 'accountId', value: event.accountId ? {stringValue: event.accountId} : {isNull: true}}
		]
	};


	try {
		logger.debug(`Executing SQL: ${JSON.stringify(params)}`);
		const result = await aws.executeStatement(params);
		if (result.$metadata.httpStatusCode !== 200) {
			logger.error(`Error inserting event: ${JSON.stringify(result)}`);
			throw new Error(`Error inserting event: ${JSON.stringify(result)}`);
		} else {
			logger.debug(`Inserted event: ${JSON.stringify(result)}`);
		}

	} catch (error) {
		console.error('Error inserting event:', error);
		throw error;
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
	return processPartialResponse(event, sqsRecordHandlerFactory(aws), sqsProcessor, {
		context,
	});
};

//@ts-ignore
export const onEvent = middy(onEventHandler)
.use(captureLambdaHandler(tracer))
.use(logMetrics(metrics, {captureColdStartMetric: true}));
