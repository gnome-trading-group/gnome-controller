import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from 'constructs';
import { DefaultDashboardFactory, MonitoringFacade, noopAction } from "cdk-monitoring-constructs";

export interface MonitoringStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
  // Lambdas triggered by events rather than the API, whose failures the API's 5xx alarm never sees.
  eventHandlers: { name: string; humanReadableName: string; fn: lambda.IFunction }[];
}

// The alarms carry no action: the registry's alerting stack hears every alarm change through EventBridge and reads
// the severity from the tier each is declared under. Nothing here is Critical (paging): a failure breaks the UI or
// leaves a backtest or research job stuck, not trading.
export class MonitoringStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const monitoring = new MonitoringFacade(this, 'ControllerDashboard', {
      // Only the alarms are used; each dashboard is billed monthly and nobody reads them.
      dashboardFactory: new DefaultDashboardFactory(this, 'ControllerDashboardFactory', {
        dashboardNamePrefix: 'ControllerDashboard',
        createDashboard: false,
      }),
      alarmFactoryDefaults: {
        actionsEnabled: true,
        alarmNamePrefix: 'Controller-',
        action: noopAction(),
        datapointsToAlarm: 1,
      },
    });

    // An API Lambda that throws or times out comes back as a 5xx, so this covers every route's function. A few are
    // tolerated: one failed page load isn't worth an alert.
    monitoring.monitorApiGateway({
      api: props.apiGateway,
      humanReadableName: 'Controller API Gateway',
      alarmFriendlyName: 'ControllerApi',
      add5XXFaultCountAlarm: {
        Error: { maxErrorCount: 4 },
      },
    });

    // A status handler that fails leaves its backtest or research job showing as running forever.
    for (const { name, humanReadableName, fn } of props.eventHandlers) {
      monitoring.monitorLambdaFunction({
        lambdaFunction: fn,
        humanReadableName,
        alarmFriendlyName: name,
        addFaultCountAlarm: {
          Error: { maxErrorCount: 0 },
        },
      });
    }
  }
}
