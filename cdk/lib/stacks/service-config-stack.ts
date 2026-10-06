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

    const historyLambda = new PythonLambdaFunction(this, "ServiceConfigHistoryLambda", {
      codePath: "lambda/functions/service-config/history",
      functionName: "gnome-service-config-history",
      description: "List saved service config versions (Cognito auth, UI only)",
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
    });
    serviceConfigTable.grantReadData(historyLambda.function);

    const getIntegration = new apigateway.LambdaIntegration(getLambda.function);
    const cognitoOptions: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: props.cognitoAuthorizer,
    };

    // Services (the classifier) read config with the API key; people read and write under /cognito so the key never
    // has to ship in the controller UI bundle. A method takes one authorizer, so the two can't share a route.
    props.apiGateway.root.resourceForPath("config/{service}")
      .addMethod("GET", getIntegration, { apiKeyRequired: true });

    const cognitoServiceResource = props.apiGateway.root.resourceForPath("cognito/config/{service}");
    cognitoServiceResource.addMethod("GET", getIntegration, cognitoOptions);
    cognitoServiceResource.addMethod("PUT", new apigateway.LambdaIntegration(putLambda.function), cognitoOptions);
    cognitoServiceResource.addResource("history")
      .addMethod("GET", new apigateway.LambdaIntegration(historyLambda.function), cognitoOptions);
  }
}
