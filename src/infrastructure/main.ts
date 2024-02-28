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

import {EventType} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import {App, Aspects} from "aws-cdk-lib";

import {PinpointManagementAccountStack} from "./stacks/PinpointManagementAccountStack";
import {PinpointTenantAccountStack} from "./stacks/PinpointTenantAccountStack";
import {AwsSolutionsChecks} from "cdk-nag";

const app = new App();
const stack = app.node.tryGetContext("stack");
console.log(`Deploying ${stack}`);
if (stack == "PinpointManagementAccountStack") {
	const organizationId = app.node.tryGetContext("organizationId");
	const apiHostName = app.node.tryGetContext("apiHostName");
	const parentHostedZoneId = app.node.tryGetContext("parentHostedZoneId");
	const parentHostedZoneName = app.node.tryGetContext("parentHostedZoneName");

	const apiTempPassword = app.node.tryGetContext("apiTempPassword");
	const crossAccountZoneDelegationRoleArn = app.node.tryGetContext("crossAccountZoneDelegationRoleArn");
	const apiStageName = app.node.tryGetContext("apiStageName");

	app.node.addValidation({
		validate(): string[] {
			const messages: string[] = [];
			if (organizationId == undefined) {
				messages.push("organizationId is required")
			}
			return messages;

		}
	})
	if (app.node.validate().length == 0) {
		new PinpointManagementAccountStack(app, "PinpointManagementAccountStack", {
			organizationId: organizationId,
			api: {
				apiHostName: apiHostName,
				parentHostedZoneId: parentHostedZoneId,
				parentHostedZoneName: parentHostedZoneName,
				crossAccountZoneDelegationRoleArn: crossAccountZoneDelegationRoleArn,
				apiStageName: apiStageName,
				apiTempPassword:apiTempPassword,

			}

		});
	}
} else if (stack == "PinpointTenantAccountStack") {
	const tenantId = app.node.tryGetContext("tenantId");
	const managementAccountId = app.node.tryGetContext("managementAccountId");
	const eventStreamingBucketName = app.node.tryGetContext("eventStreamingBucketName");
	const targetEventBusArn = app.node.tryGetContext("targetEventBusArn");

	app.node.addValidation({
		validate(): string[] {
			const messages: string[] = [];
			if (tenantId == undefined) {
				messages.push("tenantId is required")
			}
			if (managementAccountId == undefined) {
				messages.push("managementAccountId is required")
			}
			if (eventStreamingBucketName == undefined) {
				messages.push("eventStreamingBucketName is required")
			}
			if (targetEventBusArn == undefined) {
				messages.push("targetEventBusArn is required")
			}
			return messages;

		}
	})
	if (app.node.validate().length == 0) {
		new PinpointTenantAccountStack(app, "PinpointTenantAccountStack", {
			tenantId: tenantId,

			managementAccountId: managementAccountId,
			eventStreamingBucketName: eventStreamingBucketName,
			targetEventBusArn: targetEventBusArn,
			phonePool: {
				isoCountryCode: "US",
				messageType: "TRANSACTIONAL",
				originationIdentity: {
					numberType: "SIMULATOR",
					numberCapabilities: ["SMS"],
					deletionProtectionEnabled: false,
					messageType: "TRANSACTIONAL",
					isoCountryCode: "US",
				},
			},
			configurationSet: {
				configurationSetName: "Default",
				eventDestination: {
					eventDestinationName: "Default",
					matchingEventTypes: [EventType.ALL],
					enableSnsDestination: false,
					enableKinesisFirehoseDestination: true,
					enableCloudwatchLogsDestination: true,
				},
			},
		});

	}
}
Aspects.of(app).add(new AwsSolutionsChecks())
app.synth();
