import { GnomeAccount, Stage } from "@gnome-trading-group/gnome-shared-cdk";

export interface ControllerConfig {
  account: GnomeAccount;

  // Slack settings
  slackWorkspaceId: string;
  slackChannelConfigurationName: string;
  slackChannelId: string;

  // Collector settings
  collectorOrchestratorVersion: string;

  // Controller settings
  controllerUrl: string;
  controllerApiKey: string;

  // Registry settings
  registryUrl: string;
  registryApiKey: string;
}

const defaultConfig = {
  slackWorkspaceId: "T08K71WNHSR",
  collectorOrchestratorVersion: "1.0.23",
}

export const CONFIGS: { [stage in Stage]?:  ControllerConfig } = {
  [Stage.DEV]: {
    ...defaultConfig,
    account: GnomeAccount.InfraDev,

    slackChannelConfigurationName: "gnome-alerts-dev",
    slackChannelId: "C08KX2GAUE4",

    controllerUrl: "vfrw3nc037.execute-api.us-east-1.amazonaws.com",
    controllerApiKey: "hPwjA5UPkk2quShy8Dwod84LRgbDa7UC2uDTr2iX",

    registryUrl: "i3116oczxe.execute-api.us-east-1.amazonaws.com",
    registryApiKey: "9WPV7CfeqXa578yVYlxdG3kCPFzACr7YaMU0UVma",
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

    controllerUrl: "TODO",
    controllerApiKey: "TODO",

    registryUrl: "TODO",
    registryApiKey: "TODO",
  },
}

export const GITHUB_REPO = "gnome-trading-group/gnome-controller";
export const GITHUB_BRANCH = "main";
