import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { CallerKind, GnomeApiAuthorizer } from "@gnome-trading-group/gnome-shared-cdk";
import { SYSTEM_APPROVALS_LAMBDA_ROLE, SYSTEM_HEALTH_LAMBDA_ROLE } from "../config";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface SystemHealthStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
  auth: GnomeApiAuthorizer;
  // Deploy pipelines live in another account; this role there (created by gnome-shared-infra) lets the page read them.
  pipelinesRoleArn: string;
  pipelinesRegion: string;
  // Set only where the page may approve or reject pipeline approvals (prod); elsewhere it shows them read-only.
  approvalsRoleArn?: string;
}

// The controller's System page: the account's health, discovered across every enabled region. Account-wide by
// design, so new alarms, queues, jobs and pipelines appear without changes here.
export class SystemHealthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SystemHealthStackProps) {
    super(scope, id, props);

    const healthLambda = new PythonLambdaFunction(this, "SystemHealthLambda", {
      codePath: "lambda/functions/system-health",
      functionName: "gnome-system-health",
      roleName: SYSTEM_HEALTH_LAMBDA_ROLE,
      description: "Account health for the controller's System page (read-only, all regions)",
      timeout: cdk.Duration.seconds(29),
      memorySize: 512,
      environment: {
        PIPELINES_READ_ROLE_ARN: props.pipelinesRoleArn,
        PIPELINES_REGION: props.pipelinesRegion,
        APPROVALS_ENABLED: props.approvalsRoleArn ? "true" : "false",
      },
    });
    healthLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ["sts:AssumeRole"],
      resources: [props.pipelinesRoleArn],
    }));
    healthLambda.function.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "ec2:DescribeRegions",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:DescribeImages",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:GetMetricData",
        "events:ListRules",
        "events:ListTargetsByRule",
        "sqs:ListQueues",
        "sqs:GetQueueAttributes",
        "rds:DescribeDBInstances",
      ],
      resources: ["*"],
    }));

    // gnome-bot reads health to answer "is anything broken"; approving a deploy stays a person's.
    const healthIntegration = new apigateway.LambdaIntegration(healthLambda.function);
    props.auth.addRoute(props.apiGateway.root, "system/health", healthIntegration,
      { GET: [CallerKind.PERSON, CallerKind.BOT] });
    // One pipeline's runs and actions, and a build's logs, read when someone opens it on the page.
    props.auth.addRoute(props.apiGateway.root, "system/pipelines/{name}", healthIntegration,
      { GET: [CallerKind.PERSON, CallerKind.BOT] });
    props.auth.addRoute(props.apiGateway.root, "system/pipelines/{name}/logs", healthIntegration,
      { GET: [CallerKind.PERSON, CallerKind.BOT] });

    if (props.approvalsRoleArn) {
      // A separate function, so the page's account-wide reads never hold the right to approve.
      const approvalsLambda = new PythonLambdaFunction(this, "SystemApprovalsLambda", {
        codePath: "lambda/functions/system-approvals",
        functionName: "gnome-system-approvals",
        roleName: SYSTEM_APPROVALS_LAMBDA_ROLE,
        description: "Approve, retry, release or stop deploy pipeline runs from the System page",
        timeout: cdk.Duration.seconds(15),
        environment: {
          APPROVALS_ROLE_ARN: props.approvalsRoleArn,
          PIPELINES_REGION: props.pipelinesRegion,
        },
      });
      approvalsLambda.function.addToRolePolicy(new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [props.approvalsRoleArn],
      }));
      const approvalsIntegration = new apigateway.LambdaIntegration(approvalsLambda.function);
      props.auth.addRoute(props.apiGateway.root, "system/approvals", approvalsIntegration, { POST: [CallerKind.PERSON] });
      // Retry a failed stage, release the latest change, or stop a run.
      props.auth.addRoute(props.apiGateway.root, "system/pipelines/{name}/operations", approvalsIntegration,
        { POST: [CallerKind.PERSON] });
    }
  }
}
