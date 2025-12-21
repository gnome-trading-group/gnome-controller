import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

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
  public readonly probeLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: LatencyProbeStackProps) {
    super(scope, id, props);

    const commonLayer = new lambda.LayerVersion(this, "LatencyProbeCommonLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../../lambda/layers/common"), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            "bash",
            "-c",
            "pip install -r requirements.txt -t /asset-output/python && cp -r python/* /asset-output/python/",
          ],
        },
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      description: "Common utilities for latency probe Lambda",
    });

    this.probeLambda = new lambda.Function(this, "LatencyProbeLambda", {
      functionName: PROBE_LAMBDA_NAME,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../lambda/functions/latency-probe/probe")
      ),
      layers: [commonLayer],
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      description: `Latency probe Lambda for region ${props.deploymentRegion}`,
      environment: {
        REGION: props.deploymentRegion,
      },
    });

    new cdk.CfnOutput(this, "ProbeLambdaArn", {
      value: this.probeLambda.functionArn,
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

