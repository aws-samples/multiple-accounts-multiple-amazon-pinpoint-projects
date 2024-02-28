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

import {CrossAccountZoneDelegationRecord, HostedZone, PublicHostedZone, RecordSet, RecordTarget, RecordType, ZoneDelegationRecord} from "aws-cdk-lib/aws-route53";
import {Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {Certificate, CertificateValidation} from "aws-cdk-lib/aws-certificatemanager";

import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {Duration} from "aws-cdk-lib";
import {DefinitionBody, LogLevel, StateMachine, StateMachineType} from "aws-cdk-lib/aws-stepfunctions";
import path from "path";
import {ITable} from "aws-cdk-lib/aws-dynamodb";
import {AccessLogFormat, AuthorizationType, CognitoUserPoolsAuthorizer, DomainNameOptions, EndpointType, LogGroupLogDestination, MethodLoggingLevel, RestApi, StepFunctionsIntegration} from "aws-cdk-lib/aws-apigateway";
import {ApiGatewayDomain} from "aws-cdk-lib/aws-route53-targets";
import * as fs from "fs";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Runtime, Tracing} from "aws-cdk-lib/aws-lambda";
import {CognitoAuthorization} from "./CognitoAuthorization";
import {CustomDomainOptions} from "aws-cdk-lib/aws-cognito/lib/user-pool-domain";

// import * as fs from "fs";


export interface PinpointApiProxyConfig {
	apiHostName?: string
	apiTempPassword?: string

	parentHostedZoneId?: string
	parentHostedZoneName?: string
	crossAccountZoneDelegationRoleArn?: string
	apiStageName?: string
	pinpointTenantsTable: ITable
}

export class PinpointApiProxy extends Construct implements IDependable {
	readonly api: RestApi

