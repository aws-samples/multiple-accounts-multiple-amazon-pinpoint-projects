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
import { IDeliveryStream } from "@aws-cdk/aws-kinesisfirehose-alpha";
import { EventType } from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { Aws, CustomResource, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Effect, IRole, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

import { ITopic } from "aws-cdk-lib/aws-sns";
import { Construct, Dependable, IDependable } from "constructs";

export interface EventDestinationConfig {
  configurationSetName: string; // required
  eventDestinationName: string; // required
  matchingEventTypes: EventType[];
}

export interface CloudWatchLogsEventDestinationConfig
  extends EventDestinationConfig {
  role: IRole;
  logGroup: LogGroup;
}

export interface KinesisFirehoseEventDestinationConfig
  extends EventDestinationConfig {
  streamWriterRole: IRole;
  destination: IDeliveryStream;
  bucketWriterRole: IRole;
}

export interface SnsEventDestinationConfig extends EventDestinationConfig {
  topic: ITopic;
}

export abstract class EventDestination
  extends Construct
  implements IDependable
{
  readonly name: string;
  protected customResourceFn: NodejsFunction;

  protected constructor(
    scope: Construct,
    id: string,
    properties: { [key: string]: any },
  ) {
    super(scope, id);
    Dependable.implement(this, {
      dependencyRoots: [this],
    });
    this.node.addValidation({
      validate(): string[] {
        const messages: string[] = [];

        return messages;
      },
    });

    const logGroup = new LogGroup(
      this,
      "EventDestinationCustomResourceFnLogGroup",
      {
        retention: RetentionDays.ONE_MONTH,
      },
    );
    this.customResourceFn = new NodejsFunction(
      this,
      "EventDestinationCustomResourceFn",
      {
        description: "EventDestination CustomResource Function",
        memorySize: 256,
        timeout: Duration.seconds(30),
        runtime: Runtime.NODEJS_LATEST,
        handler: "index.onEvent",
        entry: path.join(
          __dirname,
          "..",
          "..",
          "runtime",
          "EventDestination.ts",
        ),
        logGroup: logGroup,

        environment: {
          LOG_LEVEL: "DEBUG",
        },
        tracing: Tracing.ACTIVE,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["sms-voice:*EventDestination"],
            resources: [
              `arn:${Aws.PARTITION}:sms-voice:${Aws.REGION}:${Aws.ACCOUNT_ID}:configuration-set/*`,
            ],
          }),
        ],
      },
    );
    new CustomResource(this, "EventDestinationCustomResource", {
      serviceToken: this.customResourceFn.functionArn,
      removalPolicy: RemovalPolicy.DESTROY,
      properties: properties,
    });
    this.name = properties.EventDestinationName;
  }
}

export class CloudWatchLogsEventDestination extends EventDestination {
  constructor(
    scope: Construct,
    id: string,
    config: CloudWatchLogsEventDestinationConfig,
  ) {
    super(scope, id, {
      ConfigurationSetName: config.configurationSetName, // required
      EventDestinationName: config.eventDestinationName, // required
      MatchingEventTypes: config.matchingEventTypes,
      CloudWatchLogsDestination: {
        // CloudWatchLogsDestination
        IamRoleArn: config.role.roleArn, // required
        LogGroupArn: config.logGroup.logGroupArn, // required
      },
    });
    config.role.grantPassRole(this.customResourceFn.role!);
  }
}

export class KinesisFirehoseEventDestination extends EventDestination {
  readonly deliveryStreamArn: string;
  readonly streamWriterRoleArn: string;
  readonly bucketWriterRoleArn: string;

  constructor(
    scope: Construct,
    id: string,
    config: KinesisFirehoseEventDestinationConfig,
  ) {
    super(scope, id, {
      ConfigurationSetName: config.configurationSetName, // required
      EventDestinationName: config.eventDestinationName, // required
      MatchingEventTypes: config.matchingEventTypes,
      KinesisFirehoseDestination: {
        // CloudWatchLogsDestination
        IamRoleArn: config.streamWriterRole.roleArn, // required
        DeliveryStreamArn: config.destination.deliveryStreamArn, // required
      },
    });
    config.streamWriterRole.grantPassRole(this.customResourceFn.role!);
    this.deliveryStreamArn = config.destination.deliveryStreamArn;
    this.streamWriterRoleArn = config.streamWriterRole.roleArn;
    this.bucketWriterRoleArn = config.bucketWriterRole.roleArn;
  }
}

export class SnsEventDestination extends EventDestination {
  constructor(scope: Construct, id: string, config: SnsEventDestinationConfig) {
    super(scope, id, {
      ConfigurationSetName: config.configurationSetName, // required
      EventDestinationName: config.eventDestinationName, // required
      MatchingEventTypes: config.matchingEventTypes,
      SnsDestination: {
        // CloudWatchLogsDestination
        TopicArn: config.topic.topicArn,
      },
    });
  }
}
