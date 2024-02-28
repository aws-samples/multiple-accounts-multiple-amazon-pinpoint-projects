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
import {execSync} from "node:child_process";


/**
 * This is an integration test meant to be run against a deployed endpoint
 */
describe.skip('Auth', () => {
	/**
	 * This integration test assumes that you have deployed the PinpointManagementAccountStack
	 * and at least one instance of the PinpointTenantAccountStack.
	 * The point of this test is to show that the access token from Cognito can only be used to access
	 * mapped api calls and can't be used to make just any aws api call.
	 *
	 *    The following environment variables need to be set to run this test
	 *
	 * 	- PMA_COGNITO_AUTH_DOMAIN = the custom cognito domain https://<domainPrefix>.auth.<region>.amazoncognito.com
	 * 	- PMA_ENDPOINT_URL  = the custom cognito domain https://<domainPrefix>.auth.<region>.amazoncognito.com
	 * 	- PTA_TENANT_ID = The tenand id specified in the PinpointTenantAccountStack deployment
	 * 	- PMA_CLIENT_SECRET = Cognito client secret for the pinpoint-management-account-user-pool-client-credentials-client
	 * 	- PMA_CLIENT_ID = Cognito client id for the pinpoint-management-account-user-pool-client-credentials-client
	 */
	it("Endpoint cannot be invoked without credentials", async () => {
		const endPoint: string | undefined = process.env.PMA_ENDPOINT_URL
		expect(endPoint, "Set environment variable PMA_ENDPOINT_URL").toBeDefined()
		const status = execSync(`curl -s ${endPoint}  -w '%{http_code}' -o /dev/null`).toString("utf8")
		expect(status).toEqual("403")
	})
	it("Cannot invoke other APIs with the credentials", async () => {
		const cognitoAuthDomain: string | undefined = process.env.PMA_COGNITO_AUTH_DOMAIN
		const endPoint: string | undefined = process.env.PMA_ENDPOINT_URL
		const tenantId: string | undefined = process.env.PTA_TENANT_ID
		const clientSecret: string | undefined = process.env.PMA_CLIENT_SECRET
		const clientId: string | undefined = process.env.PMA_CLIENT_ID
		expect(tenantId, "Set environment variable PTA_TENANT_ID").toBeDefined()
		expect(cognitoAuthDomain, "Set environment variable PMA_COGNITO_AUTH_DOMAIN").toBeDefined()
		expect(endPoint, "Set environment variable PMA_ENDPOINT_URL").toBeDefined()
		expect(clientSecret, "Set environment variable PMA_CLIENT_SECRET").toBeDefined()
		expect(clientId, "Set environment variable PMA_ENDPOINT_CLIENT_ID").toBeDefined()
		//get the access token from Cognito
		const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
		const curlOauthToken = `curl --location "${cognitoAuthDomain}/oauth2/token" --header "Content-Type: application/x-www-form-urlencoded" --header "Authorization: Basic ${basicAuth}" --data-urlencode "grant_type=client_credentials" --data-urlencode "scope=api/Admin"  `
		console.log(curlOauthToken)
		const curlOauthTokenResponse = execSync(curlOauthToken).toString("utf8")
		console.log(curlOauthTokenResponse)
		const token = JSON.parse(curlOauthTokenResponse)
		const curlDescribeRegistrations = `curl -s --location --request POST '${endPoint}/${tenantId}/DescribeRegistrations' --header 'Authorization: Bearer ${token.access_token}'  -w '%{http_code}' -o /dev/null`
		const curlDescribeRegistrationsResponse = execSync(curlDescribeRegistrations).toString("utf8")
		expect(curlDescribeRegistrationsResponse).toEqual("200")
		//try to hit an IAM api (ListRoles)
		const curlListRoles = `curl -s --location --request POST '${endPoint}/${tenantId}/ListRoles' --header 'Authorization: Bearer ${token.access_token}'  -w '%{http_code}' -o /dev/null`
		const curlListRolesResponse = execSync(curlListRoles).toString("utf8")
		//it doesn't work
		expect(curlListRolesResponse).toEqual("404")
		//try to hit an unmapped pinpoint api (DescribeOptedOutNumbers)
		const curlDescribeOptedOutNumbers = `curl -s --location --request POST '${endPoint}/${tenantId}/DescribeOptedOutNumbers' --header 'Authorization: Bearer ${token.access_token}'  -w '%{http_code}' -o /dev/null`
		const curlDescribeOptedOutNumbersResponse = execSync(curlDescribeOptedOutNumbers).toString("utf8")
		//it doesn't work
		expect(curlDescribeOptedOutNumbersResponse).toEqual("404")
	})
})