import * as cdk from "aws-cdk-lib";
import * as batch from "aws-cdk-lib/aws-batch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export const BACKTEST_BUCKET_NAME = "gnome-research";
export const BACKTEST_ECR_REPO = "gnomepy-backtest";

interface BacktestStackProps extends cdk.StackProps {
  stage: Stage;
}

export class BacktestStack extends cdk.Stack {
  public readonly jobQueue: batch.IJobQueue;
  public readonly jobDefinition: batch.IJobDefinition;
  public readonly backtestsTable: dynamodb.ITable;
  public readonly presetsTable: dynamodb.ITable;
  public readonly resultsBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: BacktestStackProps) {
    super(scope, id, props);

    const stage = props.stage;

    // ---- S3 bucket (existing) ------------------------------------------------
    this.resultsBucket = s3.Bucket.fromBucketName(
      this, "ResultsBucket", BACKTEST_BUCKET_NAME,
    );

    // ---- DynamoDB tables -----------------------------------------------------
    this.backtestsTable = new dynamodb.Table(this, "BacktestsTable", {
      tableName: `gnome-backtests-${stage}`,
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.presetsTable = new dynamodb.Table(this, "PresetsTable", {
      tableName: `gnome-backtest-presets-${stage}`,
      partitionKey: { name: "presetId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---- Batch compute environment -------------------------------------------
    const computeEnv = new batch.FargateComputeEnvironment(this, "BacktestComputeEnv", {
      maxvCpus: 4,
      spot: false,
    });

    this.jobQueue = new batch.JobQueue(this, "BacktestJobQueue", {
      jobQueueName: `gnome-backtests-${stage}`,
      priority: 1,
      computeEnvironment: [
        { computeEnvironment: computeEnv, order: 1 },
      ],
    });

    // ---- ECR repo (existing) -------------------------------------------------
    const ecrRepo = ecr.Repository.fromRepositoryName(
      this, "BacktestEcrRepo", BACKTEST_ECR_REPO,
    );

    // ---- Batch task role (assumed by the running container) -------------------
    const taskRole = new iam.Role(this, "BacktestTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Role assumed by backtest Fargate containers",
    });

    // Container needs S3 access for market data + results
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      resources: [
        this.resultsBucket.bucketArn,
        `${this.resultsBucket.bucketArn}/*`,
        "arn:aws:s3:::gnome-market-data-prod",
        "arn:aws:s3:::gnome-market-data-prod/*",
      ],
    }));

    // ---- Batch job definition ------------------------------------------------
    this.jobDefinition = new batch.EcsJobDefinition(this, "BacktestJobDef", {
      jobDefinitionName: `gnome-backtest-${stage}`,
      container: new batch.EcsFargateContainerDefinition(this, "BacktestContainer", {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepo, "latest"),
        cpu: 1,
        memory: cdk.Size.gibibytes(2),
        jobRole: taskRole,
        fargatePlatformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      timeout: cdk.Duration.minutes(30),
      retryAttempts: 0,
    });

    // ---- EventBridge: Batch job state change → status-sync Lambda -------------
    const statusSyncLambda = new PythonLambdaFunction(this, "BacktestStatusSyncLambda", {
      codePath: "lambda/functions/backtests/status-sync",
      description: "Syncs Batch job status changes to DynamoDB",
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        BACKTESTS_TABLE: this.backtestsTable.tableName,
        RESULTS_BUCKET: BACKTEST_BUCKET_NAME,
      },
    });

    this.backtestsTable.grantReadWriteData(statusSyncLambda.function);

    new events.Rule(this, "BatchJobStateChangeRule", {
      eventPattern: {
        source: ["aws.batch"],
        detailType: ["Batch Job State Change"],
        detail: {
          jobQueue: [this.jobQueue.jobQueueArn],
        },
      },
      targets: [new targets.LambdaFunction(statusSyncLambda.function)],
    });

    // ---- Outputs -------------------------------------------------------------
    new cdk.CfnOutput(this, "JobQueueArn", {
      value: this.jobQueue.jobQueueArn,
    });
    new cdk.CfnOutput(this, "JobDefinitionArn", {
      value: this.jobDefinition.jobDefinitionArn,
    });
  }
}
