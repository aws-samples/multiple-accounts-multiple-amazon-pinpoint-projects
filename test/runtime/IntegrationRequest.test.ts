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
import {onEventHandler} from "../../src/runtime/IntegrationRequest";


describe('IntegrationRequest', () => {
	it("DescribeRegistrationTypeDefinitions", async () => {
		const event = {
			"body": {
				"RegistrationTypes": [
					"US_TEN_DLC_BRAND_REGISTRATION"
				]
			},
			"path": {
				"tenantId": "my-tenant-id",
				"action": "DescribeRegistrationTypeDefinitions"
			}
		}
		const reponse = await onEventHandler(event, {},
			//@ts-ignore
			(_error?, _result?) => {
			})
		expect(reponse).toEqual({
			"input": [
				{
					"Key": "RegistrationTypes",
					"Value": [
						"US_TEN_DLC_BRAND_REGISTRATION"
					]
				}
			],
			"path": {
				"tenantId": "my-tenant-id",
				"action": "DescribeRegistrationTypeDefinitions"
			}
		})

	})
	it("PutRegistrationFieldValue", async () => {
		const event = {
			"body": {
				"RegistrationId": "registration-973227d7ef704f5b9baedddca650f902",
				"FieldValues": [
					{
						"FieldPath": "companyInfo.companyName",
						"TextValue": "Galen Dunkleberger LLC"
					},
					{
						"FieldPath": "companyInfo.taxIdIssuingCountry",
						"TextValue": "US"
					}
				]
			},
			"path": {
				"tenantId": "my-tenant-id",
				"action": "PutRegistrationFieldValue"
			}
		};
		const response = await onEventHandler(event, {},
			//@ts-ignore
			(_error?, _result?) => {
			})
		expect(response).toEqual( {
			"input": [
				{
					"Key": "RegistrationId",
					"Value": "registration-973227d7ef704f5b9baedddca650f902"
				},
				{
					"Key": "FieldValues",
					"Value": [
						{
							"Key": "FieldValues[0]",
							"Value": [
								{
									"Key": "FieldPath",
									"Value": "companyInfo.companyName"
								},
								{
									"Key": "TextValue",
									"Value": "Joe Smith LLC"
								}
							]
						},
						{
							"Key": "FieldValues[1]",
							"Value": [
								{
									"Key": "FieldPath",
									"Value": "companyInfo.taxIdIssuingCountry"
								},
								{
									"Key": "TextValue",
									"Value": "US"
								}
							]
						}
					]
				}
			],
			"path": {
				"tenantId": "my-tenant-id",
				"action": "PutRegistrationFieldValue"
			}
		})

	})

});

