import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as batch from "aws-cdk-lib/aws-batch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface ResearchJobsStackProps extends cdk.StackProps {
  stage: Stage;
  apiGateway: apigateway.RestApi;
  cognitoAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
  researchBucket: s3.IBucket;
  githubEcrRole: iam.IRole;
}

// The research datasets and artifact index (gnome-pipelines DataStack owns the table bucket).
const RESEARCH_TABLE_BUCKET = "gnome-research-tables";
// Per task unless a submit overrides them: NUTS runs 4 chains, and 13 such tasks fit under the 64-vCPU cap at once.
const DEFAULT_CPU = 4;
const DEFAULT_MEMORY_GIB = 14;
const TABLE_READ_ACTIONS = [
  "s3tables:GetTableBucket",
  "s3tables:GetNamespace",
  "s3tables:ListNamespaces",
  "s3tables:ListTables",
  "s3tables:GetTable",
  "s3tables:GetTableMetadataLocation",
  "s3tables:GetTableData",
];

/**
 * Runs any gnomepy-research module at a pushed commit as a spot Batch array job, one task per argument list.
 * Inputs and outputs live in the research bucket under research-jobs/ (inputs/<sha256>/, runs/<run_id>/).
 */
export class ResearchJobsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ResearchJobsStackProps) {
    super(scope, id, props);

    const bucket = props.researchBucket;

