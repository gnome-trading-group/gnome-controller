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

export interface CollectorEcsStackProps extends cdk.StackProps {
  config: ControllerConfig;
  monitoringStack: MonitoringStack;
}

export class CollectorEcsStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly cluster: ecs.Cluster;
  public readonly taskDefinitionFamily: string;

  constructor(scope: Construct, id: string, props: CollectorEcsStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'CollectorRawBucket', {
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
        CONTROLLER_URL: props.config.controllerUrl,
        CONTROLLER_API_KEY: props.config.controllerApiKey,
        REGISTRY_URL: props.config.registryUrl,
        REGISTRY_API_KEY: props.config.registryApiKey,
        STAGE: props.config.account.stage,
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'collector',
        logGroup: ecsLogGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
      },
    });

    new ecs.FargateService(this, 'CollectorService', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: 0,
      assignPublicIp: true,
      securityGroups: [this.securityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });
  }

  private buildDockerfile(orchestratorVersion: string) {
    const dockerDir = path.join(__dirname, `collector-docker`);

    if (!fs.existsSync(dockerDir)) {
      fs.mkdirSync(dockerDir);
    }

    const dockerfileContent = `
      FROM azul/zulu-openjdk:17

      RUN apt-get update && apt-get install -y wget jq

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
      filterPattern: logs.FilterPattern.anyTerm('Exception', 'ERROR'),
      metricName: 'ErrorCount',
      metricNamespace: 'CollectorLogs',
    });

    const metric = filter.metric({
      statistic: 'sum',
      period: cdk.Duration.minutes(1),
    });

    const alarm = new cw.Alarm(this, 'CollectorEcsErrorAlarm', {
      metric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Triggers when there are errors in any collector log streams',
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
