import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { CallerKind, GnomeApiAuthorizer, Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface ResearchStackProps extends cdk.StackProps {
  stage: Stage;
  apiGateway: apigateway.RestApi;
  auth: GnomeApiAuthorizer;
}

export class ResearchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ResearchStackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------------------
    // DynamoDB — research sessions (single-table: META, ITER#NNN, NOTE#<ts>)
    // ---------------------------------------------------------------------------

    const table = new dynamodb.Table(this, "ResearchSessionsTable", {
      tableName: "gnome-research-sessions",
      partitionKey: { name: "session_name", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    table.addGlobalSecondaryIndex({
      indexName: "status-updated-index",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "updated_at", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ---------------------------------------------------------------------------
    // Lambda functions
    // ---------------------------------------------------------------------------

    const commonEnv = { DYNAMODB_TABLE: table.tableName };

    const createSessionLambda = new PythonLambdaFunction(this, "ResearchCreateSessionLambda", {
      codePath: "lambda/functions/research/create-session",
      functionName: "gnome-research-create-session",
      description: "Create a new research session",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantWriteData(createSessionLambda.function);

    const listSessionsLambda = new PythonLambdaFunction(this, "ResearchListSessionsLambda", {
      codePath: "lambda/functions/research/list-sessions",
      functionName: "gnome-research-list-sessions",
      description: "List research sessions",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadData(listSessionsLambda.function);

    const getSessionLambda = new PythonLambdaFunction(this, "ResearchGetSessionLambda", {
      codePath: "lambda/functions/research/get-session",
      functionName: "gnome-research-get-session",
      description: "Get a research session with all iterations and notes",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadData(getSessionLambda.function);

    const updateSessionLambda = new PythonLambdaFunction(this, "ResearchUpdateSessionLambda", {
      codePath: "lambda/functions/research/update-session",
      functionName: "gnome-research-update-session",
      description: "Update research session metadata",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadWriteData(updateSessionLambda.function);

    const recordIterationLambda = new PythonLambdaFunction(this, "ResearchRecordIterationLambda", {
      codePath: "lambda/functions/research/record-iteration",
      functionName: "gnome-research-record-iteration",
      description: "Record a research iteration result",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadWriteData(recordIterationLambda.function);

    const addNoteLambda = new PythonLambdaFunction(this, "ResearchAddNoteLambda", {
      codePath: "lambda/functions/research/add-note",
      functionName: "gnome-research-add-note",
      description: "Add a research note to a session",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadWriteData(addNoteLambda.function);

    // ---------------------------------------------------------------------------
    // API Gateway routes — people only (shared authorizer from BackendStack)
    // ---------------------------------------------------------------------------

    const personOpts: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: props.auth.authorizerFor([CallerKind.PERSON]),
    };

    const researchResource = props.apiGateway.root.addResource("research");
    const sessionsResource = researchResource.addResource("sessions");
    sessionsResource.addMethod("GET", new apigateway.LambdaIntegration(listSessionsLambda.function), personOpts);
    sessionsResource.addMethod("POST", new apigateway.LambdaIntegration(createSessionLambda.function), personOpts);

    const sessionResource = sessionsResource.addResource("{sessionName}");
    sessionResource.addMethod("GET", new apigateway.LambdaIntegration(getSessionLambda.function), personOpts);
    sessionResource.addMethod("PATCH", new apigateway.LambdaIntegration(updateSessionLambda.function), personOpts);

    const iterationsResource = sessionResource.addResource("iterations");
    iterationsResource.addMethod("POST", new apigateway.LambdaIntegration(recordIterationLambda.function), personOpts);

    const notesResource = sessionResource.addResource("notes");
    notesResource.addMethod("POST", new apigateway.LambdaIntegration(addNoteLambda.function), personOpts);
  }
}
