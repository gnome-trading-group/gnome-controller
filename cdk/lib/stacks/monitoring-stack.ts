import * as cdk from "aws-cdk-lib";
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export class MonitoringStack extends cdk.Stack {

  public readonly dashboard: cw.Dashboard;
  public readonly slackSnsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.slackSnsTopic = new sns.Topic(this, 'SlackAlarmTopic');
    this.dashboard = new cw.Dashboard(this, 'MonitoringDashboard', {
      dashboardName: 'ControllerDashboard',
    });
  }

  addHeading(heading: string) {
    this.dashboard.addWidgets(
      new cw.TextWidget({
        markdown: `# ${heading}`,
        width: 24,
        height: 1,
        background: cw.TextWidgetBackground.TRANSPARENT,
      })
    )
  }

  subscribeSlackAlarm(alarm: cw.Alarm | cw.CompositeAlarm) {
    alarm.addAlarmAction(new cw_actions.SnsAction(this.slackSnsTopic))
  }
}
