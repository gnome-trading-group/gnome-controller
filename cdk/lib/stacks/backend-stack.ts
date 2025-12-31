import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { createProbeInvokePolicy, PROBE_LAMBDA_NAME } from "./latency-probe-stack";
import { PythonLambdaFunction } from "../constructs/python-lambda";


interface BackendStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
}

export class BackendStack extends cdk.Stack {

  public readonly apiGateway: apigateway.RestApi; 

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

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "CognitoAuthorizer", {
      cognitoUserPools: [props.userPool],
      identitySource: 'method.request.header.Authorization',
    });

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
    const latencyProbeResource = this.apiGateway.root.addResource("latency-probe");
    const runResource = latencyProbeResource.addResource("run");
    runResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(latencyProbeOrchestrator.function),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: authorizer,
      }
    );

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.apiGateway.url,
      description: "API Gateway URL",
    });
  }
} 
