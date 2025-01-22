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

import {Logger} from "@aws-lambda-powertools/logger";
import {Metrics} from "@aws-lambda-powertools/metrics";
import {Tracer} from "@aws-lambda-powertools/tracer";
import {captureLambdaHandler} from '@aws-lambda-powertools/tracer/middleware';
import {logMetrics} from '@aws-lambda-powertools/metrics/middleware';
import middy from "@middy/core";
import {Aws, AwsApiCalls} from "./Aws";
import {ExecuteStatementCommandInput, RecordsFormatType} from "@aws-sdk/client-rds-data";


const serviceName = "QueryUsage";
const logger = new Logger({
	serviceName: serviceName,
});
const metrics = new Metrics({
	namespace: process.env.METRIC_NAMESPACE!,
	serviceName: serviceName,
});
const tracer = new Tracer({
	serviceName: serviceName,
	enabled: true,
	captureHTTPsRequests: true,
});


export const onEventHandler = async (
	event: any,
	//@ts-ignore
	context: Context,
	//@ts-ignore
	callback: Callback,
	aws: AwsApiCalls = Aws.instance({}, tracer),
): Promise<any> => {
	// Define proper types for better type safety
	interface SpendLimit {
		Name: string;
		MaxLimit: number;
	}

	interface Record {
		year: string;
		month: string;
		total_spend: string;
	}

	try {
		logger.info(`Event: ${JSON.stringify(event)}`);

		// Extract monthly spend limit early to fail fast
		const spendLimits = event.DescribeSpendLimitsResults.SpendLimits as SpendLimit[];
		const monthlySpendLimit = spendLimits.find(
			limit => limit.Name === "TEXT_MESSAGE_MONTHLY_SPEND_LIMIT"
		)?.MaxLimit;

		if (!monthlySpendLimit) {
			throw new Error('Could not determine max spend limit');
		}

		// SQL query optimization: removed unnecessary subquery
		const params: ExecuteStatementCommandInput = {
			resourceArn: process.env.DB_CLUSTER_ARN,
			secretArn: process.env.DB_SECRET_ARN,
			database: process.env.DB_NAME,
			formatRecordsAs: RecordsFormatType.JSON,
			sql: `
                SELECT 
                    EXTRACT(year from event_timestamp) as year,
                    EXTRACT(month from event_timestamp) as month,
                    account_id,
                    SUM(total_message_price) as total_spend 
                FROM messaging_events
                WHERE account_id = :account_id
                GROUP BY 
                    EXTRACT(year from event_timestamp),
                    EXTRACT(month from event_timestamp),
                    account_id
            `,
			parameters: [
				{name: 'account_id', value: {stringValue: event.accountId}}
			]
		};

		const result = await aws.executeStatement(params);

		if (result.$metadata.httpStatusCode !== 200) {
			throw new Error(`Error querying usage: ${JSON.stringify(result)}`);
		}

		if (!result.formattedRecords) {
			throw new Error('Could not determine formatted records');
		}

		const records = JSON.parse(result.formattedRecords) as Record[];

		const usage = records.map(record => ({
			year: +record.year,
			month: +record.month,
			usage_percentage: (parseFloat(record.total_spend) / monthlySpendLimit) * 100
		}));

		return {body: JSON.stringify(usage, null, 2)};

	} catch (error) {
		logger.error(`Error in onEventHandler: ${error}`);
		throw error;
	}
};


//@ts-ignore
export const onEvent = middy(onEventHandler)
.use(captureLambdaHandler(tracer))
.use(logMetrics(metrics, {captureColdStartMetric: true}));


