import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";

interface BackendStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  collectorsTable: dynamodb.ITable;
  collectorCluster: ecs.ICluster; 
  collectorTaskDefinition: string;
  collectorSecurityGroupId: string;
  collectorSubnetIds: string[];
}

interface EndpointConfig {
  name: string;
  path: string;
  method: string;
  handlerPath: string;
  authType: 'cognito' | 'apiKey';
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

    const apiKey = new apigateway.ApiKey(this, "ControllerApiKey", {
      apiKeyName: "controller-api-key",
      description: "API key for controller endpoints",
    });

    const usagePlan = new apigateway.UsagePlan(this, "ControllerUsagePlan", {
      name: "controller-usage-plan",
      apiStages: [
        {
          api,
          stage: api.deploymentStage,
        },
      ],
    });

    usagePlan.addApiKey(apiKey);

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
        timeout: cdk.Duration.seconds(30),
        environment: {
          COLLECTORS_TABLE_NAME: props.collectorsTable.tableName,
          COLLECTOR_ECS_CLUSTER: props.collectorCluster.clusterName,
          COLLECTOR_ECS_TASK_DEFINITION: props.collectorTaskDefinition,
          COLLECTOR_SECURITY_GROUP_ID: props.collectorSecurityGroupId,
          COLLECTOR_SUBNET_IDS: props.collectorSubnetIds.join(','),
        },
      });
      props.collectorsTable.grantReadWriteData(fn);
      
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: [
          'ecs:RunTask',
          'ecs:StopTask',
          'ecs:DescribeTasks',
          'iam:PassRole'
        ],
        resources: ['*'],  // TODO: Restrict to specific task definition
      }));
      
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

      const methodOptions: apigateway.MethodOptions = {
        apiKeyRequired: config.authType === 'apiKey',
        authorizationType: config.authType === 'apiKey' 
          ? apigateway.AuthorizationType.NONE 
          : apigateway.AuthorizationType.COGNITO,
        authorizer: config.authType === 'apiKey' ? undefined : authorizer,
      };

      resource.addMethod(
        config.method,
        new apigateway.LambdaIntegration(fn),
        methodOptions
      );
    };

    const endpoints: EndpointConfig[] = [
      {
        name: "CreateCollector",
        path: "collectors",
        method: "POST",
        handlerPath: "create",
        authType: "cognito"
      },
      {
        name: "ListCollectors",
        path: "collectors",
        method: "GET",
        handlerPath: "list",
        authType: "cognito"
      },
      {
        name: "DeleteCollector",
        path: "collectors",
        method: "DELETE",
        handlerPath: "delete",
        authType: "cognito"
      },
      {
        name: "UpdateCollector",
        path: "collectors",
        method: "PUT",
        handlerPath: "update",
        authType: "cognito"
      },
    ];

    endpoints.forEach(createEndpoint);

    const collectorEcsMonitorLambda = new lambda.Function(this, "CollectorEcsMonitorLambda", {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/functions/collectors/ecs-monitor"),
      environment: {
        COLLECTORS_TABLE_NAME: props.collectorsTable.tableName,
      },
      layers: [commonLayer],
      timeout: cdk.Duration.seconds(30),
    });

    props.collectorsTable.grantReadWriteData(collectorEcsMonitorLambda);

    const collectorEcsTaskStateRule = new events.Rule(this, "CollectorEcsTaskStateRule", {
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: {
          clusterArn: [props.collectorCluster.clusterArn],
          lastStatus: ["RUNNING", "STOPPED", "PENDING"],
        },
      },
    });

    collectorEcsTaskStateRule.addTarget(new targets.LambdaFunction(collectorEcsMonitorLambda));

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway URL",
    });

    new cdk.CfnOutput(this, "ApiKey", {
      value: apiKey.keyId,
      description: "API Key ID for controller endpoints",
    });
  }
} 