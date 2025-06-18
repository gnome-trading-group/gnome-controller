import * as cdk from "aws-cdk-lib";
import * as chatbot from 'aws-cdk-lib/aws-chatbot';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { ControllerConfig } from "../config";

export interface SlackStackProps extends cdk.StackProps {
  config: ControllerConfig;
  topics: sns.ITopic[];
}

export class SlackStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: SlackStackProps) {
    super(scope, id, props);

    // const role = new iam.Role(this, 'ChatBotRole', {
    //   assumedBy: new iam.ServicePrincipal('chatbot.amazonaws.com'),
    //   description: 'Role for AWS ChatBot',
    //   managedPolicies: [
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchReadOnlyAccess'),
    //   ]
    // });

    // new chatbot.SlackChannelConfiguration(this, 'SlackChannelConfiguration', {
    //   slackChannelConfigurationName: props.config.slackChannelConfigurationName,
    //   slackWorkspaceId: props.config.slackWorkspaceId,
    //   slackChannelId: props.config.slackChannelId,
    //   notificationTopics: props.topics,
    //   role,
    // });
  }
}
