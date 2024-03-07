import {assert, describe, expect, it} from "vitest";
import {CognitoAuthorization} from "../../src/infrastructure/constructs/CognitoAuthorization";
import {Stack} from "aws-cdk-lib";
import {Template} from "aws-cdk-lib/assertions";


describe('CognitoAuthorization', () => {
	it("Must be at least 9 characters long", async () => {
		try {
			const stack = new Stack();
			new CognitoAuthorization(stack, "CognitoAuthorization", {

				apiTempPassword: "12345"
			})
			Template.fromStack(stack);
			assert.isTrue(false, "Should have thrown an exception")
		}catch(e){
			const error=e as Error
			assert.isTrue(error.message.includes("The temp password for the API admin user must be at least 9 characters long, include digits, both lower and uppercase letters as well as symbols"))
		}
	})
	it("Must have digits", async () => {
		try {
			const stack = new Stack();
			new CognitoAuthorization(stack, "CognitoAuthorization", {

				apiTempPassword: "abDgrtsr#"
			})
			Template.fromStack(stack);
			assert.isTrue(false, "Should have thrown an exception")
		}catch(e){
			const error=e as Error
			assert.isTrue(error.message.includes("The temp password for the API admin user must be at least 9 characters long, include digits, both lower and uppercase letters as well as symbols"))
		}
	})
	it("Must have upper case", async () => {
		try {
			const stack = new Stack();
			new CognitoAuthorization(stack, "CognitoAuthorization", {

				apiTempPassword: "ab1grtsr#"
			})
			Template.fromStack(stack);
			assert.isTrue(false, "Should have thrown an exception")
		}catch(e){
			const error=e as Error
			assert.isTrue(error.message.includes("The temp password for the API admin user must be at least 9 characters long, include digits, both lower and uppercase letters as well as symbols"))
		}
	})
	it("Must have lower case", async () => {
		try {
			const stack = new Stack();
			new CognitoAuthorization(stack, "CognitoAuthorization", {

				apiTempPassword: "AB4D#$DAD"
			})
			Template.fromStack(stack);
			assert.isTrue(false, "Should have thrown an exception")
		}catch(e){
			const error=e as Error
			assert.isTrue(error.message.includes("The temp password for the API admin user must be at least 9 characters long, include digits, both lower and uppercase letters as well as symbols"))
		}
	})
	it("Must have special character", async () => {
		try {
			const stack = new Stack();
			new CognitoAuthorization(stack, "CognitoAuthorization", {

				apiTempPassword: "AB4DafDAD"
			})
			Template.fromStack(stack);
			assert.isTrue(false, "Should have thrown an exception")
		}catch(e){
			const error=e as Error
			assert.isTrue(error.message.includes("The temp password for the API admin user must be at least 9 characters long, include digits, both lower and uppercase letters as well as symbols"))
		}
	})
	it("Works when all conditions are met", async () => {

			const stack = new Stack();
			new CognitoAuthorization(stack, "CognitoAuthorization", {

				apiTempPassword: "123$aDCEF"
			})
			const template=Template.fromStack(stack);
			expect(template).toMatchSnapshot()

	})
})