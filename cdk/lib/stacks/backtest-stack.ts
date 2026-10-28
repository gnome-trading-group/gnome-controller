import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as batch from "aws-cdk-lib/aws-batch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import {
  API_KEY_SECRET_NAMES, CallerKind, GnomeApiAuthorizer, lookupPlatformNetwork, Stage,
} from "@gnome-trading-group/gnome-shared-cdk";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface BacktestStackProps extends cdk.StackProps {
  stage: Stage;
  apiGateway: apigateway.RestApi;
  auth: GnomeApiAuthorizer;
}

export class BacktestStack extends cdk.Stack {
  // Driven by Batch events, not the API, so its failures need their own alarm (MonitoringStack).
  public readonly statusHandler: lambda.IFunction;
  public readonly researchBucket: s3.Bucket;
  public readonly githubEcrRole: iam.Role;

  constructor(scope: Construct, id: string, props: BacktestStackProps) {
    super(scope, id, props);

    const bucketName = `gnome-research-${props.stage}`;

    // ---------------------------------------------------------------------------
    // S3 — research results bucket
    // ---------------------------------------------------------------------------

    const researchBucket = new s3.Bucket(this, "ResearchBucket", {
      bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // Research job inputs are kept: they are what makes an old run reproducible.
      lifecycleRules: [{ prefix: "research-jobs/runs/", expiration: cdk.Duration.days(90) }],
    });
    this.researchBucket = researchBucket;

    // ---------------------------------------------------------------------------
    // ECR repository
    // ---------------------------------------------------------------------------

    const ecrRepo = new ecr.Repository(this, "BacktestImageRepo", {
      repositoryName: "gnomepy-backtest",
      lifecycleRules: [{ maxImageCount: 10 }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------------------------------------------------------------------------
    // DynamoDB — job metadata
    // ---------------------------------------------------------------------------

    const table = new dynamodb.Table(this, "BacktestTable", {
      tableName: "gnome-backtests",
      partitionKey: { name: "run_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    table.addGlobalSecondaryIndex({
      indexName: "status-submitted-index",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "submitted_at", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ---------------------------------------------------------------------------
    // AWS Batch — Spot compute
    // ---------------------------------------------------------------------------

    const { vpc, securityGroup } = lookupPlatformNetwork(this);

    const batchJobRole = new iam.Role(this, "BatchJobRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    const marketDataBucketName = `gnome-market-data-${props.stage}`;
    batchJobRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      resources: [
        `arn:aws:s3:::${marketDataBucketName}`,
        `arn:aws:s3:::${marketDataBucketName}/*`,
        researchBucket.bucketArn,
        `${researchBucket.bucketArn}/*`,
      ],
    }));
    batchJobRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:gnomepy/gh-token*`],
    }));
    // gnomepy reads the registry's and market-data API's keys from their mirrors: the registry for listings and
    // streams, market-data for where a backtest's data is missing.
    batchJobRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [API_KEY_SECRET_NAMES.REGISTRY, API_KEY_SECRET_NAMES.MARKET_DATA].map(
        (name) => `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${name}-*`),
    }));

    const batchExecutionRole = new iam.Role(this, "BatchExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });

    const computeEnvironment = new batch.ManagedEc2EcsComputeEnvironment(this, "BacktestComputeEnv", {
      // Renamed when it moved to the platform network: a named compute environment can't be replaced in place.
      computeEnvironmentName: "gnome-backtest-spot-platform",
      spot: true,
      instanceTypes: [
        ec2.InstanceType.of(ec2.InstanceClass.C5, ec2.InstanceSize.XLARGE),
        ec2.InstanceType.of(ec2.InstanceClass.C5, ec2.InstanceSize.XLARGE2),
        ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.XLARGE),
        ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.XLARGE2),
      ],
      maxvCpus: 64,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [securityGroup],
    });

    const jobQueue = new batch.JobQueue(this, "BacktestJobQueue", {
      jobQueueName: "gnome-backtest-queue",
      computeEnvironments: [{ computeEnvironment, order: 1 }],
    });

    const jobDefinition = new batch.EcsJobDefinition(this, "BacktestJobDefinition", {
      jobDefinitionName: "gnome-backtest",
      container: new batch.EcsEc2ContainerDefinition(this, "BacktestContainer", {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepo, "latest"),
        cpu: 4,
        memory: cdk.Size.gibibytes(8),
        jobRole: batchJobRole,
        executionRole: batchExecutionRole,
        environment: { AWS_DEFAULT_REGION: this.region, STAGE: props.stage },
      }),
      retryAttempts: 2,
    });

    // ---------------------------------------------------------------------------
    // Lambda functions
    // ---------------------------------------------------------------------------

    const commonEnv = {
      DYNAMODB_TABLE: table.tableName,
      S3_BUCKET: researchBucket.bucketName,
    };

    const submitLambda = new PythonLambdaFunction(this, "BacktestSubmitLambda", {
      codePath: "lambda/functions/backtests/submit",
      functionName: "gnome-backtest-submit",
      description: "Submit a backtest run (or sweep) to AWS Batch",
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        ...commonEnv,
        BATCH_JOB_QUEUE: jobQueue.jobQueueArn,
        BATCH_JOB_DEFINITION: jobDefinition.jobDefinitionArn,
      },
    });
    table.grantWriteData(submitLambda.function);
    submitLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject"],
      resources: [`${researchBucket.bucketArn}/backtests/*`],
    }));
    submitLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["batch:SubmitJob"],
      resources: [jobQueue.jobQueueArn, jobDefinition.jobDefinitionArn],
    }));

    const getLambda = new PythonLambdaFunction(this, "BacktestGetLambda", {
      codePath: "lambda/functions/backtests/get",
      functionName: "gnome-backtest-get",
      description: "Get backtest run details and job statuses",
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
      },
    });
    table.grantReadData(getLambda.function);
    getLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [`${researchBucket.bucketArn}/backtests/*`],
    }));

    const listLambda = new PythonLambdaFunction(this, "BacktestListLambda", {
      codePath: "lambda/functions/backtests/list",
      functionName: "gnome-backtest-list",
      description: "List backtest runs",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv },
    });
    table.grantReadData(listLambda.function);

    const cancelLambda = new PythonLambdaFunction(this, "BacktestCancelLambda", {
      codePath: "lambda/functions/backtests/cancel",
      functionName: "gnome-backtest-cancel",
      description: "Cancel a backtest run",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv },
    });
    table.grantReadWriteData(cancelLambda.function);
    cancelLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["batch:TerminateJob"],
      resources: ["*"],
    }));

    const logsLambda = new PythonLambdaFunction(this, "BacktestLogsLambda", {
      codePath: "lambda/functions/batch-logs",
      functionName: "gnome-backtest-logs",
      description: "Read a backtest job's log lines",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv, TASK_SK_PREFIX: "JOB#" },
    });
    table.grantReadData(logsLambda.function);
    logsLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["logs:GetLogEvents"],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/batch/job:*`],
    }));

    const statusHandlerLambda = new PythonLambdaFunction(this, "BacktestStatusHandlerLambda", {
      codePath: "lambda/functions/backtests/status-handler",
      description: "Handle Batch job state changes and update DynamoDB",
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: { ...commonEnv },
    });
    table.grantReadWriteData(statusHandlerLambda.function);
    this.statusHandler = statusHandlerLambda.function;
    statusHandlerLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [`${researchBucket.bucketArn}/backtests/*`],
    }));

    // ---------------------------------------------------------------------------
    // EventBridge — Batch job state changes → status handler
    // ---------------------------------------------------------------------------

    new events.Rule(this, "BatchJobStateChangeRule", {
      eventPattern: {
        source: ["aws.batch"],
        detailType: ["Batch Job State Change"],
        detail: {
          jobQueue: [jobQueue.jobQueueArn],
        },
      },
      targets: [new targets.LambdaFunction(statusHandlerLambda.function)],
    });

    // ---------------------------------------------------------------------------
    // API Gateway routes — people only (shared authorizer from BackendStack)
    // ---------------------------------------------------------------------------

    const personOpts: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: props.auth.authorizerFor([CallerKind.PERSON]),
    };

    const backtestsResource = props.apiGateway.root.addResource("backtests");
    backtestsResource.addMethod("GET", new apigateway.LambdaIntegration(listLambda.function), personOpts);
    backtestsResource.addMethod("POST", new apigateway.LambdaIntegration(submitLambda.function), personOpts);

    const runResource = backtestsResource.addResource("{runId}");
    runResource.addMethod("GET", new apigateway.LambdaIntegration(getLambda.function), personOpts);
    runResource.addMethod("DELETE", new apigateway.LambdaIntegration(cancelLambda.function), personOpts);
    runResource.addResource("jobs").addResource("{index}").addResource("logs")
      .addMethod("GET", new apigateway.LambdaIntegration(logsLambda.function), personOpts);

    // ---------------------------------------------------------------------------
    // GitHub Actions OIDC — allows CI to push images to ECR without long-lived keys
    // ---------------------------------------------------------------------------

    // One OIDC provider per AWS account. Safe to create here; will fail on a
    // second stack in the same account — import with fromOpenIdConnectProviderArn
    // if that ever becomes necessary.
    const githubOidc = new iam.OpenIdConnectProvider(this, "GithubActionsOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
      // GitHub's current OIDC thumbprints (AWS validates aud claim, not thumbprint,
      // for well-known providers, but CDK requires at least one entry).
      thumbprints: [
        "6938fd4d98bab03faadb97b34396831e3780aea1",
        "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
      ],
    });

    const githubEcrRole = new iam.Role(this, "GithubActionsEcrRole", {
      assumedBy: new iam.WebIdentityPrincipal(githubOidc.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub":
            "repo:gnome-trading-group/gnomepy:ref:refs/heads/main",
        },
      }),
      description: "Assumed by GitHub Actions gnomepy CI to push backtest image to ECR",
    });

    ecrRepo.grantPush(githubEcrRole);
    this.githubEcrRole = githubEcrRole;

    // ---------------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------------

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: ecrRepo.repositoryUri,
      description: "ECR repository URI for gnomepy-backtest image",
    });
    new cdk.CfnOutput(this, "GithubActionsEcrRoleArn", {
      value: githubEcrRole.roleArn,
      description: "IAM role ARN for GitHub Actions ECR push — set as AWS_ECR_ROLE_ARN secret in gnomepy repo",
    });
  }
}
