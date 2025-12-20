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
import { MonitoringStack } from "./stacks/monitoring-stack";
import { CollectorStack } from "./stacks/collector-stack";
import { LatencyProbeStack, PROBE_REGIONS } from "./stacks/latency-probe-stack";

class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, config: ControllerConfig) {
    super(scope, id, { env: config.account.environment });

    const frontendStack = new FrontendStack(this, "ControllerFrontendStack", {
      stage: config.account.stage,
      metadataUrl: config.controllerIdentityProviderUrl,
    });

    const databaseStack = new DatabaseStack(this, "ControllerDatabaseStack");
    const collectorStack = new CollectorStack(this, "ControllerCollectorStack", {
      config,
    });
    const monitoringStack = new MonitoringStack(this, "ControllerMonitoringStack", {
      aggregatorLambda: collectorStack.aggregatorLambda,
      collectorLogGroup: collectorStack.collectorLogGroup,
    });

    const backendStack = new BackendStack(this, "ControllerBackendStack", {
      userPool: frontendStack.userPool,
      collectorsTable: databaseStack.collectorsTable,
      collectorCluster: collectorStack.cluster,
      collectorTaskDefinition: collectorStack.taskDefinitionFamily,
      collectorSecurityGroupId: collectorStack.securityGroup.securityGroupId,
      collectorSubnetIds: collectorStack.vpc.publicSubnets.map(subnet => subnet.subnetId),
      collectorDeploymentVersion: collectorStack.collectorOrchestratorVersion,
      collectorLogGroupName: collectorStack.collectorLogGroup.logGroupName,
    });

    for (const region of PROBE_REGIONS) {
      new LatencyProbeStack(this, `LatencyProbeStack-${region}`, {
        env: {
          account: config.account.environment.account,
          region: region,
        },
        deploymentRegion: region,
      });
    }
  }
}

export class ControllerPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const npmSecret = secrets.Secret.fromSecretNameV2(this, 'NPMToken', 'npm-token');
    const githubSecret = secrets.Secret.fromSecretNameV2(this, 'GithubMaven', 'GITHUB_MAVEN');
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
      assetPublishingCodeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
          environmentVariables: {
            MAVEN_CREDENTIALS: {
              value: githubSecret.secretValue.unsafeUnwrap(),
            }
          }
        },
      }
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
    githubSecret.grantRead(pipeline.synthProject.role!!);
    githubSecret.grantRead(pipeline.pipeline.role);
  }
}