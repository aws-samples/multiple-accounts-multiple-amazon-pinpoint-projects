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

import {awscdk, javascript} from "projen";
import {ReleaseTrigger} from "projen/lib/release";
import {execSync} from "child_process";

const project = new awscdk.AwsCdkTypeScriptApp({
	cdkVersion: `${execSync("npm show 'aws-cdk-lib' version")}`.trim(),
	defaultReleaseBranch: "main",
	name: "multiple-accounts-multiple-amazon-pinpoint-projects",
	packageManager: javascript.NodePackageManager.NPM,
	projenrcTs: true,
	appEntrypoint: "infrastructure/main.ts",
	gitignore: [".DS_Store", ".idea", "*.iml", ".$*", "appsec"],
	jest: false,
	tsconfig: {
		compilerOptions: {
			target: "ES2022",
			lib: ["ES2022"],
		},
	},
	license: "MIT-0",
	copyrightOwner: "Amazon.com, Inc. or its affiliates. All Rights Reserved.",
	eslintOptions: {
		prettier: true,
		dirs: ["src/runtime"],
		devdirs: ["src/infrastructure", "test"],
		ignorePatterns: ["test/*"],
	},
	prettierOptions: {
		settings: {
			printWidth: 120,
		},
	},
	github: false,
	releaseTrigger: ReleaseTrigger.manual({}),
	majorVersion: 0,
	deps: [
		"@aws-sdk/client-dynamodb",
		"@aws-sdk/util-dynamodb",
		"@aws-sdk/client-s3",
		"@aws-sdk/client-sts",
		"@aws-sdk/client-pinpoint-sms-voice-v2",
		"@aws-sdk/client-eventbridge",
		"@types/aws-lambda",
		"@middy/core",
		"@aws-lambda-powertools/metrics",
		"@aws-lambda-powertools/logger",
		"@aws-lambda-powertools/tracer",
		"@aws-lambda-powertools/batch",
		"aws-xray-sdk",

	] /* Runtime dependencies of this module. */,
	// description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
	devDeps: [
		"@aws-cdk/aws-kinesisfirehose-alpha",
		"@aws-cdk/aws-kinesisfirehose-destinations-alpha",
		"cdk-assets",
		"@npmcli/arborist",
		"@types/npm-packlist",
		"@types/npmcli__arborist",
		"cdk-nag",
		"ts-sinon",
		"vitest"


	],
});
project.tasks.tryFind("test")?.exec("vitest run");
project.tasks.tryFind("synth")?.reset("cdk synth", {
	receiveArgs: true
})
project.tasks.tryFind("synth:silent")?.reset("cdk synth -q", {
	receiveArgs: true
})

project.synth();
