import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Template } from "aws-cdk-lib/assertions";
import { MonitoringStack } from "../lib/stacks/monitoring-stack";

describe("MonitoringStack", () => {
  const app = new cdk.App();
  const apiStack = new cdk.Stack(app, "Api");
  const api = new apigateway.RestApi(apiStack, "Api");
  api.root.addMethod("GET", new apigateway.MockIntegration());
  const handler = (name: string) => lambda.Function.fromFunctionName(apiStack, name, name);
  const template = Template.fromStack(new MonitoringStack(app, "Monitoring", {
    apiGateway: api,
    eventHandlers: [
      { name: "BacktestStatusHandler", humanReadableName: "Backtest", fn: handler("backtest-status") },
      { name: "ResearchJobStatusHandler", humanReadableName: "Research", fn: handler("research-status") },
    ],
  }));
  const alarms = Object.values(template.findResources("AWS::CloudWatch::Alarm")).map((a) => a.Properties);

  // The alerting stack reads the severity from the name's last part and the runbook from its first.
  it("alarms on API 5xx and on each event-driven handler's errors, named for the alerting stack", () => {
    expect(alarms.map((a) => a.AlarmName).sort()).toEqual([
      "Controller--BacktestStatusHandler-Fault-Count-Error",
      "Controller--ControllerApi-Fault-Count-Error",
      "Controller--ResearchJobStatusHandler-Fault-Count-Error",
    ]);
  });

  it("tolerates a few 5xx but no handler errors", () => {
    const alarm = (name: string) => alarms.find((a) => a.AlarmName === name)!;
    expect(alarm("Controller--ControllerApi-Fault-Count-Error").Threshold).toBe(4);
    expect(alarm("Controller--BacktestStatusHandler-Fault-Count-Error").Threshold).toBe(0);
    expect(alarm("Controller--BacktestStatusHandler-Fault-Count-Error").ComparisonOperator).toBe("GreaterThanThreshold");
  });

  it("leaves routing to the alerting stack: no alarm actions, missing data is fine", () => {
    for (const a of alarms) {
      expect(a.AlarmActions).toBeUndefined();
      expect(a.TreatMissingData).toBe("notBreaching");
    }
  });
});
