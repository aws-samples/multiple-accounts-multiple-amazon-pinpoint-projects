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

import {describe, expect, it} from "vitest";
import {onEventHandler} from "../../src/runtime/InputValidation";


describe('InputValidation', () => {
	it("DescribeRegistrationTypeDefinitions", async () => {
		const event = {
			"definition": {
				"required": [],
				"optional": [
					"RegistrationTypes",
					"Filters",
					"NextToken",
					"MaxResults",
					"SomeObject"
				]
			},
			"accountId": "123456789012",
			"input": [
				{
					"Key": "RegistrationTypes",
					"Value": ["US_TEN_DLC_BRAND_REGISTRATION"]
				},
				{
					"Key": "SomeObject",
					"Value": {"key": "somekey", "value": "somevalue"}
				}
			],
			"region": [
				"us-east-1"
			],
		}
		const reponse = await onEventHandler(event, {},
			//@ts-ignore
			(_error?, _result?) => {
			})
		expect(reponse).toEqual({
			"input": {
				"RegistrationTypes": [
					"US_TEN_DLC_BRAND_REGISTRATION"
				],
				"Filters": null,
				"NextToken": null,
				"MaxResults": null,
				"SomeObject": {
					"key": "somekey",
					"value": "somevalue"
				}
			},
			"accountId": "123456789012",
			"region": [
				"us-east-1"
			]
		})

	})

	it("PutRegistrationFieldValueForField", async () => {
		const event = {
			"accountId": "123456789012",
			"input": {
				"Key": "FieldValues[0]",
				"Value": [
					{
						"Key": "FieldPath",
						"Value": "companyInfo.companyName"
					},
					{
						"Key": "TextValue",
						"Value": "Galen Dunkleberger LLC"
					}
				]
			},
			"region": "us-east-1",
			"RegistrationId":"someId",

			"definition": {
				"required": [
					"FieldPath"
				],
				"optional": [
					"SelectChoices",
					"TextValue",
					"RegistrationAttachmentId"
				]
			}
		}
		const response = await onEventHandler(event, {},
			//@ts-ignore
			(_error?, _result?) => {
			})
		expect(response).toEqual({
			"input": {
				"FieldPath": "companyInfo.companyName",
				"SelectChoices": null,
				"TextValue": "Joe Smith LLC",
				"RegistrationAttachmentId": null
			},
			"accountId": "123456789012",
			"region": "us-east-1",
			"RegistrationId": "someId"

		})

	})

});

