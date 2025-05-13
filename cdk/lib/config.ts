import { GnomeAccount, Stage } from "@gnome-trading-group/gnome-shared-cdk";

export interface ControllerConfig {
  account: GnomeAccount;

  // Slack settings
  slackWorkspaceId: string;
  slackChannelConfigurationName: string;
  slackChannelId: string;

  // Collector settings
  collectorOrchestratorVersion: string;
  collectorClusterName: string;
  collectorTaskDefinition: string;
}

const defaultConfig = {
  slackWorkspaceId: "T08K71WNHSR",
  collectorOrchestratorVersion: "1.0.21",
  collectorClusterName: "CollectorCluster",
  collectorTaskDefinition: "CollectorTaskDefinition",
}

export const CONFIGS: { [stage in Stage]?:  ControllerConfig } = {
  [Stage.DEV]: {
    ...defaultConfig,
    account: GnomeAccount.InfraDev,

    slackChannelConfigurationName: "gnome-alerts-dev",
    slackChannelId: "C08KX2GAUE4",
  },
  // [Stage.STAGING]: {
  //   ...defaultConfig,
  //   account: GnomeAccount.InfraStaging,

  //   slackChannelConfigurationName: "gnome-alerts-staging",
  //   slackChannelId: "C08KL9PGAQZ",
  // },
  [Stage.PROD]: {
    ...defaultConfig,
    account: GnomeAccount.InfraProd,

    slackChannelConfigurationName: "gnome-alerts-prod",
    slackChannelId: "C08KD27QZKN",
  },
}

export const GITHUB_REPO = "gnome-trading-group/gnome-controller";
export const GITHUB_BRANCH = "main";
