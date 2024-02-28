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
import { Aws, CustomResource, Duration, RemovalPolicy } from "aws-cdk-lib";
import { IEventBus } from "aws-cdk-lib/aws-events";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct, Dependable, IDependable } from "constructs";

export interface TenantRegistrationConfig {
  deliveryStreamRoleArn?: string;
  eventBus: IEventBus;
  tenantId: string;
}

export class TenantRegistration extends Construct implements IDependable {
  constructor(scope: Construct, id: string, config: TenantRegistrationConfig) {
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
      "TenantRegistrationCustomResourceFnLogGroup",
      {
        retention: RetentionDays.ONE_MONTH,
      },
    );
    const customResourceFn = new NodejsFunction(
      this,
      "TenantRegistrationCustomResourceFn",
      {
        description: "TenantRegistration CustomResource Function",
        memorySize: 256,
        timeout: Duration.seconds(30),
        runtime: Runtime.NODEJS_LATEST,
        handler: "index.onEvent",
        entry: path.join(
          __dirname,
          "..",
          "..",
          "runtime",
          "TenantRegistration.ts",
        ),
        logGroup: logGroup,
        environment: {
          LOG_LEVEL: "DEBUG",
        },
        tracing: Tracing.ACTIVE,
      },
    );
    config.eventBus.grantPutEventsTo(customResourceFn);

    new CustomResource(this, "TenantRegistrationCustomResource", {
      serviceToken: customResourceFn.functionArn,
      removalPolicy: RemovalPolicy.DESTROY,
      properties: {
        AccountId: Aws.ACCOUNT_ID,
        Region: Aws.REGION,
        TenantId: config.tenantId,
        DeliveryStreamRoleArn: config.deliveryStreamRoleArn,
        EventBusName: config.eventBus.eventBusName,
        Timestamp: new Date().toISOString(),
      },
    });
  }
}
