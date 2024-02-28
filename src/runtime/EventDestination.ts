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

import { Logger } from "@aws-lambda-powertools/logger";
import { logMetrics, Metrics } from "@aws-lambda-powertools/metrics";
import { captureLambdaHandler, Tracer } from "@aws-lambda-powertools/tracer";

import middy from "@middy/core";
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceHandler,
} from "aws-lambda";
import { Aws, AwsApiCalls } from "./Aws";
import { sendResponse, Status } from "./CfnResponse";

const logger = new Logger({
  serviceName: "EventDestination",
});
const metrics = new Metrics({
  namespace: process.env.METRIC_NAMESPACE!,
  serviceName: "EventDestination",
});
const tracer = new Tracer({
  serviceName: "EventDestination",
  enabled: true,
  captureHTTPsRequests: true,
});

export const onEventHandler: CloudFormationCustomResourceHandler = async (
  event: CloudFormationCustomResourceEvent,
  //@ts-ignore
  context: Context,
  //@ts-ignore
  callback: Callback,
  aws: AwsApiCalls = Aws.instance({}, tracer),
): Promise<void> => {
  logger.info(`Event: ${JSON.stringify(event)}`);
  let physicalResourceId: string | undefined = undefined;
  try {
    switch (event.RequestType) {
      case "Create":
        logger.info("Creating event destination");
        const createResponse = await aws.createEventDestination({
          ConfigurationSetName: event.ResourceProperties.ConfigurationSetName, // required
          EventDestinationName: event.ResourceProperties.EventDestinationName, // required
          MatchingEventTypes: event.ResourceProperties.MatchingEventTypes,
          CloudWatchLogsDestination:
            event.ResourceProperties.CloudWatchLogsDestination,
          KinesisFirehoseDestination:
            event.ResourceProperties.KinesisFirehoseDestination,
          SnsDestination: event.ResourceProperties.SnsDestination,
        });
        logger.info(`Response: ${JSON.stringify(createResponse)}`);
        physicalResourceId = `${createResponse.ConfigurationSetName}::${createResponse.EventDestination?.EventDestinationName}`;
        await sendResponse(
          event,
          context,
          Status.SUCCESS,
          createResponse,
          physicalResourceId,
        );
        break;
      case "Delete":
        physicalResourceId = event.PhysicalResourceId;
        logger.info(`Deleting event destination ${physicalResourceId}`);
        const [configurationSetName01, eventDestinationName01] =
          physicalResourceId.split("::");
        const deleteResponse = await aws.deleteEventDestination({
          ConfigurationSetName: configurationSetName01,
          EventDestinationName: eventDestinationName01,
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
        physicalResourceId = event.PhysicalResourceId;
        logger.info(`Updating event destination ${physicalResourceId}`);
        const [configurationSetName02, eventDestinationName02] =
          physicalResourceId.split("::");
        const updatePhonePoolResponse = await aws.updateEventDestination({
          ConfigurationSetName: configurationSetName02, // required
          EventDestinationName: eventDestinationName02,
          MatchingEventTypes: event.ResourceProperties.MatchingEventTypes,
          CloudWatchLogsDestination:
            event.ResourceProperties.CloudWatchLogsDestination,
          KinesisFirehoseDestination:
            event.ResourceProperties.KinesisFirehoseDestination,
          SnsDestination: event.ResourceProperties.SnsDestination,
          Enabled: event.ResourceProperties.Enabled,
        });
        logger.info(`Response: ${JSON.stringify(updatePhonePoolResponse)}`);
        await sendResponse(
          event,
          context,
          Status.SUCCESS,
          {},
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
  .use(logMetrics(metrics, { captureColdStartMetric: true }));
