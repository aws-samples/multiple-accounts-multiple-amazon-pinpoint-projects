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

import { Stack, StackProps, Tags } from "aws-cdk-lib";

import {
  PinpointTenantAccount,
  PinpointTenantAccountConfig,
} from "../constructs/PinpointTenantAccount";
import {NagSuppressions} from "cdk-nag";
import {ProjectUsage} from "../constructs/ProjectUsage";
import {GIT_REPO_URL, PROJECT_NAME} from "../../index";

export interface PinpointTenantAccountStackProps
  extends StackProps,
    PinpointTenantAccountConfig {}

export class PinpointTenantAccountStack extends Stack {
	constructor(scope: any, id: string, props: PinpointTenantAccountStackProps) {
		super(scope, id, props);
		const tenant = new PinpointTenantAccount(this, "PinpointTenantAccount", props);
		ProjectUsage.on(this,{
			name: PROJECT_NAME,
			url: GIT_REPO_URL
		}).waitFor(tenant)
		Tags.of(this).add("Timestamp", new Date().toISOString());
		this.cdkNagSuppressions();
	}

  private cdkNagSuppressions() {
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-L1",
        reason: "Manually managing runtimes",
      },
      {
        id: "AwsSolutions-IAM5",
        reason: "Wildcard permissions allowed because the roles are scope with conditions or account principals",
      },
      {
        id: "AwsSolutions-IAM4",
        reason: "Managed policies ok",
      }

    ]);
    NagSuppressions.addResourceSuppressionsByPath(this,"/PinpointTenantAccountStack/PinpointTenantAccount/PinpointTenantRegistrationRuleDLQ/Resource",[{

        id: "AwsSolutions-SQS3",
        reason: "This is a DLQ for an EventBridge EventBus",

    }])

  }
}
