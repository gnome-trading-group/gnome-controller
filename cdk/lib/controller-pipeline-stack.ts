import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from "constructs";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";
import { CONFIGS, GITHUB_BRANCH, GITHUB_REPO, ControllerConfig } from "./config";
import { FrontendStack } from "./stacks/frontend-stack";
import { BackendStack } from "./stacks/backend-stack";
import { BacktestStack } from "./stacks/backtest-stack";
import { ResearchStack } from "./stacks/research-stack";
import { ServiceConfigStack } from "./stacks/service-config-stack";
import { MonitoringStack } from "./stacks/monitoring-stack";
import { LatencyProbeStack, PROBE_REGIONS } from "./stacks/latency-probe-stack";

class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, config: ControllerConfig) {
    super(scope, id, { env: config.account.environment });

    const frontendStack = new FrontendStack(this, "ControllerFrontendStack", {
      stage: config.account.stage,
      metadataUrl: config.controllerIdentityProviderUrl,
      domainName: config.domainName,
      certificateArn: config.certificateArn,
    });

    const backendStack = new BackendStack(this, "ControllerBackendStack", {
      crossRegionReferences: true,
      userPool: frontendStack.userPool,
    });

    new BacktestStack(this, "ControllerBacktestStack", {
      stage: config.account.stage,
      apiGateway: backendStack.apiGateway,
      cognitoAuthorizer: backendStack.cognitoAuthorizer,
    });

    new ResearchStack(this, "ControllerResearchStack", {
      stage: config.account.stage,
      apiGateway: backendStack.apiGateway,
      cognitoAuthorizer: backendStack.cognitoAuthorizer,
    });

    new ServiceConfigStack(this, "ControllerServiceConfigStack", {
      apiGateway: backendStack.apiGateway,
      cognitoAuthorizer: backendStack.cognitoAuthorizer,
    });

    new MonitoringStack(this, "ControllerMonitoringStack", {
      apiGateway: backendStack.apiGateway,
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
    const registryKeyDevSecret = secrets.Secret.fromSecretNameV2(this, 'RegistryKeyDev', 'controller-registry-api-key-dev');
    const registryKeyProdSecret = secrets.Secret.fromSecretNameV2(this, 'RegistryKeyProd', 'controller-registry-api-key-prod');
    const serviceConfigKeyDevSecret = secrets.Secret.fromSecretNameV2(this, 'ServiceConfigKeyDev', 'controller-service-config-api-key-dev');
    const serviceConfigKeyProdSecret = secrets.Secret.fromSecretNameV2(this, 'ServiceConfigKeyProd', 'controller-service-config-api-key-prod');
    const launcherKeyDevSecret = secrets.Secret.fromSecretNameV2(this, 'LauncherKeyDev', 'controller-launcher-api-key-dev');
    const launcherKeyProdSecret = secrets.Secret.fromSecretNameV2(this, 'LauncherKeyProd', 'controller-launcher-api-key-prod');

    const pipeline = new pipelines.CodePipeline(this, "ControllerPipeline", {
      crossAccountKeys: true,
      pipelineName: "ControllerPipeline",
      synth: new pipelines.ShellStep("Synth", {
        input: pipelines.CodePipelineSource.gitHub(GITHUB_REPO, GITHUB_BRANCH),
        commands: [
          'echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" > ~/.npmrc',
          'printf "\\nVITE_REGISTRY_API_KEY=${REGISTRY_API_KEY_DEV}" >> .env.dev',
          'printf "\\nVITE_SERVICE_CONFIG_API_KEY=${SERVICE_CONFIG_API_KEY_DEV}" >> .env.dev',
          'printf "\\nVITE_LAUNCHER_API_KEY=${LAUNCHER_API_KEY_DEV}" >> .env.dev',
          'printf "\\nVITE_REGISTRY_API_KEY=${REGISTRY_API_KEY_PROD}" >> .env.prod',
          'printf "\\nVITE_SERVICE_CONFIG_API_KEY=${SERVICE_CONFIG_API_KEY_PROD}" >> .env.prod',
          'printf "\\nVITE_LAUNCHER_API_KEY=${LAUNCHER_API_KEY_PROD}" >> .env.prod',
          "cd cdk/",
          "npm ci",
          "npx cdk synth"
        ],
        env: {
          NPM_TOKEN: npmSecret.secretValue.unsafeUnwrap(),
          REGISTRY_API_KEY_DEV: registryKeyDevSecret.secretValue.unsafeUnwrap(),
          SERVICE_CONFIG_API_KEY_DEV: serviceConfigKeyDevSecret.secretValue.unsafeUnwrap(),
          REGISTRY_API_KEY_PROD: registryKeyProdSecret.secretValue.unsafeUnwrap(),
          SERVICE_CONFIG_API_KEY_PROD: serviceConfigKeyProdSecret.secretValue.unsafeUnwrap(),
          LAUNCHER_API_KEY_DEV: launcherKeyDevSecret.secretValue.unsafeUnwrap(),
          LAUNCHER_API_KEY_PROD: launcherKeyProdSecret.secretValue.unsafeUnwrap(),
        },
        primaryOutputDirectory: 'cdk/cdk.out',
      }),
      synthCodeBuildDefaults: {
        rolePolicy: [
          new iam.PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'iam:ResourceTag/aws-cdk:bootstrap-role': 'lookup',
              },
            },
          })
        ],
      }
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
    registryKeyDevSecret.grantRead(pipeline.synthProject.role!!);
    registryKeyProdSecret.grantRead(pipeline.synthProject.role!!);
    serviceConfigKeyDevSecret.grantRead(pipeline.synthProject.role!!);
    serviceConfigKeyProdSecret.grantRead(pipeline.synthProject.role!!);
    launcherKeyDevSecret.grantRead(pipeline.synthProject.role!!);
    launcherKeyProdSecret.grantRead(pipeline.synthProject.role!!);
  }
}