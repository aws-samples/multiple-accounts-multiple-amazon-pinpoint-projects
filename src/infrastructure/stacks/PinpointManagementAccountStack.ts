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

import {Stack, StackProps, Tags} from "aws-cdk-lib";
import {PinpointManagementAccount, PinpointManagementAccountConfig} from "../constructs/PinpointManagementAccount";
import {NagSuppressions} from "cdk-nag";
import {ProjectUsage} from "../constructs/ProjectUsage";
import {GIT_REPO_URL, PROJECT_NAME} from "../../index";


export interface PinpointManagementAccountStackProps extends StackProps, PinpointManagementAccountConfig {

}

export class PinpointManagementAccountStack extends Stack {
	constructor(
		scope: any,
		id: string,
		props: PinpointManagementAccountStackProps,
	) {
		super(scope, id, props);
		const managment=new PinpointManagementAccount(this, "PinpointManagementAccount", props);
		ProjectUsage.on(this,{
			name: PROJECT_NAME,
			url: GIT_REPO_URL
		}).waitFor(managment)
		Tags.of(this).add("Solution", PROJECT_NAME);
		Tags.of(this).add(
			"Url",
			GIT_REPO_URL,
		);
		this.cdkNagSuppressions()
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
			},
			{
				id: "AwsSolutions-APIG2",
				reason: "Request validation is handled in the step function",
			},
			{
				id: "AwsSolutions-APIG4",
				reason: "No authorization on api, allow customer to choose authorization types",
			},
			{
				id: "AwsSolutions-COG2",
				reason: "No MFA required for example authorization",
			},{
				id: "AwsSolutions-APIG3",
				reason: "No  WAFv2 web ACL on api, allow customer to choose if they want to enable",
			}


		]);
	}
}
