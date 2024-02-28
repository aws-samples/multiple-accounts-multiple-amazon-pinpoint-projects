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

import { Tracer } from "@aws-lambda-powertools/tracer";
import {
  DeleteItemCommand,
  DeleteItemCommandInput,
  DeleteItemCommandOutput,
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  GetItemCommandOutput,
  PutItemCommand,
  PutItemCommandInput,
  PutItemCommandOutput,
  UpdateItemCommand,
  UpdateItemCommandInput,
  UpdateItemCommandOutput,
} from "@aws-sdk/client-dynamodb";
import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsCommandInput,
  PutEventsCommandOutput,
} from "@aws-sdk/client-eventbridge";
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetCommandInput,
  CreateConfigurationSetCommandOutput,
  CreateEventDestinationCommand,
  CreateEventDestinationCommandInput,
  CreateEventDestinationCommandOutput,
  CreatePoolCommand,
  CreatePoolCommandInput,
  CreatePoolCommandOutput,
  DeleteConfigurationSetCommand,
  DeleteConfigurationSetCommandInput,
  DeleteConfigurationSetCommandOutput,
  DeleteEventDestinationCommand,
  DeleteEventDestinationCommandInput,
  DeleteEventDestinationCommandOutput,
  DeletePoolCommand,
  DeletePoolCommandInput,
  DeletePoolCommandOutput,
  PinpointSMSVoiceV2Client,
  ReleasePhoneNumberCommand,
  ReleasePhoneNumberCommandInput,
  ReleasePhoneNumberCommandOutput,
  RequestPhoneNumberCommand,
  RequestPhoneNumberCommandInput,
  RequestPhoneNumberCommandOutput,
  UpdateEventDestinationCommand,
  UpdateEventDestinationCommandInput,
  UpdatePoolCommand,
  UpdatePoolCommandInput,
  UpdatePoolCommandOutput,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import {
  GetBucketPolicyCommand,
  GetBucketPolicyCommandInput,
  GetBucketPolicyCommandOutput,
  PutBucketPolicyCommand,
  PutBucketPolicyCommandInput,
  PutBucketPolicyCommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";

export interface AwsApiCalls {
  putBucketPolicy(
    input: PutBucketPolicyCommandInput,
  ): Promise<PutBucketPolicyCommandOutput>;

  getBucketPolicy(
    input: GetBucketPolicyCommandInput,
  ): Promise<GetBucketPolicyCommandOutput>;

  updateItem(input: UpdateItemCommandInput): Promise<UpdateItemCommandOutput>;

  putItem(input: PutItemCommandInput): Promise<PutItemCommandOutput>;

  getItem(input: GetItemCommandInput): Promise<GetItemCommandOutput>;

  deleteItem(input: DeleteItemCommandInput): Promise<DeleteItemCommandOutput>;

  putEvents(input: PutEventsCommandInput): Promise<PutEventsCommandOutput>;

  updateEventDestination(
    input: UpdateEventDestinationCommandInput,
  ): Promise<DeleteEventDestinationCommandOutput>;

  deleteEventDestination(
    input: DeleteEventDestinationCommandInput,
  ): Promise<DeleteEventDestinationCommandOutput>;

  createEventDestination(
    input: CreateEventDestinationCommandInput,
  ): Promise<CreateEventDestinationCommandOutput>;

  createConfigurationSet(
    input: CreateConfigurationSetCommandInput,
  ): Promise<CreateConfigurationSetCommandOutput>;

  deleteConfigurationSet(
    input: DeleteConfigurationSetCommandInput,
  ): Promise<DeleteConfigurationSetCommandOutput>;

  requestPhoneNumber(
    input: RequestPhoneNumberCommandInput,
  ): Promise<RequestPhoneNumberCommandOutput>;

  releasePhoneNumber(
    input: ReleasePhoneNumberCommandInput,
  ): Promise<ReleasePhoneNumberCommandOutput>;

  createPhonePool(
    input: CreatePoolCommandInput,
  ): Promise<CreatePoolCommandOutput>;

  updatePhonePool(
    input: UpdatePoolCommandInput,
  ): Promise<UpdatePoolCommandOutput>;

  deletePhonePool(
    input: DeletePoolCommandInput,
  ): Promise<DeletePoolCommandOutput>;
}

export class Aws implements AwsApiCalls {
  static instance(
    config: { [key: string]: any | undefined } = {},
    tracer: Tracer | undefined = undefined,
  ) {
    if (this._instance == undefined) {
      this._instance = new Aws(config, tracer);
    }
    return this._instance;
  }

  private static _instance: Aws | undefined;
  private _s3Client: S3Client | undefined;
  private _eventBridgeClient: EventBridgeClient | undefined;
  private _ddbClient: DynamoDBClient | undefined;
  private _pinpointSMSVoiceV2Client: PinpointSMSVoiceV2Client | undefined;
  private config: { [key: string]: any | undefined };
  private _tracer: Tracer | undefined;

  private constructor(
    config: { [key: string]: any | undefined } = {},
    tracer: Tracer | undefined,
  ) {
    this.config = config;
    this._tracer = tracer;
  }

  public newInstance(
    config: { [key: string]: any | undefined } = {},
    tracer: Tracer | undefined = undefined,
  ): AwsApiCalls {
    return new Aws(config, tracer);
  }

  private get s3Client(): S3Client {
    if (this._s3Client == undefined) {
      this._s3Client = this._tracer
        ? this._tracer.captureAWSv3Client(new S3Client(this.config))
        : new S3Client(this.config);
    }
    return this._s3Client;
  }

  private get eventBridgeClient(): EventBridgeClient {
    if (this._eventBridgeClient == undefined) {
      this._eventBridgeClient = this._tracer
        ? this._tracer.captureAWSv3Client(new EventBridgeClient(this.config))
        : new EventBridgeClient(this.config);
    }
    return this._eventBridgeClient;
  }

  private get pinpointSMSVoiceV2Client(): PinpointSMSVoiceV2Client {
    if (this._pinpointSMSVoiceV2Client == undefined) {
      this._pinpointSMSVoiceV2Client = this._tracer
        ? this._tracer.captureAWSv3Client(
            new PinpointSMSVoiceV2Client(this.config),
          )
        : new PinpointSMSVoiceV2Client(this.config);
    }
    return this._pinpointSMSVoiceV2Client;
  }

  //@ts-ignore
  private get ddbClient(): DynamoDBClient {
    if (this._ddbClient == undefined) {
      this._ddbClient = this._tracer
        ? this._tracer.captureAWSv3Client(
            new DynamoDBClient({
              ...this.config,
              retryMode: "adaptive",
            }),
          )
        : new DynamoDBClient(this.config);
    }
    return this._ddbClient;
  }

  async createPhonePool(
    input: CreatePoolCommandInput,
  ): Promise<CreatePoolCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(new CreatePoolCommand(input));
  }

  async updatePhonePool(
    input: UpdatePoolCommandInput,
  ): Promise<UpdatePoolCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(new UpdatePoolCommand(input));
  }

  async deletePhonePool(
    input: DeletePoolCommandInput,
  ): Promise<DeletePoolCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(new DeletePoolCommand(input));
  }

  async requestPhoneNumber(
    input: RequestPhoneNumberCommandInput,
  ): Promise<RequestPhoneNumberCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(
      new RequestPhoneNumberCommand(input),
    );
  }

  async releasePhoneNumber(
    input: ReleasePhoneNumberCommandInput,
  ): Promise<ReleasePhoneNumberCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(
      new ReleasePhoneNumberCommand(input),
    );
  }

  async createConfigurationSet(
    input: CreateConfigurationSetCommandInput,
  ): Promise<CreateConfigurationSetCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(
      new CreateConfigurationSetCommand(input),
    );
  }

  async deleteConfigurationSet(
    input: DeleteConfigurationSetCommandInput,
  ): Promise<DeleteConfigurationSetCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(
      new DeleteConfigurationSetCommand(input),
    );
  }

  async updateEventDestination(
    input: UpdateEventDestinationCommandInput,
  ): Promise<DeleteEventDestinationCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(
      new UpdateEventDestinationCommand(input),
    );
  }

  async deleteEventDestination(
    input: DeleteEventDestinationCommandInput,
  ): Promise<DeleteEventDestinationCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(
      new DeleteEventDestinationCommand(input),
    );
  }

  async createEventDestination(
    input: CreateEventDestinationCommandInput,
  ): Promise<CreateEventDestinationCommandOutput> {
    return this.pinpointSMSVoiceV2Client.send(
      new CreateEventDestinationCommand(input),
    );
  }

  async putEvents(
    input: PutEventsCommandInput,
  ): Promise<PutEventsCommandOutput> {
    return this.eventBridgeClient.send(new PutEventsCommand(input));
  }

  async updateItem(
    input: UpdateItemCommandInput,
  ): Promise<UpdateItemCommandOutput> {
    return this.ddbClient.send(new UpdateItemCommand(input));
  }

  async putItem(input: PutItemCommandInput): Promise<PutItemCommandOutput> {
    return this.ddbClient.send(new PutItemCommand(input));
  }

  async deleteItem(
    input: DeleteItemCommandInput,
  ): Promise<DeleteItemCommandOutput> {
    return this.ddbClient.send(new DeleteItemCommand(input));
  }

  getItem(input: GetItemCommandInput): Promise<GetItemCommandOutput> {
    return this.ddbClient.send(new GetItemCommand(input));
  }

  async putBucketPolicy(
    input: PutBucketPolicyCommandInput,
  ): Promise<PutBucketPolicyCommandOutput> {
    return this.s3Client.send(new PutBucketPolicyCommand(input));
  }

  async getBucketPolicy(
    input: GetBucketPolicyCommandInput,
  ): Promise<GetBucketPolicyCommandOutput> {
    return this.s3Client.send(new GetBucketPolicyCommand(input));
  }
}
