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
  controllerIdentityProviderUrl: string;

  // Registry settings
  registryUrl: string;
  registryApiKey: string;
}

const defaultConfig = {
  slackWorkspaceId: "T08K71WNHSR",
  collectorOrchestratorVersion: "1.1.0",
}

export const CONFIGS: { [stage in Stage]?:  ControllerConfig } = {
  [Stage.DEV]: {
    ...defaultConfig,
    account: GnomeAccount.InfraDev,

    slackChannelConfigurationName: "controller-alerts-dev",
    slackChannelId: "C08KX2GAUE4",

    controllerIdentityProviderUrl: "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/NzQ2NjY5MTk2MzE2X2lucy0wMjA1N2ZhNzE4MDc5Y2U2",

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

    slackChannelConfigurationName: "controller-alerts-prod",
    slackChannelId: "C08KD27QZKN",

    controllerIdentityProviderUrl: "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/NzQ2NjY5MTk2MzE2X2lucy02OTNjMzFlYTA0YjJjMmRi",

    registryUrl: "n5dxpwnij0.execute-api.us-east-1.amazonaws.com",
    registryApiKey: "Smr7Jrmr8j93MMymhYdebaoRbV2T6TkX7phGPnrd",
  },
}

export const GITHUB_REPO = "gnome-trading-group/gnome-controller";
export const GITHUB_BRANCH = "main";
