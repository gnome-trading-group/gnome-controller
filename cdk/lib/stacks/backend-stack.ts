import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

interface BackendStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  collectorsTable: dynamodb.ITable;
}

interface EndpointConfig {
  name: string;
  path: string;
  method: string;
  handlerPath: string;
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

    const createLambdaFunction = (name: string, handlerPath: string): lambda.Function => {
      const fn = new lambda.Function(this, name, {
        runtime: lambda.Runtime.PYTHON_3_13,
        handler: "index.handler",
        code: lambda.Code.fromAsset(handlerPath),
        layers: [commonLayer],
        environment: {
          COLLECTORS_TABLE_NAME: props.collectorsTable.tableName,
        },
      });
      props.collectorsTable.grantReadWriteData(fn);
      return fn;
    };

    const createEndpoint = (config: EndpointConfig) => {
      const fn = createLambdaFunction(
        `${config.name}Function`,
        `lambda/functions/collectors/${config.handlerPath}`
      );

      const pathParts = config.path.split('/').filter(Boolean);
      let resource = api.root;
      for (const part of pathParts) {
        resource = resource.getResource(part) || resource.addResource(part);
      }

      resource.addMethod(
        config.method,
        new apigateway.LambdaIntegration(fn),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    };

    const endpoints: EndpointConfig[] = [
      {
        name: "CreateCollector",
        path: "collectors",
        method: "POST",
        handlerPath: "create",
      },
      {
        name: "ListCollectors",
        path: "collectors",
        method: "GET",
        handlerPath: "list",
      },
      {
        name: "DeleteCollector",
        path: "collectors",
        method: "DELETE",
        handlerPath: "delete",
      },
      {
        name: "HeartbeatCollector",
        path: "collectors/heartbeat",
        method: "POST",
        handlerPath: "heartbeat",
      },
    ];

    endpoints.forEach(createEndpoint);

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway URL",
    });
  }
} 