import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { CallerKind, GnomeApiAuthorizer } from "@gnome-trading-group/gnome-shared-cdk";
import { createProbeInvokePolicy, PROBE_LAMBDA_NAME } from "./latency-probe-stack";
import { PythonLambdaFunction } from "../constructs/python-lambda";


interface BackendStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
}

export class BackendStack extends cdk.Stack {

  public readonly apiGateway: apigateway.RestApi;
  public readonly auth: GnomeApiAuthorizer;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    this.apiGateway = new apigateway.RestApi(this, "ControllerApi", {
      restApiName: 'gnome-controller-api',
      description: "API for Gnome Controller backend services",
      deployOptions: {
        stageName: 'api',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          ...apigateway.Cors.DEFAULT_HEADERS,
          'Authorization',
          'Content-Type',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token'
        ],
      },
    });

    // The classifier and other services read their service config with this key. Not bound to the stage (as
    // apiGateway.addApiKey would): the stage depends on every method, the methods on the authorizer and the authorizer
    // on this key, which would be a cycle. Same scope and id as before, so the key and its value are kept.
    const serviceConfigApiKey = new apigateway.ApiKey(this.apiGateway, "ServiceConfigApiKey", {
      apiKeyName: "gnome-service-config-key",
    });
    // Every stack adding routes to this API goes through this one authorizer: services by key, people by Cognito ID
    // token, bots by gnome-api-scoped access token.
    this.auth = new GnomeApiAuthorizer(this, "Authorizer", { userPool: props.userPool, apiKeys: [serviceConfigApiKey] });

    const latencyProbeOrchestrator = new PythonLambdaFunction(this, "LatencyProbeOrchestratorLambda", {
      codePath: "lambda/functions/latency-probe/orchestrator",
      description: "Orchestrates latency probes across regions",
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: {
        PROBE_LAMBDA_NAME: PROBE_LAMBDA_NAME,
      },
    });

    // Grant permission to invoke probe Lambdas in all regions
    latencyProbeOrchestrator.function.addToRolePolicy(createProbeInvokePolicy(this.account));

    // Add latency probe endpoint
    this.auth.addRoute(this.apiGateway.root, "latency-probe/run", new apigateway.LambdaIntegration(latencyProbeOrchestrator.function),
      { POST: [CallerKind.PERSON] });

    new cdk.CfnOutput(this, "ControllerApiUrl", {
      value: this.apiGateway.url,
      exportName: "ControllerApiUrl",
      description: "Controller API Gateway URL",
    });

    new cdk.CfnOutput(this, "ServiceConfigApiKeyId", {
      value: serviceConfigApiKey.keyId,
      exportName: "ControllerServiceConfigApiKeyId",
      description: "API key ID for service config access (used by classifier workers)",
    });
  }
}
