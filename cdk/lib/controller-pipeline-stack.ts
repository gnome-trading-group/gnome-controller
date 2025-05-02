import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from "constructs";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { CONFIGS, GITHUB_BRANCH, GITHUB_REPO, ControllerConfig } from "./config";
import { FrontendStack } from "./stacks/frontend-stack";


class AppStage extends cdk.Stage {

  constructor(scope: Construct, id: string, config: ControllerConfig) {
    super(scope, id, { env: config.account.environment });

    new FrontendStack(this, "ControllerFrontendStack");
  }
}

export class ControllerPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const npmSecret = secrets.Secret.fromSecretNameV2(this, 'NPMToken', 'npm-token');

    const pipeline = new pipelines.CodePipeline(this, "ControllerPipeline", {
      crossAccountKeys: true,
      pipelineName: "ControllerPipeline",
      synth: new pipelines.ShellStep("deploy", {
        input: pipelines.CodePipelineSource.gitHub(GITHUB_REPO, GITHUB_BRANCH),
        commands: [
          'echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" > ~/.npmrc',
          "npm ci",
          "npm run build",
          "cd cdk/",
          "npm ci",
          "npx cdk synth"
        ],
        env: {
          NPM_TOKEN: npmSecret.secretValue.unsafeUnwrap()
        },
        primaryOutputDirectory: 'cdk/cdk.out',
      }),
    });

    const dev = new AppStage(this, "Dev", CONFIGS[Stage.DEV]!);
    // const staging = new AppStage(this, "Staging", CONFIGS[Stage.STAGING]!);
    const prod = new AppStage(this, "Prod", CONFIGS[Stage.PROD]!);

    pipeline.addStage(dev);
    // pipeline.addStage(staging, {
    //   pre: [new pipelines.ManualApprovalStep('ApproveStaging')],
    // });
    pipeline.addStage(prod, {
      pre: [new pipelines.ManualApprovalStep('ApproveProd')],
    });

    pipeline.buildPipeline();
    npmSecret.grantRead(pipeline.synthProject.role!!);
    npmSecret.grantRead(pipeline.pipeline.role);
  }
}