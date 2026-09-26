import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface ResearchStackProps extends cdk.StackProps {
  stage: Stage;
  apiGateway: apigateway.RestApi;
  cognitoAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
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

    table.addGlobalSecondaryIndex({
      indexName: "artifact-type-name-index",
      partitionKey: { name: "artifact_type", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "artifact_name", type: dynamodb.AttributeType.STRING },
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

    const listArtifactsLambda = new PythonLambdaFunction(this, "ResearchListArtifactsLambda", {
      codePath: "lambda/functions/research/list-artifacts",
      functionName: "gnome-research-list-artifacts",
      description: "List artifact metadata records",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadData(listArtifactsLambda.function);

    const registerArtifactLambda = new PythonLambdaFunction(this, "ResearchRegisterArtifactLambda", {
      codePath: "lambda/functions/research/register-artifact",
      functionName: "gnome-research-register-artifact",
      description: "Register artifact metadata after S3 upload",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadWriteData(registerArtifactLambda.function);

    const listDatasetsLambda = new PythonLambdaFunction(this, "ResearchListDatasetsLambda", {
      codePath: "lambda/functions/research/list-datasets",
      functionName: "gnome-research-list-datasets",
      description: "List dataset metadata records",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadData(listDatasetsLambda.function);

    const registerDatasetLambda = new PythonLambdaFunction(this, "ResearchRegisterDatasetLambda", {
      codePath: "lambda/functions/research/register-dataset",
      functionName: "gnome-research-register-dataset",
      description: "Register dataset metadata after S3 upload",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    table.grantReadWriteData(registerDatasetLambda.function);

    // ---------------------------------------------------------------------------
    // API Gateway routes — Cognito auth (shared authorizer from BackendStack)
    // ---------------------------------------------------------------------------

    const cognitoOpts: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: props.cognitoAuthorizer,
    };

    const researchResource = props.apiGateway.root.addResource("research");
    const sessionsResource = researchResource.addResource("sessions");
    sessionsResource.addMethod("GET", new apigateway.LambdaIntegration(listSessionsLambda.function), cognitoOpts);
    sessionsResource.addMethod("POST", new apigateway.LambdaIntegration(createSessionLambda.function), cognitoOpts);

    const sessionResource = sessionsResource.addResource("{sessionName}");
    sessionResource.addMethod("GET", new apigateway.LambdaIntegration(getSessionLambda.function), cognitoOpts);
    sessionResource.addMethod("PATCH", new apigateway.LambdaIntegration(updateSessionLambda.function), cognitoOpts);

    const iterationsResource = sessionResource.addResource("iterations");
    iterationsResource.addMethod("POST", new apigateway.LambdaIntegration(recordIterationLambda.function), cognitoOpts);

    const notesResource = sessionResource.addResource("notes");
    notesResource.addMethod("POST", new apigateway.LambdaIntegration(addNoteLambda.function), cognitoOpts);

    const artifactsResource = researchResource.addResource("artifacts");
    artifactsResource.addMethod("GET", new apigateway.LambdaIntegration(listArtifactsLambda.function), cognitoOpts);
    artifactsResource.addMethod("POST", new apigateway.LambdaIntegration(registerArtifactLambda.function), cognitoOpts);

    const datasetsResource = researchResource.addResource("datasets");
    datasetsResource.addMethod("GET", new apigateway.LambdaIntegration(listDatasetsLambda.function), cognitoOpts);
    datasetsResource.addMethod("POST", new apigateway.LambdaIntegration(registerDatasetLambda.function), cognitoOpts);
  }
}
