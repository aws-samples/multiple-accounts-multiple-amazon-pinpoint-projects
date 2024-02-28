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
import {
  MessageType,
  NumberCapability,
  NumberType,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { Aws, CustomResource, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct, Dependable, IDependable } from "constructs";

export interface PhoneNumberConfig {
  isoCountryCode: string;
  messageType: MessageType;
  numberCapabilities: NumberCapability[];
  numberType: NumberType;
  poolId?: string;
  registrationId?: string;
  deletionProtectionEnabled?: boolean;
  optOutListName?: string;
}

export class PhoneNumber extends Construct implements IDependable {
  readonly phoneNumberId: string;
  readonly config: PhoneNumberConfig;
  constructor(scope: Construct, id: string, config: PhoneNumberConfig) {
    super(scope, id);
    this.config = config;
    Dependable.implement(this, {
      dependencyRoots: [this],
    });
    this.node.addValidation({
      validate(): string[] {
        const messages: string[] = [];
        if (
          config.numberType == NumberType.SIMULATOR &&
          config.messageType != MessageType.TRANSACTIONAL
        ) {
          messages.push(
            `NumberType SIMULATOR requires messageType TRANSACTIONAL`,
          );
        }
        return messages;
      },
    });

    const logGroup = new LogGroup(this, "PhoneNumberCustomResourceFnLogGroup", {
      retention: RetentionDays.ONE_MONTH,
    });
    const customResourceFn = new NodejsFunction(
      this,
      "PhoneNumberCustomResourceFn",
      {
        description: "PhoneNumber CustomResource Function",
        memorySize: 256,
        timeout: Duration.seconds(30),
        runtime: Runtime.NODEJS_LATEST,
        handler: "index.onEvent",
        entry: path.join(__dirname, "..", "..", "runtime", "PhoneNumber.ts"),
        logGroup: logGroup,

        environment: {
          LOG_LEVEL: "DEBUG",
        },
        tracing: Tracing.ACTIVE,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sms-voice:*PhoneNumber"],
            resources: [
              `arn:${Aws.PARTITION}:sms-voice:${Aws.REGION}:${Aws.ACCOUNT_ID}:phone-number/*`,
            ],
          }),
        ],
      },
    );

    const customResource = new CustomResource(
      this,
      "PhoneNumberCustomResource",
      {
        serviceToken: customResourceFn.functionArn,
        removalPolicy: RemovalPolicy.DESTROY,
        properties: {
          IsoCountryCode: config.isoCountryCode,
          MessageType: config.messageType,
          NumberCapabilities: config.numberCapabilities,
          NumberType: config.numberType,
          PoolId: config.poolId,
          RegistrationId: config.registrationId,
          DeletionProtectionEnabled: config.deletionProtectionEnabled,
          OptOutListName: config.optOutListName,
        },
      },
    );
    this.phoneNumberId = customResource.getAttString("PhoneNumberId");
  }
}
