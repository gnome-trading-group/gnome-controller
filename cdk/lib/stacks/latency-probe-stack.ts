import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { PythonLambdaFunction } from "../constructs/python-lambda";

export const PROBE_LAMBDA_NAME = "latency-probe";

export const PROBE_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-south-1",
  "sa-east-1",
];

interface LatencyProbeStackProps extends cdk.StackProps {
  /**
   * The region where this stack is deployed.
   * Used to determine if this is a probe stack or orchestrator stack.
   */
  readonly deploymentRegion: string;
}

/**
 * Stack for deploying latency probe Lambda.
 * This stack is deployed to multiple regions - one per region we want to probe from.
 */
export class LatencyProbeStack extends cdk.Stack {
  public readonly probeLambda: PythonLambdaFunction;

  constructor(scope: Construct, id: string, props: LatencyProbeStackProps) {
    super(scope, id, props);

    this.probeLambda = new PythonLambdaFunction(this, "LatencyProbeLambda", {
      functionName: PROBE_LAMBDA_NAME,
      codePath: "lambda/functions/latency-probe/probe",
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      description: `Latency probe Lambda for region ${props.deploymentRegion}`,
      environment: {
        REGION: props.deploymentRegion,
      },
    });

    new cdk.CfnOutput(this, "ProbeLambdaArn", {
      value: this.probeLambda.function.functionArn,
      description: `Latency Probe Lambda ARN in ${props.deploymentRegion}`,
      exportName: `LatencyProbeLambdaArn-${props.deploymentRegion}`,
    });
  }
}

/**
 * Create an IAM policy statement that allows invoking probe Lambdas in all regions.
 * Used by the orchestrator Lambda.
 */
export function createProbeInvokePolicy(accountId: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["lambda:InvokeFunction"],
    resources: PROBE_REGIONS.map(
      (region) => `arn:aws:lambda:${region}:${accountId}:function:${PROBE_LAMBDA_NAME}`
    ),
  });
}

