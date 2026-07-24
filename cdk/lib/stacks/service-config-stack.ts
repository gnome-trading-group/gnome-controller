import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface ServiceConfigStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
  cognitoAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
}

export class ServiceConfigStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ServiceConfigStackProps) {
    super(scope, id, props);

    const serviceConfigTable = new dynamodb.Table(this, "ServiceConfigTable", {
      tableName: "gnome-service-config",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const serviceConfigApiKey = props.apiGateway.addApiKey("ServiceConfigApiKey", {
      apiKeyName: "gnome-service-config-key",
    });
    const usagePlan = props.apiGateway.addUsagePlan("ServiceConfigUsagePlan", {
      name: "ServiceConfigUsagePlan",
      apiStages: [{ api: props.apiGateway, stage: props.apiGateway.deploymentStage }],
    });
    usagePlan.addApiKey(serviceConfigApiKey);

    new cdk.CfnOutput(this, "ServiceConfigApiKeyId", {
      value: serviceConfigApiKey.keyId,
      exportName: "ControllerServiceConfigApiKeyId",
      description: "API key ID for service config access (used by classifier workers)",
    });

    const commonEnv = { DYNAMODB_TABLE: serviceConfigTable.tableName };

    const getLambda = new PythonLambdaFunction(this, "ServiceConfigGetLambda", {
      codePath: "lambda/functions/service-config/get",
      functionName: "gnome-service-config-get",
      description: "Get service config, merging with defaults if provided",
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
    });
    serviceConfigTable.grantReadWriteData(getLambda.function);

    const putLambda = new PythonLambdaFunction(this, "ServiceConfigPutLambda", {
      codePath: "lambda/functions/service-config/put",
      functionName: "gnome-service-config-put",
      description: "Update service config (Cognito auth, UI only)",
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
    });
    serviceConfigTable.grantWriteData(putLambda.function);

    const configResource = props.apiGateway.root.addResource("config");
    const serviceResource = configResource.addResource("{service}");

    serviceResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getLambda.function),
      { apiKeyRequired: true },
    );

    serviceResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(putLambda.function),
      {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: props.cognitoAuthorizer,
      },
    );
  }
}
