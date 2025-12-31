import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { MonitoringFacade, SnsAlarmActionStrategy } from "cdk-monitoring-constructs";

export interface MonitoringStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
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
      .monitorApiGateway({
        api: props.apiGateway,
        humanReadableName: 'Controller API Gateway',
        alarmFriendlyName: 'ControllerApiGateway',
      });
  }
}
