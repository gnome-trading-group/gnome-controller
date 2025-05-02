#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GnomeAccount } from '@gnome-trading-group/gnome-shared-cdk';
import { ControllerPipelineStack } from '../lib/controller-pipeline-stack';

const app = new cdk.App();
new ControllerPipelineStack(app, 'ControllerPipelineStack', {
  env: GnomeAccount.InfraPipelines.environment,
});
app.synth();
