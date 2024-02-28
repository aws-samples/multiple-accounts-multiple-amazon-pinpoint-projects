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
  serviceName: "PhonePool",
});
const metrics = new Metrics({
  namespace: process.env.METRIC_NAMESPACE!,
  serviceName: "PhonePool",
});
const tracer = new Tracer({
  serviceName: "PhonePool",
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
        logger.info(`Creating phone pool`);
        const createResponse = await aws.createPhonePool({
          IsoCountryCode: event.ResourceProperties.IsoCountryCode,
          MessageType: event.ResourceProperties.MessageType,
          OriginationIdentity: event.ResourceProperties.OriginationIdentity,
          Tags: event.ResourceProperties.Tags,
        });
        logger.info(`Response: ${JSON.stringify(createResponse)}`);
        physicalResourceId = createResponse.PoolId;
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
        logger.info(`Deleting phone pool ${physicalResourceId}`);
        const deleteResponse = await aws.deletePhonePool({
          PoolId: physicalResourceId,
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
        logger.info(`Updating phone pool ${physicalResourceId}`);
        const updateResponse = await aws.updatePhonePool({
          PoolId: physicalResourceId,
          DeletionProtectionEnabled:
            event.ResourceProperties.DeletionProtectionEnabled,
          OptOutListName: event.ResourceProperties.OptOutListName,
          SelfManagedOptOutsEnabled:
            event.ResourceProperties.SelfManagedOptOutsEnabled,
          SharedRoutesEnabled: event.ResourceProperties.SharedRoutesEnabled,
          TwoWayChannelArn: event.ResourceProperties.TwoWayChannelArn,
          TwoWayChannelRole: event.ResourceProperties.TwoWayChannelRole,
          TwoWayEnabled: event.ResourceProperties.TwoWayEnabled,
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
//@ts-ignore
export const onEvent = middy(onEventHandler)
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics, { captureColdStartMetric: true }));
