import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export interface SystemHealthStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
  cognitoAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
  // Deploy pipelines live in another account; this role there (created by gnome-shared-infra) lets the page read them.
  pipelinesRoleArn: string;
  pipelinesRegion: string;
  // Set only where the page may approve or reject pipeline approvals (prod); elsewhere it shows them read-only.
  approvalsRoleArn?: string;
}

// The controller's System page: the account's health, discovered across every enabled region. Read-only, and
// account-wide by design, so new alarms, queues, jobs and pipelines appear without changes here.
export class SystemHealthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SystemHealthStackProps) {
    super(scope, id, props);

    const healthLambda = new PythonLambdaFunction(this, "SystemHealthLambda", {
      codePath: "lambda/functions/system-health",
      functionName: "gnome-system-health",
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

    const cognito = { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer: props.cognitoAuthorizer };
    props.apiGateway.root.resourceForPath("system/health")
      .addMethod("GET", new apigateway.LambdaIntegration(healthLambda.function), cognito);

    if (props.approvalsRoleArn) {
      // A separate function, so the page's account-wide reads never hold the right to approve.
      const approvalsLambda = new PythonLambdaFunction(this, "SystemApprovalsLambda", {
        codePath: "lambda/functions/system-approvals",
        functionName: "gnome-system-approvals",
        description: "Approve or reject a waiting deploy-pipeline approval from the System page",
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
      props.apiGateway.root.resourceForPath("system/approvals")
        .addMethod("POST", new apigateway.LambdaIntegration(approvalsLambda.function), cognito);
    }
  }
}
