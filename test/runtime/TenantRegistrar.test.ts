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

import {addFirehoseArnToBucketPolicy} from "../../src/runtime/TenantRegistrar";
import {AwsApiCalls} from "../../src/runtime/Aws";
import {stubInterface} from "ts-sinon";
import {describe,  it} from 'vitest'

describe('TenantRegistrar', () => {
	it("addFirehoseArnToBucketPolicy", async () => {
		const event = {
			tenantId: "tenantName",
			accountId: "123456789123",
			region: "us-east-2",
			eventName: "Update",
			deliveryStreamRoleArn: "arn:aws:iam::123456789012:role/PinpointTenantAccountStac-PinpointTenantAccountMana-6SdjaAzksXt5"

		}

		const awsApiCalls = stubInterface<AwsApiCalls>()
		awsApiCalls.getBucketPolicy.returns(Promise.resolve({
			Policy: JSON.stringify({
				"Version": "2012-10-17",
				"Statement": [
					{
						"Sid": "tenantName0",
						"Effect": "Allow",
						"Principal": {
							"AWS": "arn:aws:iam::123456789012:role/PinpointTenantAccountStac-PinpointTenantAccountMana-6SdjaAzksXt5"
						},
						"Action": [
							"s3:AbortMultipartUpload",
							"s3:GetBucketLocation",
							"s3:GetObject",
							"s3:ListBucket",
							"s3:ListBucketMultipartUploads",
							"s3:PutObject",
							"s3:PutObjectAcl"
						],
						"Resource": [
							"arn:aws:s3:::pinpoint-event-stream-data-527929611278-us-east-1",
							"arn:aws:s3:::pinpoint-event-stream-data-527929611278-us-east-1/tenantName/*"
						]
					},
					{
						"Sid": "tenantName1",
						"Effect": "Allow",
						"Principal": {
							"AWS": "arn:aws:iam::123456789012:role/PinpointTenantAccountStac-PinpointTenantAccountMana-6SdjaAzksXt5"
						},
						"Action": "s3:PutObject",
						"Resource": "arn:aws:s3:::pinpoint-event-stream-data-527929611278-us-east-1/tenantName/*",
						"Condition": {
							"StringEquals": {
								"s3:x-amz-acl": "bucket-owner-full-control"
							}
						}
					}
				]
			}),
			$metadata: {

			}
		}))

		await addFirehoseArnToBucketPolicy(event, awsApiCalls);
		awsApiCalls.putBucketPolicy.calledOnceWithExactly({
			Bucket: undefined,
			Policy: "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"tenantName0\",\"Principal\":{\"AWS\":[\"arn:aws:iam::123456789012:role/PinpointTenantAccountStac-PinpointTenantAccountMana-6SdjaAzksXt5\"]},\"Effect\":\"Allow\",\"Action\":[\"s3:AbortMultipartUpload\",\"s3:GetBucketLocation\",\"s3:GetObject\",\"s3:ListBucket\",\"s3:ListBucketMultipartUploads\",\"s3:PutObject\",\"s3:PutObjectAcl\"],\"Resource\":[\"arn:aws:s3:::undefined\",\"arn:aws:s3:::undefined/tenantName/*\"]},{\"Sid\":\"tenantName1\",\"Principal\":{\"AWS\":[\"arn:aws:iam::123456789012:role/PinpointTenantAccountStac-PinpointTenantAccountMana-6SdjaAzksXt5\"]},\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\"],\"Resource\":[\"arn:aws:s3:::undefined/tenantName/*\"],\"Condition\":{\"StringEquals\":{\"s3:x-amz-acl\":\"bucket-owner-full-control\"}}}]}"
		})
	})

});