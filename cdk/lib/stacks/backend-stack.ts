import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { createProbeInvokePolicy, PROBE_LAMBDA_NAME } from "./latency-probe-stack";
import { BacktestStack, BACKTEST_BUCKET_NAME } from "./backtest-stack";
import { PythonLambdaFunction } from "../constructs/python-lambda";


interface BackendStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  backtestStack: BacktestStack;
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

    // ---- Backtest Lambdas ---------------------------------------------------

    const bt = props.backtestStack;
    const ghTokenSecret = secretsmanager.Secret.fromSecretNameV2(
      this, "GhTokenSecret", "gnome-backtest-gh-token",
    );
    const resultsBucket = s3.Bucket.fromBucketName(
      this, "BacktestResultsBucket", BACKTEST_BUCKET_NAME,
    );

    // Submit Lambda
    const backtestSubmit = new PythonLambdaFunction(this, "BacktestSubmitLambda", {
      codePath: "lambda/functions/backtests/submit",
      description: "Submit a backtest job to AWS Batch",
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        BACKTESTS_TABLE: bt.backtestsTable.tableName,
        PRESETS_TABLE: bt.presetsTable.tableName,
        JOB_QUEUE: bt.jobQueue.jobQueueArn,
        JOB_DEFINITION: bt.jobDefinition.jobDefinitionArn,
        RESULTS_BUCKET: BACKTEST_BUCKET_NAME,
        GH_TOKEN_SECRET_ARN: ghTokenSecret.secretArn,
      },
    });

    bt.backtestsTable.grantReadWriteData(backtestSubmit.function);
    bt.presetsTable.grantReadData(backtestSubmit.function);
    resultsBucket.grantPut(backtestSubmit.function);
    ghTokenSecret.grantRead(backtestSubmit.function);
    backtestSubmit.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["batch:SubmitJob"],
      resources: [bt.jobQueue.jobQueueArn, bt.jobDefinition.jobDefinitionArn],
    }));

    // Status Lambda
    const backtestStatus = new PythonLambdaFunction(this, "BacktestStatusLambda", {
      codePath: "lambda/functions/backtests/status",
      description: "List/get backtest jobs and generate presigned report URLs",
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        BACKTESTS_TABLE: bt.backtestsTable.tableName,
        RESULTS_BUCKET: BACKTEST_BUCKET_NAME,
      },
    });

    bt.backtestsTable.grantReadWriteData(backtestStatus.function);
    resultsBucket.grantRead(backtestStatus.function);

    // Presets Lambda
    const backtestPresets = new PythonLambdaFunction(this, "BacktestPresetsLambda", {
      codePath: "lambda/functions/backtests/presets",
      description: "CRUD for backtest presets",
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        PRESETS_TABLE: bt.presetsTable.tableName,
      },
    });

    bt.presetsTable.grantReadWriteData(backtestPresets.function);

    // ---- Backtest API Gateway routes ----------------------------------------

    const backtestsResource = this.apiGateway.root.addResource("backtests");

    // POST /backtests — submit
    backtestsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(backtestSubmit.function),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    // GET /backtests — list
    backtestsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(backtestStatus.function),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    // GET /backtests/{id} — detail
    const backtestIdResource = backtestsResource.addResource("{id}");
    backtestIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(backtestStatus.function),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );
    backtestIdResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(backtestStatus.function),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    // Presets: /backtests/presets
    const presetsResource = backtestsResource.addResource("presets");
    presetsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(backtestPresets.function),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );
    presetsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(backtestPresets.function),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    // /backtests/presets/{id}
    const presetIdResource = presetsResource.addResource("{id}");
    presetIdResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(backtestPresets.function),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );
    presetIdResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(backtestPresets.function),
      { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer },
    );

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.apiGateway.url,
      description: "API Gateway URL",
    });
  }
}