	constructor(scope: Construct, id: string, config: PinpointApiProxyConfig) {
		super(scope, id);
		Dependable.implement(this, {
			dependencyRoots: [this],
		});
		this.node.addValidation({
			validate(): string[] {
				const messages: string[] = [];
				if (apiHostName != undefined && config.parentHostedZoneId == undefined) {
					messages.push("If you are specifying apiHostName then you must specify a parentHostedZoneId")
				}

				if (config.crossAccountZoneDelegationRoleArn != undefined && config.parentHostedZoneId == undefined) {
					messages.push("You must specify parentHostedZoneId if crossAccountZoneDelegationRoleArn is set")
				}
				if (config.crossAccountZoneDelegationRoleArn == undefined) {
					if (config.parentHostedZoneName != undefined && config.parentHostedZoneId == undefined) {
						messages.push("If crossAccountZoneDelegationRoleArn is not set you must specify both parentHostedZoneName and parentHostedZoneId")
					} else if (config.parentHostedZoneName == undefined && config.parentHostedZoneId != undefined) {
						messages.push("If crossAccountZoneDelegationRoleArn is not set you must specify both parentHostedZoneName and parentHostedZoneId")
					}
				}
				return messages;
			},
		});
		const apiHostName = config.apiHostName;
		let domainNameOptions: DomainNameOptions | undefined = undefined
		let hostedZone: PublicHostedZone | undefined = undefined
		let cognitoCustomDomainOptions: CustomDomainOptions | undefined = undefined
		if (apiHostName != undefined) {
			hostedZone = new PublicHostedZone(this, 'PublicHostedZone', {
				zoneName: apiHostName,
			});
			if (config.crossAccountZoneDelegationRoleArn != undefined && config.parentHostedZoneId !== undefined) {
				const delegationRole = Role.fromRoleArn(
					this,
					'CrossAccountZoneDelegationRole',
					config.crossAccountZoneDelegationRoleArn,
				)
				new CrossAccountZoneDelegationRecord(this, 'CrossAccountZoneDelegationRecord', {
					delegatedZone: hostedZone,
					delegationRole: delegationRole,
					parentHostedZoneId: config.parentHostedZoneId,
				});
			} else if (config.parentHostedZoneId !== undefined && config.parentHostedZoneName !== undefined) {
				const parentHostedZone = HostedZone.fromHostedZoneAttributes(this, "ParentHostedZone", {
					hostedZoneId: config.parentHostedZoneId,
					zoneName: config.parentHostedZoneName
				})
				new ZoneDelegationRecord(this, "HostedZoneDelegationRecord", {
					zone: parentHostedZone,
					recordName: apiHostName,
					nameServers: hostedZone.hostedZoneNameServers!,
				})
			}
			const cert = new Certificate(this, 'SslCert', {
				domainName: apiHostName,
				subjectAlternativeNames: [`auth.${apiHostName}`],
				validation: CertificateValidation.fromDns(hostedZone),
			});
			domainNameOptions = {
				endpointType: EndpointType.REGIONAL,
				certificate: cert,
				domainName: apiHostName,
			}

			cognitoCustomDomainOptions = {
				certificate: cert,
				domainName: `auth.${apiHostName}`
			}

		}

		const tenantRouterStateMachineLogGroup = new LogGroup(this, "TenantRouterStateMachineLogGroup", {
			retention: RetentionDays.ONE_MONTH
		})

		const tenantRouterStateMachineRole = new Role(this, "TenantRouterStateMachineRole", {
			assumedBy: new ServicePrincipal("states.amazonaws.com"),
			inlinePolicies: {
				"CanAssumePinpointManagementAccountAccessRole": new PolicyDocument({
					assignSids: true,
					statements: [new PolicyStatement({
						effect: Effect.ALLOW,
						actions: ["sts:AssumeRole"],
						resources: ["arn:aws:iam::*:role/PinpointManagementAccountAccessRole"]
					})]
				})
			}
		})
		config.pinpointTenantsTable.grantReadData(tenantRouterStateMachineRole)
		const inputValidationFnLogGroup = new LogGroup(this, "InputValidationFnLogGroup", {
			retention: RetentionDays.ONE_MONTH,
		});
		const inputValidationFn = new NodejsFunction(
			this,
			"InputValidationFn",
			{
				description: "Input Validation Function",
				memorySize: 256,
				timeout: Duration.seconds(30),
				runtime: Runtime.NODEJS_LATEST,
				handler: "index.onEvent",
				entry: path.join(__dirname, "..", "..", "runtime", "InputValidation.ts"),
				logGroup: inputValidationFnLogGroup,

				environment: {
					LOG_LEVEL: "DEBUG",
				},
				tracing: Tracing.ACTIVE,

			},
		);
		const integrationRequestFnLogGroup = new LogGroup(this, "IntegrationRequestFnLogGroup", {
			retention: RetentionDays.ONE_MONTH,
		});
		const integrationRequestFn = new NodejsFunction(
			this,
			"IntegrationRequestFn",
			{
				description: "Integration Request Function",
				memorySize: 256,
				timeout: Duration.seconds(30),
				runtime: Runtime.NODEJS_LATEST,
				handler: "index.onEvent",
				entry: path.join(__dirname, "..", "..", "runtime", "IntegrationRequest.ts"),
				logGroup: integrationRequestFnLogGroup,

				environment: {
					LOG_LEVEL: "DEBUG",
				},
				tracing: Tracing.ACTIVE,

			},
		);
		integrationRequestFn.grantInvoke(tenantRouterStateMachineRole)
		const tenantRouterStateMachine = new StateMachine(this, "TenantRouterStateMachine", {
			definitionBody: DefinitionBody.fromFile(path.join(__dirname, "..", "state-machines", "TenantRouterStateMachine.asl.json")),
			stateMachineName: "PinpointTenantRouterStateMachine",
			stateMachineType: StateMachineType.EXPRESS,
			timeout: Duration.seconds(30),
			tracingEnabled: true,
			logs: {
				destination: tenantRouterStateMachineLogGroup,
				level: LogLevel.ALL,
				includeExecutionData: true
			},
			role: tenantRouterStateMachineRole,
			definitionSubstitutions: {
				TABLE_NAME: config.pinpointTenantsTable.tableName,
				INPUT_VALIDATION_FN_ARN: inputValidationFn.functionArn,
				INTEGRATION_REQUEST_FN_ARN: integrationRequestFn.functionArn
			}
		})
		inputValidationFn.grantInvoke(tenantRouterStateMachineRole)

		const invokeStepFunctionsIntegrationRole = new Role(this, "InvokeStepFunctionsIntegrationRole", {
			assumedBy: new ServicePrincipal("apigateway.amazonaws.com")
		})
		tenantRouterStateMachine.grantStartExecution(invokeStepFunctionsIntegrationRole)

		const logGroup = new LogGroup(this, 'AccessLogs', {
			retention: RetentionDays.ONE_MONTH,
		});

		const cognitoAuthorization = new CognitoAuthorization(this, "CognitoAuthorization", {
			customDomain: cognitoCustomDomainOptions,
			hostedZone: hostedZone,

			apiTempPassword: config.apiTempPassword!
		})
		const auth = new CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
			cognitoUserPools: [cognitoAuthorization.userPool]
		});
		this.api = new RestApi(this, 'Api', {
			domainName: domainNameOptions,
			endpointConfiguration: {
				types: [EndpointType.REGIONAL]
			},
			deploy: true,
			restApiName: "PinpointTenantRouterApi",
			deployOptions: {
				accessLogDestination: new LogGroupLogDestination(logGroup),
				accessLogFormat: AccessLogFormat.clf(),
				tracingEnabled: true,
				loggingLevel: MethodLoggingLevel.INFO,
				stageName: config.apiStageName,
				metricsEnabled: true

			},

		});

		const stepfunctionsIntegration = StepFunctionsIntegration.startExecution(tenantRouterStateMachine, {
			credentialsRole: invokeStepFunctionsIntegrationRole,
			path: true,
			querystring: false,
			authorizer: true,
			useDefaultMethodResponses: true,

			// requestTemplates: {
			// 	"application/json": fs.readFileSync(path.join(__dirname, "..", "templates", "requests", "default.vm")).toString().replaceAll("\${STATE_MACHINE_ARN}", tenantRouterStateMachine.stateMachineArn)
			// },
			integrationResponses: [{
				statusCode: "200",
				selectionPattern: "2\\d{2}",
				responseTemplates: {
					"application/json": fs.readFileSync(path.join(__dirname, "..", "templates", "responses", "default.vm")).toString()
				}

			}, {
				statusCode: "400",
				selectionPattern: "4\\d{2}",
				responseTemplates: {
					"application/json": fs.readFileSync(path.join(__dirname, "..", "templates", "responses", "400.vm")).toString()
				}

			}, {
				statusCode: "500",
				selectionPattern: "5\\d{2}",
				responseTemplates: {
					"application/json": fs.readFileSync(path.join(__dirname, "..", "templates", "responses", "500.vm")).toString()
				}

			}]
		});
		const tenantResource = this.api.root.addResource("{tenantId}", {})
		const actionResource = tenantResource.addResource("{action}", {})
		actionResource.addMethod("POST", stepfunctionsIntegration, {
			authorizationType: AuthorizationType.COGNITO,
			authorizer: auth,
			authorizationScopes: ["api/Admin"]
		})
		if (hostedZone != undefined) {
			const aRecord = new RecordSet(this, 'ApiRecordSet', {
				recordType: RecordType.A,
				target: RecordTarget.fromAlias(new ApiGatewayDomain(this.api.domainName!)),
				zone: hostedZone,
			});
			if (cognitoAuthorization.customUserPoolDomain != undefined) {
				cognitoAuthorization.customUserPoolDomain.node.addDependency(aRecord)
			}

		}


	}
}