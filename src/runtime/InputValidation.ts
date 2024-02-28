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

import middy from "@middy/core";
import {captureLambdaHandler, Tracer} from "@aws-lambda-powertools/tracer";
import {logMetrics, Metrics} from "@aws-lambda-powertools/metrics";
import {Logger} from "@aws-lambda-powertools/logger";
import {Field} from "../index";

const logger = new Logger({
	serviceName: "InputValidation",
});
const metrics = new Metrics({
	namespace: process.env.METRIC_NAMESPACE!,
	serviceName: "InputValidation",
});
const tracer = new Tracer({
	serviceName: "InputValidation",
	enabled: true,
	captureHTTPsRequests: true,
});


export const onEventHandler = async (
	event: any,
	//@ts-ignore
	context: Context,
	//@ts-ignore
	callback: Callback,
): Promise<any | undefined> => {
	logger.info(`Event: ${JSON.stringify(event)}`);
	const input: Array<Field> | undefined = event?.input
	const definition = event?.definition
	if (input == undefined) {
		throw new Error("No input provided")
	}
	if (definition == undefined) {
		throw new Error("No definition provided")
	}
	const requiredFields: Array<string> | undefined = definition?.required

	const [requiredOutput, errors] = requireFields(input, requiredFields)

	if (errors.length > 0) {
		throw new Error(errors.join(", "))
	}

	const optionalOutput = optionalFields(input, definition?.optional)
	const output = {...requiredOutput, ...optionalOutput}
	delete event["input"]
	delete event["definition"]
	return {
		"input": output,
		...event
	}
};

function optionalFields(input: Array<Field>|Field, fieldNames: Array<string> | undefined) {
	const output: Record<string, any | undefined> = {}

	if (fieldNames != undefined) {
		if (Array.isArray(input)) {
			for (const fieldName of fieldNames) {
				const field: Field | undefined = input.find(value => {
					return value.Key == fieldName
				})
				if (field != undefined) {
					output[field.Key] = field.Value
				} else {
					output[fieldName] = null
				}
			}
		}else{
			return optionalFields(input.Value, fieldNames)
		}
	}
	return output
}

function requireFields(input: Array<Field> | Field, fieldNames: Array<string> | undefined) {
	const errors = []
	const output: Record<string, any | undefined> = {}
	if (fieldNames != undefined) {
		if (Array.isArray(input)) {

			for (const fieldName of fieldNames) {

				const field: Field | undefined = input.find(value => {
					return value.Key == fieldName
				})
				if (field == undefined) {
					errors.push(`Field ${fieldName} is required`)
				} else {
					output[field.Key] = field.Value
				}

			}
		} else {
			return requireFields(input.Value, fieldNames)
		}
	}
	return [output, errors]
}


export const onEvent = middy(onEventHandler)
.use(captureLambdaHandler(tracer))
.use(logMetrics(metrics, {captureColdStartMetric: true}));