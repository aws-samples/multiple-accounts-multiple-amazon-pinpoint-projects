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
import { MessageType, Tag } from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { Aws, CustomResource, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct, Dependable, IDependable } from "constructs";
import { PhoneNumber } from "./PhoneNumber";

export interface PhonePoolConfig {
  isoCountryCode: string;
  messageType: MessageType;
  originationIdentity: PhoneNumber | string;
  tags?: Tag[];
}

export class PhonePool extends Construct implements IDependable {
  readonly poolId: string;

  constructor(scope: Construct, id: string, config: PhonePoolConfig) {
    super(scope, id);
    Dependable.implement(this, {
      dependencyRoots: [this],
    });
    this.node.addValidation({
      validate(): string[] {
        const messages: string[] = [];
        if (config.originationIdentity instanceof PhoneNumber) {
          if (
            config.originationIdentity.config.messageType != config.messageType
          ) {
            messages.push(
              `The origination identity message type does not match the phone pool message type: ${config.originationIdentity.config.messageType} != ${config.messageType}`,
            );
          }
        }
        return messages;
      },
    });
    const logGroup = new LogGroup(this, "PhonePoolCustomResourceFnLogGroup", {
      retention: RetentionDays.ONE_MONTH,
    });
    const phonePoolCustomResourceFn = new NodejsFunction(
      this,
      "PhonePoolCustomResourceFn",
      {
        description: "PhonePool CustomResource Function",
        memorySize: 256,
        timeout: Duration.seconds(30),
        runtime: Runtime.NODEJS_LATEST,
        handler: "index.onEvent",
        entry: path.join(__dirname, "..", "..", "runtime", "PhonePool.ts"),
        logGroup: logGroup,

        environment: {
          LOG_LEVEL: "DEBUG",
        },
        tracing: Tracing.ACTIVE,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sms-voice:*Pool"],
            resources: [
              `arn:${Aws.PARTITION}:sms-voice:${Aws.REGION}:${Aws.ACCOUNT_ID}:pool/*`,
              `arn:${Aws.PARTITION}:sms-voice:${Aws.REGION}:${Aws.ACCOUNT_ID}:phone-number/*`,
            ],
          }),
        ],
      },
    );
    const originationIdentityString =
      config.originationIdentity instanceof PhoneNumber
        ? config.originationIdentity.phoneNumberId
        : config.originationIdentity;
    const customResource = new CustomResource(this, "PhonePoolCustomResource", {
      serviceToken: phonePoolCustomResourceFn.functionArn,
      removalPolicy: RemovalPolicy.DESTROY,
      properties: {
        IsoCountryCode: config.isoCountryCode,
        MessageType: config.messageType,
        OriginationIdentity: originationIdentityString,
        Tags: config.tags,
      },
    });
    this.poolId = customResource.getAttString("PoolId");
  }
}
