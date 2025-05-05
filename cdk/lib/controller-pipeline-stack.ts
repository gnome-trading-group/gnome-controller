import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from "constructs";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { CONFIGS, GITHUB_BRANCH, GITHUB_REPO, ControllerConfig } from "./config";
import { FrontendStack } from "./stacks/frontend-stack";
import { BackendStack } from "./stacks/backend-stack";
import { DatabaseStack } from "./stacks/database-stack";

class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, config: ControllerConfig) {
    super(scope, id, { env: config.account.environment });

    const frontendStack = new FrontendStack(this, "ControllerFrontendStack", {
      stage: config.account.stage,
    });

    const databaseStack = new DatabaseStack(this, "ControllerDatabaseStack");

    new BackendStack(this, "ControllerBackendStack", {
      userPool: frontendStack.userPool,
      collectorsTable: databaseStack.collectorsTable,
    });
  }
}

export class ControllerPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const npmSecret = secrets.Secret.fromSecretNameV2(this, 'NPMToken', 'npm-token');
    const dockerHubCredentials = secrets.Secret.fromSecretNameV2(this, 'DockerHub', 'docker-hub-credentials');

    const pipeline = new pipelines.CodePipeline(this, "ControllerPipeline", {
      crossAccountKeys: true,
      pipelineName: "ControllerPipeline",
      synth: new pipelines.ShellStep("Synth", {
        input: pipelines.CodePipelineSource.gitHub(GITHUB_REPO, GITHUB_BRANCH),
        commands: [
          'echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" > ~/.npmrc',
          "cd cdk/",
          "npm ci",
          "npx cdk synth"
        ],
        
        env: {
          NPM_TOKEN: npmSecret.secretValue.unsafeUnwrap(),
        },
        primaryOutputDirectory: 'cdk/cdk.out',
      }),
      dockerCredentials: [
        pipelines.DockerCredential.dockerHub(dockerHubCredentials),
      ],
    });

    pipeline.addWave("BuildLayers", {
      post: [
        new pipelines.CodeBuildStep("BuildPythonLayer", {
          buildEnvironment: {
            buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
            privileged: true,
          },
          commands: [
            "cd cdk/",
            "python -m pip install --upgrade pip",
            "pip install -r lambda/layers/common/requirements.txt -t lambda/layers/common/python",
            "cd lambda/layers/common",
            "zip -r layer.zip python",
          ],
        }),
      ],
    });

    const dev = new AppStage(this, "Dev", CONFIGS[Stage.DEV]!);
    // const staging = new AppStage(this, "Staging", CONFIGS[Stage.STAGING]!);
    const prod = new AppStage(this, "Prod", CONFIGS[Stage.PROD]!);

    pipeline.addStage(dev);

    pipeline.addStage(prod, {
      pre: [new pipelines.ManualApprovalStep('ApproveProd')],
    });

    pipeline.buildPipeline();
    npmSecret.grantRead(pipeline.synthProject.role!!);
    npmSecret.grantRead(pipeline.pipeline.role);
  }
}