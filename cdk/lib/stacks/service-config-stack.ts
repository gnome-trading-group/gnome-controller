import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { CallerKind, GnomeApiAuthorizer } from "@gnome-trading-group/gnome-shared-cdk";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface ServiceConfigStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
  auth: GnomeApiAuthorizer;
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
      description: "Update service config (people only, from the UI)",
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
    });
    serviceConfigTable.grantWriteData(putLambda.function);

    const historyLambda = new PythonLambdaFunction(this, "ServiceConfigHistoryLambda", {
      codePath: "lambda/functions/service-config/history",
      functionName: "gnome-service-config-history",
      description: "List saved service config versions (people only, from the UI)",
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
    });
    serviceConfigTable.grantReadData(historyLambda.function);

    // Services (the classifier) read their config with the API key and gnome-bot with its token; only people change
    // it, from the UI.
    const { PERSON, SERVICE, BOT } = CallerKind;
    const root = props.apiGateway.root;
    props.auth.addRoute(root, "config/{service}", new apigateway.LambdaIntegration(getLambda.function), { GET: [SERVICE, PERSON, BOT] });
    props.auth.addRoute(root, "config/{service}", new apigateway.LambdaIntegration(putLambda.function), { PUT: [PERSON] });
    props.auth.addRoute(root, "config/{service}/history", new apigateway.LambdaIntegration(historyLambda.function), { GET: [PERSON] });
  }
}
