import * as cdk from "aws-cdk-lib";
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { OrchestratorLambda } from "@gnome-trading-group/gnome-shared-cdk";
import { CustomMetricGroup, MonitoringFacade, SnsAlarmActionStrategy } from "cdk-monitoring-constructs";
import { COLLECTOR_METRICS_NAMESPACE, COLLECTOR_ERROR_METRIC_NAME } from "./collector-regional-stack";

export interface MonitoringStackProps extends cdk.StackProps {
  aggregatorLambda: OrchestratorLambda;
  collectorRegions: string[];
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

    const collectorLogMetrics: CustomMetricGroup[] = [];
    for (const region of props.collectorRegions) {
      collectorLogMetrics.push(
        {
          metrics: [
            new cw.Metric({
              namespace: COLLECTOR_METRICS_NAMESPACE,
              metricName: `${COLLECTOR_ERROR_METRIC_NAME}-${region}`,
              region: region,
              statistic: 'Sum',
              period: cdk.Duration.minutes(1),
            }),
          ],
          title: region,
        }
      );
    }

    monitoring
      .addLargeHeader('Gnome Controller')
      .monitorCustom({
        alarmFriendlyName: 'CollectorECSLogErrors',
        humanReadableName: 'Collector ECS Log Errors',
        metricGroups: collectorLogMetrics,
      })
      .monitorLambdaFunction({
        lambdaFunction: props.aggregatorLambda.lambdaInstance,
        humanReadableName: 'Collector Aggregator Lambda',
        alarmFriendlyName: 'CollectorAggregatorLambda',
      });
  }
}
