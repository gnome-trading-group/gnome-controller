import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';
import { ControllerConfig } from "../config";
import { OrchestratorLambda } from "@gnome-trading-group/gnome-shared-cdk";

export interface CollectorStackProps extends cdk.StackProps {
  config: ControllerConfig;
}

export class CollectorStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly cluster: ecs.Cluster;
  public readonly taskDefinitionFamily: string;
  public readonly taskDefinitionArn: string;
  public readonly collectorOrchestratorVersion: string;
  public readonly collectorLogGroup: logs.LogGroup;
  public readonly aggregatorLambda: OrchestratorLambda;

  constructor(scope: Construct, id: string, props: CollectorStackProps) {
    super(scope, id, props);

    const rawBucket = new s3.Bucket(this, 'CollectorRawBucket', {
      bucketName: `gnome-market-data-raw-${props.config.account.stage}`,
    });
    const archiveBucket = new s3.Bucket(this, 'CollectorArchiveBucket', {
      bucketName: `gnome-market-data-archive-${props.config.account.stage}`,
    });

    const bucket = new s3.Bucket(this, 'CollectorBucket', {
      bucketName: `gnome-market-data-${props.config.account.stage}`,
    });

    this.vpc = new ec2.Vpc(this, 'CollectorEcsVpc', {
      maxAzs: 2,
      natGateways: 0, // Avoid NAT Gateway costs
      subnetConfiguration: [
        {
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    this.securityGroup = new ec2.SecurityGroup(this, 'CollectorSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for collector Fargate tasks',
      allowAllOutbound: true,
    });

    this.collectorLogGroup = new logs.LogGroup(this, 'CollectorEcsLogGroup', {
      logGroupName: '/ecs/collector',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const taskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    rawBucket.grantReadWrite(taskRole);

    this.cluster = new ecs.Cluster(this, 'CollectorEcsCluster', { 
      clusterName: 'CollectorCluster',
      vpc: this.vpc,
    });

    this.taskDefinitionFamily = 'CollectorTaskDefinition';
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'CollectorTaskDefinition', {
      family: this.taskDefinitionFamily,
      taskRole,
      memoryLimitMiB: 512,
      cpu: 256,
    });

    const dockerImage = new ecrAssets.DockerImageAsset(this, 'JavaAppImage', {
      directory: this.buildDockerfile(props.config.collectorOrchestratorVersion),
      buildSecrets: {
        MAVEN_CREDENTIALS: 'env=MAVEN_CREDENTIALS',
      },
    });

    taskDefinition.addContainer('CollectorContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(dockerImage),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        MAIN_CLASS: 'group.gnometrading.collectors.DelegatingCollectorOrchestrator',
        OUTPUT_BUCKET: rawBucket.bucketName,
        REGISTRY_URL: props.config.registryUrl,
        REGISTRY_API_KEY: props.config.registryApiKey,
        STAGE: props.config.account.stage,
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'collector',
        logGroup: this.collectorLogGroup,
      }),
      memoryLimitMiB: 512,
      cpu: 256,
    });

    this.taskDefinitionArn = taskDefinition.taskDefinitionArn;
    this.collectorOrchestratorVersion = props.config.collectorOrchestratorVersion;

    const aggregatorLogGroup = new logs.LogGroup(this, 'AggregatorLogGroup', {
      logGroupName: '/aws/lambda/market-data-aggregator',
      retention: logs.RetentionDays.ONE_WEEK,
    });

    this.aggregatorLambda = new OrchestratorLambda(this, 'CollectorAggregatorLambda', {
      orchestratorVersion: props.config.collectorOrchestratorVersion,
      classPath: 'group.gnometrading.collectors.AggregatorOrchestrator',
      lambdaName: 'CollectorAggregatorLambda',
      region: props.config.account.region,
      environmentVariables: {
        OUTPUT_BUCKET: bucket.bucketName,
        INPUT_BUCKET: rawBucket.bucketName,
        ARCHIVE_BUCKET: archiveBucket.bucketName,
      },
      logGroup: aggregatorLogGroup, 
    });

    rawBucket.grantReadWrite(this.aggregatorLambda.lambdaInstance);
    archiveBucket.grantReadWrite(this.aggregatorLambda.lambdaInstance);
    bucket.grantReadWrite(this.aggregatorLambda.lambdaInstance);

    const aggregatorRule = new events.Rule(this, 'CollectorAggregatorRule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(3)),
    });
    // aggregatorRule.addTarget(new targets.LambdaFunction(aggregatorLambda.lambdaInstance));

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinitionArn,
      description: 'Collector Task Definition ARN',
    });
  }

  private buildDockerfile(orchestratorVersion: string) {
    const dockerDir = path.join(__dirname, `collector-docker`);

    if (!fs.existsSync(dockerDir)) {
      fs.mkdirSync(dockerDir);
    }

    const dockerfileContent = `
      FROM ubuntu:24.04

      RUN apt-get update && apt-get install -y wget jq openjdk-17-jdk

      ARG MAIN_CLASS

      RUN --mount=type=secret,id=MAVEN_CREDENTIALS \
        export MAVEN_CREDENTIALS=$(cat /run/secrets/MAVEN_CREDENTIALS) && \
        MAVEN_USERNAME=$(echo $MAVEN_CREDENTIALS | jq -r \'.GITHUB_ACTOR\') && \
        MAVEN_PASSWORD=$(echo $MAVEN_CREDENTIALS | jq -r \'.GITHUB_TOKEN\') && \
        wget --user=$MAVEN_USERNAME --password=$MAVEN_PASSWORD -O app.jar "https://maven.pkg.github.com/gnome-trading-group/gnome-orchestrator/group/gnometrading/gnome-orchestrator/${orchestratorVersion}/gnome-orchestrator-${orchestratorVersion}.jar"

      RUN echo '#!/bin/sh\\nexec java --add-opens=java.base/sun.nio.ch=ALL-UNNAMED -cp app.jar $MAIN_CLASS' > start.sh && chmod +x start.sh

      CMD ["./start.sh"]
    `.trim();

    fs.writeFileSync(path.join(dockerDir, 'Dockerfile'), dockerfileContent);
    return dockerDir;
  }
}
