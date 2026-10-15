import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export interface PipelineStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
  cognitoAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
}

// gnome-pipelines' RunStack owns these functions and everything behind them; the controller only routes the UI's
// requests to them, so it must deploy after gnome-pipelines has created them.
const FUNCTIONS = {
  list: "gnome-pipelines-list",
  create: "gnome-pipelines-create",
  get: "gnome-pipelines-get",
  update: "gnome-pipelines-update",
  trigger: "gnome-pipelines-trigger",
};

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const integration = (name: string) => new apigateway.LambdaIntegration(lambda.Function.fromFunctionAttributes(
      this, name, { functionArn: `arn:aws:lambda:${this.region}:${this.account}:function:${name}`, sameEnvironment: true },
    ));
    const cognitoOpts: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: props.cognitoAuthorizer,
    };

    const researchResource = props.apiGateway.root.getResource("research") ??
      props.apiGateway.root.addResource("research");
    const pipelinesResource = researchResource.addResource("pipelines");
    pipelinesResource.addMethod("GET", integration(FUNCTIONS.list), cognitoOpts);
    pipelinesResource.addMethod("POST", integration(FUNCTIONS.create), cognitoOpts);

    const pipelineResource = pipelinesResource.addResource("{pipelineName}");
    pipelineResource.addMethod("GET", integration(FUNCTIONS.get), cognitoOpts);
    pipelineResource.addMethod("PUT", integration(FUNCTIONS.update), cognitoOpts);
    pipelineResource.addResource("trigger").addMethod("POST", integration(FUNCTIONS.trigger), cognitoOpts);
  }
}
