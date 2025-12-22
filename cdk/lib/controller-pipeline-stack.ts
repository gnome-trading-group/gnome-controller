import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from "constructs";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { CONFIGS, GITHUB_BRANCH, GITHUB_REPO, ControllerConfig } from "./config";
import { FrontendStack } from "./stacks/frontend-stack";
import { BackendStack, CollectorRegionConfig } from "./stacks/backend-stack";
import { DatabaseStack } from "./stacks/database-stack";
import { MonitoringStack } from "./stacks/monitoring-stack";
import { CollectorStack } from "./stacks/collector-stack";
import { CollectorRegionalStack } from "./stacks/collector-regional-stack";
import { EventBusStack } from "./stacks/event-bus-stack";
import { LatencyProbeStack, PROBE_REGIONS } from "./stacks/latency-probe-stack";

/** Regions where collectors can be deployed */
export const COLLECTOR_REGIONS = ["us-east-1", "ap-northeast-1"];

class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, config: ControllerConfig) {
    super(scope, id, { env: config.account.environment });

    const accountId = config.account.environment.account!;

    const frontendStack = new FrontendStack(this, "ControllerFrontendStack", {
      stage: config.account.stage,
      metadataUrl: config.controllerIdentityProviderUrl,
    });

    const databaseStack = new DatabaseStack(this, "ControllerDatabaseStack");

    const eventBusStack = new EventBusStack(this, "ControllerEventBusStack");

    const collectorStack = new CollectorStack(this, "ControllerCollectorStack", {
      config,
    });

    // Regional collector stacks (VPC, ECS, task definition) - one per region
    const collectorRegionalStacks: Record<string, CollectorRegionalStack> = {};
    for (const region of COLLECTOR_REGIONS) {
      const regionalStack = new CollectorRegionalStack(this, `CollectorRegionalStack-${region}`, {
        env: {
          account: accountId,
          region: region,
        },
        config,
        deploymentRegion: region,
        rawBucketName: collectorStack.rawBucket.bucketName,
        primaryEventBus: eventBusStack.collectorEventBus,
      });
      collectorRegionalStacks[region] = regionalStack;
    }

    const collectorRegions: Record<string, CollectorRegionConfig> = {};
    for (const [region, stack] of Object.entries(collectorRegionalStacks)) {
      collectorRegions[region] = {
        region: region,
        clusterName: stack.cluster.clusterName,
        clusterArn: stack.cluster.clusterArn,
        taskDefinitionFamily: stack.taskDefinitionFamily,
        securityGroupId: stack.securityGroup.securityGroupId,
        subnetIds: stack.vpc.publicSubnets.map(subnet => subnet.subnetId),
        logGroupName: stack.collectorLogGroup.logGroupName,
      };
    }

    new MonitoringStack(this, "ControllerMonitoringStack", {
      aggregatorLambda: collectorStack.aggregatorLambda,
      collectorRegions: COLLECTOR_REGIONS,
    });

    const backendStack = new BackendStack(this, "ControllerBackendStack", {
      userPool: frontendStack.userPool,
      collectorsTable: databaseStack.collectorsTable,
      collectorRegions: collectorRegions,
      collectorDeploymentVersion: collectorStack.collectorOrchestratorVersion,
      collectorEventBus: eventBusStack.collectorEventBus,
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