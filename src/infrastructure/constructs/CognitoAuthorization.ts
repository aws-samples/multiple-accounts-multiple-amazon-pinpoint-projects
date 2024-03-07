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

import {Construct, Dependable, IDependable} from "constructs";
import {AdvancedSecurityMode, CfnUserPoolGroup, CfnUserPoolUser, CfnUserPoolUserToGroupAttachment, OAuthScope, ResourceServerScope, UserPool, UserPoolDomain} from "aws-cdk-lib/aws-cognito";
import {AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId} from "aws-cdk-lib/custom-resources";
import {Aws, CfnOutput, Duration} from "aws-cdk-lib";
import {CustomDomainOptions} from "aws-cdk-lib/aws-cognito/lib/user-pool-domain";
import {CnameRecord, IHostedZone} from "aws-cdk-lib/aws-route53";


export interface CognitoAuthorizationConfig {
	customDomain?: CustomDomainOptions;
	hostedZone?: IHostedZone;
	apiTempPassword?: string

}

export class CognitoAuthorization extends Construct implements IDependable {
	readonly userPool: UserPool;
	readonly customUserPoolDomain: UserPoolDomain | undefined;

	constructor(scope: Construct, id: string, config: CognitoAuthorizationConfig) {
		super(scope, id);
		Dependable.implement(this, {
			dependencyRoots: [this],
		});
		this.node.addValidation({
			validate(): string[] {
				const messages: string[] = [];
				if (config.customDomain != undefined && config.hostedZone == undefined) {
					messages.push("You must specify hostedZone if customDomain is set")
				}
				if (config.customDomain != undefined && config.hostedZone == undefined) {
					messages.push("You must specify customDomain if hostedZone is set")
				}

				if (config.apiTempPassword != undefined && !new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\\$%\\^&\\*])(.{9,})$").test(config.apiTempPassword)) {
					messages.push("The temp password for the API admin user must be at least 9 characters long, include digits, both lower and uppercase letters as well as symbols.")
				}

				return messages;
			},
		});
		const userPoolName = 'pinpoint-management-account-user-pool'
		this.userPool = new UserPool(this, 'UserPool', {
			userPoolName: userPoolName,
			advancedSecurityMode: AdvancedSecurityMode.ENFORCED,
			passwordPolicy: {
				minLength: 9,
				requireDigits: true,
				requireLowercase: true,
				requireSymbols: true,
				requireUppercase: true,
				tempPasswordValidity: Duration.days(1)
			}
		});


		const adminScope = new ResourceServerScope({
			scopeName: "Admin",
			scopeDescription: "Admin Scope"
		})
		const adminResourceServer = this.userPool.addResourceServer("ApiResourceServer", {
			identifier: "api",
			scopes: [adminScope],
			userPoolResourceServerName: "ApiResourceServer"

		})
		const implicitClient = this.userPool.addClient('ImplicitClient', {
			authFlows: {
				userSrp: false,
				userPassword: true,
				adminUserPassword: false,
				custom: false
			},
			userPoolClientName: `${userPoolName}-implicit-client`,
			oAuth: {
				flows: {
					implicitCodeGrant: true,
					clientCredentials: false,
					authorizationCodeGrant: false,
				},
				scopes: [OAuthScope.resourceServer(adminResourceServer, adminScope)],
				callbackUrls: ['https://oauth.pstmn.io/v1/callback'],

			},
		});
		const clientCredentialsClient = this.userPool.addClient('ClientCredentialsClient', {
			authFlows: {
				userSrp: false,
				userPassword: true,
				adminUserPassword: false,
				custom: false
			},
			generateSecret: true,
			userPoolClientName: `${userPoolName}-client-credentials-client`,
			oAuth: {
				flows: {
					implicitCodeGrant: false,
					clientCredentials: true,
					authorizationCodeGrant: false,
				},
				scopes: [OAuthScope.resourceServer(adminResourceServer, adminScope)],
				callbackUrls: ['https://oauth.pstmn.io/v1/callback'],

			},
		});
		const adminUserGroupAttachment = new CfnUserPoolUserToGroupAttachment(this, 'AdminUserGroupAttachment', {
			groupName: 'Admin',
			username: 'admin',
			userPoolId: this.userPool.userPoolId,
		});
		const adminUser = new CfnUserPoolUser(this, 'AdminUser', {
			userPoolId: this.userPool.userPoolId,
			username: 'admin',
		});
		const adminGroup = new CfnUserPoolGroup(this, 'AdminGroup', {
			userPoolId: this.userPool.userPoolId,
			description: 'Administrator',
			groupName: 'Admin',
		});


		adminUserGroupAttachment.addDependency(adminUser)
		adminUserGroupAttachment.addDependency(adminGroup)
		if (config.apiTempPassword != undefined) {
			const adminSetPassword = new AwsCustomResource(this, 'AdminSetUserPassword', {
				onCreate: {
					service: 'CognitoIdentityServiceProvider',
					action: 'adminSetUserPassword',
					parameters: {
						UserPoolId: this.userPool.userPoolId,
						Username: 'admin',
						Password: config.apiTempPassword,
						Permanent: false,
					},
					physicalResourceId: PhysicalResourceId.of('AdminSetUserPassword'),
				},
				policy: AwsCustomResourcePolicy.fromSdkCalls({resources: AwsCustomResourcePolicy.ANY_RESOURCE}),
				installLatestAwsSdk: true,
			});
			adminSetPassword.node.addDependency(adminUser);
			new CfnOutput(this, "ApiAdminUsernameOutput", {
				key: "ApiAdminUsername",
				value: "admin"
			})
			new CfnOutput(this, "ApiAdminTempPasswordOutput", {
				key: "ApiAdminTempPassword",
				value: config.apiTempPassword
			})
		}
		this.userPool.addDomain('CognitoDomain', {
			cognitoDomain: {
				domainPrefix: `sms-${Aws.ACCOUNT_ID}`
			}
		});


		if (config.customDomain != undefined && config.hostedZone != undefined) {
			this.customUserPoolDomain = this.userPool.addDomain('CustomDomain', {
				customDomain: config.customDomain
			});
			const cname = new CnameRecord(this, "AuthCnameRecord", {
				recordName: config.customDomain.domainName,
				zone: config.hostedZone,
				domainName: this.customUserPoolDomain.cloudFrontDomainName
			})
			cname.node.addDependency(this.customUserPoolDomain)
			new CfnOutput(this, "UserPoolDomainBaseUrlOutput", {
				key: "UserPoolDomainBaseUrl",
				value: this.customUserPoolDomain.baseUrl()
			})
			new CfnOutput(this, "ImplicitClientLoginUrlOutput", {
				key: "ImplicitClientLoginUrl",
				value: this.customUserPoolDomain.signInUrl(implicitClient, {redirectUri: "https://oauth.pstmn.io/v1/callback"})
			})
		}

		new CfnOutput(this, "ImplicitClientIdOutput", {
			key: "ImplicitClientId",
			value: implicitClient.userPoolClientId
		})
		new CfnOutput(this, "ClientCredentialsClientIdOutput", {
			key: "ClientCredentialsClientId",
			value: clientCredentialsClient.userPoolClientId
		})


	}
}