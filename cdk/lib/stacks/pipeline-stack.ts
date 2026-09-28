import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface PipelineStackProps extends cdk.StackProps {
  stage: Stage;
  apiGateway: apigateway.RestApi;
  cognitoAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const bucketName = `gnome-research-${props.stage}`;

    // ---------------------------------------------------------------------------
    // Shared resources (imported from other stacks by name)
    // ---------------------------------------------------------------------------

    const researchTable = dynamodb.Table.fromTableName(this, "ResearchTable", "gnome-research-sessions");
    const researchBucket = s3.Bucket.fromBucketName(this, "ResearchBucket", bucketName);

    // ---------------------------------------------------------------------------
    // ECR repository for gnomepy-pipelines image
    // ---------------------------------------------------------------------------

    const ecrRepo = new ecr.Repository(this, "PipelinesImageRepo", {
      repositoryName: "gnomepy-pipelines",
      lifecycleRules: [{ maxImageCount: 10 }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------------------------------------------------------------------------
    // GitHub Actions IAM role for pushing the pipelines image to ECR
    // OIDC provider already exists (created by BacktestStack) — import by ARN.
    // ---------------------------------------------------------------------------

    const githubOidc = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GithubActionsOidcProvider",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    const githubEcrRole = new iam.Role(this, "GithubActionsEcrRole", {
      assumedBy: new iam.WebIdentityPrincipal(githubOidc.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub":
            "repo:gnome-trading-group/gnomepy-research:ref:refs/heads/main",
        },
      }),
      description: "Assumed by GitHub Actions gnomepy-research CI to push pipelines image to ECR",
    });
    ecrRepo.grantPush(githubEcrRole);

    new cdk.CfnOutput(this, "GithubActionsEcrRoleArn", {
      value: githubEcrRole.roleArn,
      description: "Set as AWS_ECR_ROLE_ARN_DEV / AWS_ECR_ROLE_ARN_PROD secret in gnomepy-research repo",
    });

    // ---------------------------------------------------------------------------
    // VPC + Security group for Fargate tasks
    // ---------------------------------------------------------------------------

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcName: "gnome-orchestrator-vpc" });

    const taskSecurityGroup = new ec2.SecurityGroup(this, "PipelineTaskSg", {
      vpc,
      allowAllOutbound: true,
      description: "Pipeline Fargate tasks — outbound-only",
    });

    // ---------------------------------------------------------------------------
    // ECS Fargate cluster + task definition
    // ---------------------------------------------------------------------------

    const cluster = new ecs.Cluster(this, "PipelineCluster", {
      vpc,
      clusterName: "gnome-pipeline-cluster",
    });

    const taskRole = new iam.Role(this, "PipelineTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    researchTable.grantReadWriteData(taskRole);
    researchBucket.grantReadWrite(taskRole);

    const executionRole = new iam.Role(this, "PipelineExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });
    ecrRepo.grantPull(executionRole);

    const taskDef = new ecs.FargateTaskDefinition(this, "PipelineTaskDef", {
      memoryLimitMiB: 4096,
      cpu: 1024,
      taskRole,
      executionRole,
    });

    taskDef.addContainer("pipeline", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepo, "latest"),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "pipeline" }),
      environment: {
        DYNAMODB_TABLE: researchTable.tableName,
        S3_BUCKET: bucketName,
        STAGE: props.stage,
      },
    });

    const subnetIds = vpc.publicSubnets.map((s) => s.subnetId).join(",");

    // ---------------------------------------------------------------------------
    // EventBridge Scheduler IAM role (invokes trigger Lambda on schedule)
    // ---------------------------------------------------------------------------

    const schedulerRole = new iam.Role(this, "PipelineSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });

    // ---------------------------------------------------------------------------
    // Lambda functions
    // ---------------------------------------------------------------------------

    const commonEnv = { DYNAMODB_TABLE: researchTable.tableName };

    const listPipelinesLambda = new PythonLambdaFunction(this, "ListPipelinesLambda", {
      codePath: "lambda/functions/pipelines/list-pipelines",
      functionName: "gnome-pipeline-list",
      description: "List pipeline definitions",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    researchTable.grantReadData(listPipelinesLambda.function);

    const createPipelineLambda = new PythonLambdaFunction(this, "CreatePipelineLambda", {
      codePath: "lambda/functions/pipelines/create-pipeline",
      functionName: "gnome-pipeline-create",
      description: "Create a pipeline definition",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    researchTable.grantWriteData(createPipelineLambda.function);

    const getPipelineLambda = new PythonLambdaFunction(this, "GetPipelineLambda", {
      codePath: "lambda/functions/pipelines/get-pipeline",
      functionName: "gnome-pipeline-get",
      description: "Get a pipeline definition and recent runs",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    researchTable.grantReadData(getPipelineLambda.function);

    const triggerPipelineLambda = new PythonLambdaFunction(this, "TriggerPipelineLambda", {
      codePath: "lambda/functions/pipelines/trigger-pipeline",
      functionName: "gnome-pipeline-trigger",
      description: "Trigger a pipeline run (manual or scheduled)",
      timeout: cdk.Duration.seconds(60),
      environment: {
        ...commonEnv,
        ECS_CLUSTER_ARN: cluster.clusterArn,
        ECS_TASK_DEF_ARN: taskDef.taskDefinitionArn,
        ECS_SUBNET_IDS: subnetIds,
        ECS_SECURITY_GROUP_ID: taskSecurityGroup.securityGroupId,
      },
    });
    researchTable.grantReadWriteData(triggerPipelineLambda.function);
    triggerPipelineLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ecs:RunTask"],
      resources: [taskDef.taskDefinitionArn],
    }));
    triggerPipelineLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["iam:PassRole"],
      resources: [taskRole.roleArn, executionRole.roleArn],
    }));
    schedulerRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [triggerPipelineLambda.function.functionArn],
    }));
    triggerPipelineLambda.function.grantInvoke(schedulerRole);

    const updatePipelineLambda = new PythonLambdaFunction(this, "UpdatePipelineLambda", {
      codePath: "lambda/functions/pipelines/update-pipeline",
      functionName: "gnome-pipeline-update",
      description: "Update pipeline config and manage EventBridge Scheduler",
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
        TRIGGER_LAMBDA_ARN: triggerPipelineLambda.function.functionArn,
        SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
      },
    });
    researchTable.grantReadWriteData(updatePipelineLambda.function);
    updatePipelineLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule"],
      resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/pipeline-*`],
    }));
    updatePipelineLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["iam:PassRole"],
      resources: [schedulerRole.roleArn],
    }));

    const pipelineStatusLambda = new PythonLambdaFunction(this, "PipelineStatusLambda", {
      codePath: "lambda/functions/pipelines/pipeline-status",
      functionName: "gnome-pipeline-status",
      description: "Update run status on ECS task STOPPED events",
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
    });
    researchTable.grantReadWriteData(pipelineStatusLambda.function);

    // ---------------------------------------------------------------------------
    // EventBridge rule: ECS task STOPPED → pipeline-status Lambda
    // ---------------------------------------------------------------------------

    new events.Rule(this, "PipelineTaskStopRule", {
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: {
          clusterArn: [cluster.clusterArn],
          lastStatus: ["STOPPED"],
        },
      },
      targets: [new targets.LambdaFunction(pipelineStatusLambda.function)],
    });

    // ---------------------------------------------------------------------------
    // API Gateway routes — /research/pipelines
    // ---------------------------------------------------------------------------

    const cognitoOpts: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: props.cognitoAuthorizer,
    };

    const researchResource = props.apiGateway.root.getResource("research") ??
      props.apiGateway.root.addResource("research");
    const pipelinesResource = researchResource.addResource("pipelines");

    pipelinesResource.addMethod("GET", new apigateway.LambdaIntegration(listPipelinesLambda.function), cognitoOpts);
    pipelinesResource.addMethod("POST", new apigateway.LambdaIntegration(createPipelineLambda.function), cognitoOpts);

    const pipelineResource = pipelinesResource.addResource("{pipelineName}");
    pipelineResource.addMethod("GET", new apigateway.LambdaIntegration(getPipelineLambda.function), cognitoOpts);
    pipelineResource.addMethod("PUT", new apigateway.LambdaIntegration(updatePipelineLambda.function), cognitoOpts);

    const triggerResource = pipelineResource.addResource("trigger");
    triggerResource.addMethod("POST", new apigateway.LambdaIntegration(triggerPipelineLambda.function), cognitoOpts);
  }
}
