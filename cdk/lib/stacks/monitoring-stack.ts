import * as cdk from "aws-cdk-lib";
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { OrchestratorLambda } from "@gnome-trading-group/gnome-shared-cdk";
import { MonitoringFacade, SnsAlarmActionStrategy } from "cdk-monitoring-constructs";

export interface MonitoringStackProps extends cdk.StackProps {
  collectorLogGroup: logs.ILogGroup;
  aggregatorLambda: OrchestratorLambda;
}

export class MonitoringStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const slackSnsTopic = sns.Topic.fromTopicArn(
      this, 'ImportedSlackSnsTopic', cdk.Fn.importValue('SlackSnsTopicArn')
    );

    const monitoring = new MonitoringFacade(this, 'ControllerDashboard', {
      alarmFactoryDefaults: {
        actionsEnabled: true,
        alarmNamePrefix: 'Controller-',
        action: new SnsAlarmActionStrategy({ onAlarmTopic: slackSnsTopic }),
        datapointsToAlarm: 1,
      },
    });

    monitoring
      .addLargeHeader('Gnome Controller')
      .monitorLambdaFunction({
        lambdaFunction: props.aggregatorLambda.lambdaInstance,
        humanReadableName: 'Collector Aggregator Lambda',
        alarmFriendlyName: 'CollectorAggregatorLambda',
      })
      .monitorLog({
        logGroupName: props.collectorLogGroup.logGroupName,
        pattern: "ERROR || Exception || exception || Error || error || UNKNOWN_ERROR",
        humanReadableName: 'Collector ECS Log Group Errors',
        alarmFriendlyName: 'CollectorEcsLogErrors',
      });
  }
}
