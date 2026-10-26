import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { CallerKind, GnomeApiAuthorizer } from "@gnome-trading-group/gnome-shared-cdk";

export interface PipelineStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
  auth: GnomeApiAuthorizer;
}

// gnome-pipelines owns these functions and everything behind them (pipelines, runs, schedules, datasets,
// artifacts). The controller only forwards each area to its function, so a new endpoint there needs no change
// here, but the functions must exist before this deploys.
const AREAS: { [area: string]: string } = {
  pipelines: "gnome-pipelines-api",
  datasets: "gnome-pipelines-data-api",
  artifacts: "gnome-pipelines-data-api",
};

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const personOpts: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: props.auth.authorizerFor([CallerKind.PERSON]),
    };
    const research = props.apiGateway.root.getResource("research") ?? props.apiGateway.root.addResource("research");
    const integrations = new Map<string, apigateway.LambdaIntegration>();

    for (const [area, functionName] of Object.entries(AREAS)) {
      if (!integrations.has(functionName)) {
        const fn = lambda.Function.fromFunctionAttributes(this, functionName, {
          functionArn: `arn:aws:lambda:${this.region}:${this.account}:function:${functionName}`,
          sameEnvironment: true,
        });
        integrations.set(functionName, new apigateway.LambdaIntegration(fn));
      }
      const integration = integrations.get(functionName)!;
      const resource = research.addResource(area);
      resource.addMethod("ANY", integration, personOpts);
      resource.addResource("{proxy+}").addMethod("ANY", integration, personOpts);
    }
  }
}
