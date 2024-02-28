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
	serviceName: "IntegrationRequest",
});
const metrics = new Metrics({
	namespace: process.env.METRIC_NAMESPACE!,
	serviceName: "IntegrationRequest",
});
const tracer = new Tracer({
	serviceName: "IntegrationRequest",
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
	const body: Record<string, any | undefined> | undefined = event?.body
	const output: Field[] = toFields(body)

	delete event["body"]

	return {
		"input": output,
		...event
	}
};

function toFields(input: Record<string, any | undefined> | undefined): Field[] {
	const output: Field[] = []
	if (input != undefined) {
		for (const fieldName in input) {
			const value = input[fieldName]
			if (value != null) {
				if (Array.isArray(value)) {
					const subOutput:any[] = []
					let idx = 0
					for (const item of value) {
						if (Array.isArray(item) || typeof item === "object") {
							const outputForField = toFields(item)
							subOutput.push({
								Key: `${fieldName}[${idx++}]`,
								Value: outputForField,
							})
						}else{
							subOutput.push(item)
						}

					}
					output.push({Key: fieldName, Value: subOutput})
				} else if (typeof value === "object") {
					const outputForField = toFields(value)
					output.push({Key: fieldName, Value: outputForField})
				} else {
					output.push({Key: fieldName, Value: value})
				}
			} else {
				output.push({Key: fieldName, Value: null})
			}
		}

	}
	return output;
}


export const onEvent = middy(onEventHandler)
.use(captureLambdaHandler(tracer))
.use(logMetrics(metrics, {captureColdStartMetric: true}));