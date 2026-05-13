import { GnomeAccount, Stage } from "@gnome-trading-group/gnome-shared-cdk";

export interface ControllerConfig {
  account: GnomeAccount;

  // Controller settings
  controllerIdentityProviderUrl: string;
  domainName: string;
  certificateArn: string;
}

const defaultConfig = {
}

export const CONFIGS: { [stage in Stage]?:  ControllerConfig } = {
  [Stage.DEV]: {
    ...defaultConfig,
    account: GnomeAccount.InfraDev,

    controllerIdentityProviderUrl: "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/NzQ2NjY5MTk2MzE2X2lucy0wMjA1N2ZhNzE4MDc5Y2U2",
    domainName: "controller-dev.gnometrading.group",
    certificateArn: "arn:aws:acm:us-east-1:443370708724:certificate/3c450979-67db-4ad1-bdad-a6dd1c0001c0",
  },
  // [Stage.STAGING]: {
  //   ...defaultConfig,
  //   account: GnomeAccount.InfraStaging,
  // },
  [Stage.PROD]: {
    ...defaultConfig,
    account: GnomeAccount.InfraProd,

    controllerIdentityProviderUrl: "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/NzQ2NjY5MTk2MzE2X2lucy02OTNjMzFlYTA0YjJjMmRi",
    domainName: "controller.gnometrading.group",
    certificateArn: "arn:aws:acm:us-east-1:241533121172:certificate/10d470fd-e43a-4145-9a7b-4dc7a48ee42a",
  },
}

export const GITHUB_REPO = "gnome-trading-group/gnome-controller";
export const GITHUB_BRANCH = "main";
