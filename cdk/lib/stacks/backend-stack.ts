import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

interface BackendStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
}

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const api = new apigateway.RestApi(this, "ControllerApi", {
      restApiName: 'gnome-controller-api',
      description: "API for Gnome Controller backend services",
      deployOptions: {
        stageName: 'api',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [...apigateway.Cors.DEFAULT_HEADERS, 'Authorization'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "CognitoAuthorizer", {
      cognitoUserPools: [props.userPool],
      identitySource: 'method.request.header.Authorization',
    });

    const commonLayer = new lambda.LayerVersion(this, "CommonLayer", {
      code: lambda.Code.fromAsset("lambda/layers/common"),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      description: "Common Python dependencies for all Lambda functions",
    });

    const exampleFunction = new lambda.Function(this, "ExampleFunction", {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/functions/example"),
      layers: [commonLayer],
      environment: {
        STAGE: 'dev',
      },
    });

    const exampleResource = api.root.addResource("example");
    exampleResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(exampleFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway URL",
    });
  }
} 