    const ecrRepo = new ecr.Repository(this, "ResearchJobImageRepo", {
      repositoryName: "gnomepy-research-job",
      lifecycleRules: [{ maxImageCount: 10 }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    // A policy in this stack rather than a grant on the role, which would make the backtest stack depend on this one.
    new iam.Policy(this, "GithubActionsEcrPushPolicy", {
      roles: [props.githubEcrRole],
      statements: [
        new iam.PolicyStatement({ actions: ["ecr:GetAuthorizationToken"], resources: ["*"] }),
        new iam.PolicyStatement({
          actions: [
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage",
            "ecr:CompleteLayerUpload",
            "ecr:InitiateLayerUpload",
            "ecr:PutImage",
            "ecr:UploadLayerPart",
          ],
          resources: [ecrRepo.repositoryArn],
        }),
      ],
    });

    // ---------------------------------------------------------------------------
    // DynamoDB — run metadata (META) and one TASK#nnnn row per array index
    // ---------------------------------------------------------------------------

    const table = new dynamodb.Table(this, "ResearchJobsTable", {
      tableName: "gnome-research-jobs",
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
    // AWS Batch — its own spot compute environment, so research jobs have their own vCPU cap
    // ---------------------------------------------------------------------------

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcName: "gnome-orchestrator-vpc" });

    const jobRole = new iam.Role(this, "ResearchJobRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    jobRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject", "s3:PutObject"],
      resources: [bucket.arnForObjects("research-jobs/runs/*")],
    }));
    jobRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [bucket.arnForObjects("research-jobs/inputs/*"), bucket.arnForObjects("artifacts/*")],
    }));
    jobRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:ListBucket"],
      resources: [bucket.bucketArn],
      conditions: { StringLike: { "s3:prefix": ["research-jobs/*", "artifacts/*"] } },
    }));
    const tableBucketArn = `arn:aws:s3tables:${this.region}:${this.account}:bucket/${RESEARCH_TABLE_BUCKET}`;
    jobRole.addToPolicy(new iam.PolicyStatement({
      actions: TABLE_READ_ACTIONS,
      resources: [tableBucketArn, `${tableBucketArn}/table/*`],
    }));
    // gnomepy.data finds the table bucket and the artifact root through these.
    jobRole.addToPolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameters"],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/gnome/research/*`],
    }));
    jobRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:gnomepy/gh-token*`],
    }));

    const executionRole = new iam.Role(this, "ResearchJobExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });

    // Research jobs are CPU-bound numeric work (NUTS samples one chain per thread). c7a/m7a give one physical core
    // per vCPU; c7i/m7i are the fastest Intel; 6th-generation types stay as fallbacks so spot capacity never runs
    // dry. c5/m5 ran a monthly fit about 2.5x slower than a laptop, so they are not offered.
    const instanceTypes = [
      ec2.InstanceClass.C7A, ec2.InstanceClass.M7A, ec2.InstanceClass.C7I, ec2.InstanceClass.M7I,
      ec2.InstanceClass.C6I, ec2.InstanceClass.M6I,
    ].flatMap((cls) => [ec2.InstanceSize.XLARGE, ec2.InstanceSize.XLARGE2, ec2.InstanceSize.XLARGE4]
      .map((size) => ec2.InstanceType.of(cls, size)));

    const computeEnvironment = new batch.ManagedEc2EcsComputeEnvironment(this, "ResearchJobComputeEnv", {
      computeEnvironmentName: "gnome-research-spot",
      spot: true,
      instanceTypes,
      useOptimalInstanceClasses: false,
      allocationStrategy: batch.AllocationStrategy.SPOT_PRICE_CAPACITY_OPTIMIZED,
      maxvCpus: 64,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const jobQueue = new batch.JobQueue(this, "ResearchJobQueue", {
      jobQueueName: "gnome-research-queue",
      computeEnvironments: [{ computeEnvironment, order: 1 }],
    });

    const jobDefinition = new batch.EcsJobDefinition(this, "ResearchJobDefinition", {
      jobDefinitionName: "gnome-research-job",
      container: new batch.EcsEc2ContainerDefinition(this, "ResearchJobContainer", {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepo, "latest"),
        cpu: DEFAULT_CPU,
        memory: cdk.Size.gibibytes(DEFAULT_MEMORY_GIB),
        jobRole,
        executionRole,
        environment: { AWS_DEFAULT_REGION: this.region, STAGE: props.stage, S3_BUCKET: bucket.bucketName },
      }),
      // Retry only what the job didn't cause: a reclaimed spot instance or an image pull. A failing module
      // would fail the same way again.
      retryAttempts: 3,
      retryStrategies: [
        batch.RetryStrategy.of(batch.Action.RETRY, batch.Reason.SPOT_INSTANCE_RECLAIMED),
        batch.RetryStrategy.of(batch.Action.RETRY, batch.Reason.CANNOT_PULL_CONTAINER),
        batch.RetryStrategy.of(batch.Action.EXIT, batch.Reason.NON_ZERO_EXIT_CODE),
      ],
      timeout: cdk.Duration.hours(12),
    });

    // ---------------------------------------------------------------------------
    // Lambda functions
    // ---------------------------------------------------------------------------

    const commonEnv = {
      DYNAMODB_TABLE: table.tableName,
      S3_BUCKET: bucket.bucketName,
    };

    const submitLambda = new PythonLambdaFunction(this, "ResearchJobSubmitLambda", {
      codePath: "lambda/functions/research-jobs/submit",
      functionName: "gnome-research-job-submit",
      description: "Submit a research job (one Batch array job) for a gnomepy-research module",
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        ...commonEnv,
        BATCH_JOB_QUEUE: jobQueue.jobQueueArn,
        BATCH_JOB_DEFINITION: jobDefinition.jobDefinitionArn,
        DEFAULT_CPU: String(DEFAULT_CPU),
        DEFAULT_MEMORY_GIB: String(DEFAULT_MEMORY_GIB),
      },
    });
    table.grantWriteData(submitLambda.function);
    submitLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject"],
      resources: [bucket.arnForObjects("research-jobs/runs/*")],
    }));
    submitLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [bucket.arnForObjects("research-jobs/inputs/*")],
    }));
    submitLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:ListBucket"],
      resources: [bucket.bucketArn],
      conditions: { StringLike: { "s3:prefix": ["research-jobs/inputs/*"] } },
    }));
    submitLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["batch:SubmitJob"],
      resources: [jobQueue.jobQueueArn, jobDefinition.jobDefinitionArn],
    }));

    const inputsLambda = new PythonLambdaFunction(this, "ResearchJobInputsLambda", {
      codePath: "lambda/functions/research-jobs/inputs",
      functionName: "gnome-research-job-inputs",
      description: "Presign uploads of a research job input set (content-addressed)",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv },
    });
    inputsLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject", "s3:PutObject"],
      resources: [bucket.arnForObjects("research-jobs/inputs/*")],
    }));
    inputsLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["s3:ListBucket"],
      resources: [bucket.bucketArn],
      conditions: { StringLike: { "s3:prefix": ["research-jobs/inputs/*"] } },
    }));

    const getLambda = new PythonLambdaFunction(this, "ResearchJobGetLambda", {
      codePath: "lambda/functions/research-jobs/get",
      functionName: "gnome-research-job-get",
      description: "Get a research job and its task statuses",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv },
    });
    table.grantReadData(getLambda.function);

    const listLambda = new PythonLambdaFunction(this, "ResearchJobListLambda", {
      codePath: "lambda/functions/research-jobs/list",
      functionName: "gnome-research-job-list",
      description: "List research jobs",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv },
    });
    table.grantReadData(listLambda.function);

    const cancelLambda = new PythonLambdaFunction(this, "ResearchJobCancelLambda", {
      codePath: "lambda/functions/research-jobs/cancel",
      functionName: "gnome-research-job-cancel",
      description: "Cancel a research job",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonEnv },
    });
    table.grantReadWriteData(cancelLambda.function);
    cancelLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["batch:TerminateJob"],
      resources: ["*"],
    }));

    const statusHandlerLambda = new PythonLambdaFunction(this, "ResearchJobStatusHandlerLambda", {
      codePath: "lambda/functions/research-jobs/status-handler",
      description: "Record research job task state changes from Batch",
      timeout: cdk.Duration.seconds(60),
      environment: { ...commonEnv },
    });
    table.grantReadWriteData(statusHandlerLambda.function);

    new events.Rule(this, "ResearchJobStateChangeRule", {
      eventPattern: {
        source: ["aws.batch"],
        detailType: ["Batch Job State Change"],
        detail: { jobQueue: [jobQueue.jobQueueArn] },
      },
      targets: [new targets.LambdaFunction(statusHandlerLambda.function)],
    });

    // ---------------------------------------------------------------------------
    // API Gateway routes — Cognito auth (shared authorizer from BackendStack)
    // ---------------------------------------------------------------------------

    const cognitoOpts: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: props.cognitoAuthorizer,
    };

    const jobsResource = props.apiGateway.root.addResource("research-jobs");
    jobsResource.addMethod("GET", new apigateway.LambdaIntegration(listLambda.function), cognitoOpts);
    jobsResource.addMethod("POST", new apigateway.LambdaIntegration(submitLambda.function), cognitoOpts);

    jobsResource.addResource("inputs")
      .addMethod("POST", new apigateway.LambdaIntegration(inputsLambda.function), cognitoOpts);

    const runResource = jobsResource.addResource("{runId}");
    runResource.addMethod("GET", new apigateway.LambdaIntegration(getLambda.function), cognitoOpts);
    runResource.addMethod("DELETE", new apigateway.LambdaIntegration(cancelLambda.function), cognitoOpts);

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: ecrRepo.repositoryUri,
      description: "ECR repository URI for the gnomepy-research-job image",
    });
  }
}
