import { GnomeAccount, Stage } from "@gnome-trading-group/gnome-shared-cdk";

export interface ControllerConfig {
  account: GnomeAccount;

  // Controller settings
  controllerIdentityProviderUrl: string;
}

const defaultConfig = {
}

export const CONFIGS: { [stage in Stage]?:  ControllerConfig } = {
  [Stage.DEV]: {
    ...defaultConfig,
    account: GnomeAccount.InfraDev,

    controllerIdentityProviderUrl: "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/NzQ2NjY5MTk2MzE2X2lucy0wMjA1N2ZhNzE4MDc5Y2U2",
  },
  // [Stage.STAGING]: {
  //   ...defaultConfig,
  //   account: GnomeAccount.InfraStaging,
  // }, 
  [Stage.PROD]: {
    ...defaultConfig,
    account: GnomeAccount.InfraProd,

    controllerIdentityProviderUrl: "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/NzQ2NjY5MTk2MzE2X2lucy02OTNjMzFlYTA0YjJjMmRi",
  },
}

export const GITHUB_REPO = "gnome-trading-group/gnome-controller";
export const GITHUB_BRANCH = "main";
