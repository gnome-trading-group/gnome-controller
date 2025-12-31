import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

const COMMON_LAYER_PATH = "lambda/layers/common";
const DEFAULT_RUNTIME = lambda.Runtime.PYTHON_3_13;

export interface PythonLambdaFunctionProps {
  readonly codePath: string;
  readonly description?: string;
  readonly memorySize?: number;
  readonly timeout?: cdk.Duration;
  readonly environment?: { [key: string]: string };
  readonly functionName?: string;
}

/**
 * A Python Lambda function with the common layer automatically attached.
 *
 * This construct:
 * - Creates a Lambda function with Python 3.13 runtime
 * - Automatically attaches the common layer with bundled dependencies
 * - Uses sensible defaults for memory, timeout, and handler
 *
 * Usage:
 * ```typescript
 * const myLambda = new PythonLambdaFunction(this, "MyLambda", {
 *   codePath: "lambda/functions/my-function",
 *   description: "My Lambda function",
 *   memorySize: 512,
 *   timeout: cdk.Duration.minutes(1),
 *   environment: {
 *     MY_VAR: "value",
 *   },
 * });
 *
 * // Access the underlying function for permissions, etc.
 * myLambda.function.addToRolePolicy(...);
 * ```
 */
export class PythonLambdaFunction extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: PythonLambdaFunctionProps) {
    super(scope, id);

    const layer = this.getOrCreateCommonLayer();

    this.function = new lambda.Function(this, "Function", {
      functionName: props.functionName,
      runtime: DEFAULT_RUNTIME,
      handler: "index.handler",
      code: lambda.Code.fromAsset(props.codePath),
      layers: [layer],
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout ?? cdk.Duration.seconds(30),
      description: props.description,
      environment: props.environment,
    });
  }

  private getOrCreateCommonLayer(): lambda.LayerVersion {
    const stack = cdk.Stack.of(this);

    const existingLayer = stack.node.tryFindChild("CommonPythonLayer") as lambda.LayerVersion;
    if (existingLayer) {
      return existingLayer;
    }

    return new lambda.LayerVersion(stack, "CommonPythonLayer", {
      code: lambda.Code.fromAsset(COMMON_LAYER_PATH, {
        bundling: {
          image: DEFAULT_RUNTIME.bundlingImage,
          command: [
            "bash",
            "-c",
            "pip install -r requirements.txt -t /asset-output/python && cp -r python/* /asset-output/python/",
          ],
        },
      }),
      compatibleRuntimes: [DEFAULT_RUNTIME],
      description: "Common Python dependencies for Lambda functions",
    });
  }
}
