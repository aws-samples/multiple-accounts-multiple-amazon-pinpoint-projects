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

import {Logger} from "@aws-lambda-powertools/logger";
import {logMetrics, Metrics} from "@aws-lambda-powertools/metrics";
import {captureLambdaHandler, Tracer} from "@aws-lambda-powertools/tracer";

import middy from "@middy/core";
import {CloudFormationCustomResourceEvent, CloudFormationCustomResourceHandler,} from "aws-lambda";
import {Aws, AwsApiCalls} from "./Aws";
import {sendResponse, Status} from "./CfnResponse";
import {PutEventsRequestEntry} from "@aws-sdk/client-eventbridge/dist-types/models/models_0";
import {REGISTRATION_EVENT_DETAIL_TYPE, REGISTRATION_EVENT_SOURCE} from "../index";

const logger = new Logger({
	serviceName: "TenantRegistration",
});
const metrics = new Metrics({
	namespace: process.env.METRIC_NAMESPACE!,
	serviceName: "TenantRegistration",
});
const tracer = new Tracer({
	serviceName: "TenantRegistration",
	enabled: true,
	captureHTTPsRequests: true,
});
const physicalResourceId = "TenantRegistration";
export const onEventHandler: CloudFormationCustomResourceHandler = async (
	event: CloudFormationCustomResourceEvent,
	//@ts-ignore
	context: Context,
	//@ts-ignore
	callback: Callback,
	aws: AwsApiCalls = Aws.instance({}, tracer),
): Promise<void> => {
	logger.info(`Event: ${JSON.stringify(event)}`);

	try {
		const detail = JSON.stringify({
			accountId: event.ResourceProperties.AccountId,
			region: event.ResourceProperties.Region,
			tenantId: event.ResourceProperties.TenantId,
			deliveryStreamRoleArn: event.ResourceProperties.DeliveryStreamRoleArn,
			eventName: event.RequestType,
		});
		const entry:PutEventsRequestEntry = {
			DetailType: REGISTRATION_EVENT_DETAIL_TYPE,
			Source: REGISTRATION_EVENT_SOURCE,
			EventBusName: event.ResourceProperties.EventBusName,
			Detail: detail,
			Resources:[event.StackId],
			Time: new Date()
		}
		switch (event.RequestType) {
		case "Create":

			logger.info(`Registering tenant: ${JSON.stringify(entry)}`);
			const createResponse = await aws.putEvents({
				Entries: [entry],
			});
			logger.info(`Response: ${JSON.stringify(createResponse)}`);

			await sendResponse(
				event,
				context,
				Status.SUCCESS,
				createResponse,
				physicalResourceId,
			);
			break;
		case "Delete":
			logger.info(`De-registering tenant: ${JSON.stringify(entry)}`);
			const deleteResponse = await aws.putEvents({
				Entries: [entry,
				],
			});
			logger.info(`Response: ${JSON.stringify(deleteResponse)}`);
			await sendResponse(
				event,
				context,
				Status.SUCCESS,
				deleteResponse,
				physicalResourceId,
			);
			break;
		case "Update":
			logger.info(`Updating tenant registration: ${JSON.stringify(entry)}`);
			const updateResponse = await aws.putEvents({
				Entries: [entry
				],
			});
			logger.info(`Response: ${JSON.stringify(updateResponse)}`);
			await sendResponse(
				event,
				context,
				Status.SUCCESS,
				updateResponse,
				physicalResourceId,
			);
			break;
		}
	} catch (e) {
		const error = e as Error;
		logger.error(error.name + "-" + error.message);
		await sendResponse(event, context, Status.FAILED, {}, physicalResourceId);
	}
};

export const onEvent = middy(onEventHandler)
.use(captureLambdaHandler(tracer))
.use(logMetrics(metrics, {captureColdStartMetric: true}));
