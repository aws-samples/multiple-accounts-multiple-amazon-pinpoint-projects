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

import { request as httpsRequest, RequestOptions } from "https";
import { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { URL } from "node:url";
import { parse as parseUrl } from "url";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";
import { CloudFormationCustomResourceResponseCommon } from "aws-lambda/trigger/cloudformation-custom-resource";

export enum Status {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

export interface HttpResponse {
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  body: string | undefined;
}

async function r(
  options: RequestOptions | string | URL,
  postData: string | undefined,
): Promise<HttpResponse> {
  return new Promise<HttpResponse>(function (resolve, reject) {
    const req = httpsRequest(
      options,
      function (incomingMessage: IncomingMessage) {
        const body: Uint8Array[] = [];
        incomingMessage.on("data", function (chunk) {
          body.push(chunk);
        });
        // resolve on end
        incomingMessage.on("end", function () {
          let bodyString: string | undefined = undefined;
          if (body.length > 0) {
            bodyString = body.join("");
          }
          const response: HttpResponse = {
            statusCode: incomingMessage.statusCode,
            headers: incomingMessage.headers,
            body: bodyString,
          };
          resolve(response);
        });
      },
    );
    // reject on request error
    req.on("error", function (err) {
      reject(err);
    });
    if (postData) {
      req.write(postData);
    }
    // IMPORTANT
    req.end();
  });
}

export async function sendWaitSignalResponse(
  responseStatus: Status,
  responseData: Record<string, any> = {},
  physicalResourceId: string | undefined = undefined,
  reason: String,
) {
  const url = process.env.WAIT_CONDITION_HANDLE!;

  const responseBody = {
    Status: responseStatus,
    UniqueId: physicalResourceId,
    Data: JSON.stringify(responseData),
    Reason: reason,
  };
  const responseBodyString = JSON.stringify(responseBody);
  console.log(`Sending wait signal response: ${responseBodyString} to ${url}`);
  const parsedUrl = parseUrl(url);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": responseBodyString.length,
    },
  };
  return r(options, responseBodyString);
}
export async function sendResponse(
  event: CloudFormationCustomResourceEvent,
  //@ts-ignore
  context: Context,
  responseStatus: Status,
  responseData: Record<string, any> = {},
  physicalResourceId: string | undefined = undefined,
  noEcho: boolean = false,
) {
  const responseBody = {
    Status: responseStatus,
    Reason:
      "See the details in CloudWatch Log Stream: " +
      context.logGroupName +
      "/" +
      context.logStreamName,
    PhysicalResourceId:
      physicalResourceId != undefined ? physicalResourceId : event.RequestId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    NoEcho: noEcho || false,
    Data: responseData,
  } as CloudFormationCustomResourceResponseCommon;

  const responseBodyString = JSON.stringify(responseBody);
  console.log(`Response: ${responseBodyString}`);
  const parsedUrl = parseUrl(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: "PUT",
    headers: {
      "content-type": "",
      "content-length": responseBodyString.length,
    },
  };
  return r(options, responseBodyString);
}
