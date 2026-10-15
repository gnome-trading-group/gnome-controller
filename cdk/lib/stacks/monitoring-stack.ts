import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from 'constructs';
import { MonitoringFacade, noopAction } from "cdk-monitoring-constructs";

export interface MonitoringStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
}

// The alarms carry no action: the registry's alerting stack hears every alarm change through EventBridge and reads
// the severity from the tier each is declared under.
export class MonitoringStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const monitoring = new MonitoringFacade(this, 'ControllerDashboard', {
      alarmFactoryDefaults: {
        actionsEnabled: true,
        alarmNamePrefix: 'Controller-',
        action: noopAction(),
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
