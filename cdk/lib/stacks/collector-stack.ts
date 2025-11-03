import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';
import { ControllerConfig } from "../config";
import { MonitoringStack } from "./monitoring-stack";

export interface CollectorStackProps extends cdk.StackProps {
  config: ControllerConfig;
  monitoringStack: MonitoringStack;
}

export class CollectorStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly cluster: ecs.Cluster;
  public readonly taskDefinitionFamily: string;
  public readonly taskDefinitionArn: string;
  public readonly collectorOrchestratorVersion: string;

  constructor(scope: Construct, id: string, props: CollectorStackProps) {
    super(scope, id, props);

    const rawBucket = new s3.Bucket(this, 'CollectorRawBucket', {
      bucketName: `gnome-market-data-raw-${props.config.account.stage}`,
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

    const ecsLogGroup = new logs.LogGroup(this, 'CollectorEcsLogGroup', {
      logGroupName: '/ecs/collector',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });
    this.buildMonitoring(ecsLogGroup, props.monitoringStack);

    const taskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    bucket.grantReadWrite(taskRole);

    this.cluster = new ecs.Cluster(this, 'CollectorEcsCluster', { 
      clusterName: 'CollectorCluster',
      vpc: this.vpc,
    });

    this.taskDefinitionFamily = 'CollectorTaskDefinition';
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'CollectorTaskDefinition', {
      family: this.taskDefinitionFamily,
      taskRole,
      memoryLimitMiB: 1024,
      cpu: 512,
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
        OUTPUT_BUCKET: bucket.bucketName,
        REGISTRY_URL: props.config.registryUrl,
        REGISTRY_API_KEY: props.config.registryApiKey,
        STAGE: props.config.account.stage,
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'collector',
        logGroup: ecsLogGroup,
      }),
    });

    // Export task definition ARN and version for use by Lambda functions
    this.taskDefinitionArn = taskDefinition.taskDefinitionArn;
    this.collectorOrchestratorVersion = props.config.collectorOrchestratorVersion;

    // Output the task definition ARN for reference
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

  private buildMonitoring(
    logGroup: logs.LogGroup,
    monitoringStack: MonitoringStack,
  ) {
    const filter = logGroup.addMetricFilter('ErrorMetricFilter', {
      filterPattern: logs.FilterPattern.anyTerm('Exception', 'ERROR', 'Error', 'error', 'exception'),
      metricName: 'ErrorCount',
      metricNamespace: 'CollectorLogs',
    });

    const metric = filter.metric({
      statistic: 'max',
      period: cdk.Duration.minutes(1),
    });

    const alarm = new cw.Alarm(this, 'CollectorEcsErrorAlarm', {
      metric,
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Triggers when there are any errors in collector log streams',
    });

    monitoringStack.subscribeSlackAlarm(alarm);
    monitoringStack.dashboard.addWidgets(new cw.GraphWidget({
      title: "Collector Log Errors",
      width: 12,
      left: [
        metric,
      ],
      leftAnnotations: [
        alarm.toAnnotation(),
      ],
    }));
  }
}
