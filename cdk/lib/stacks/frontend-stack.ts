import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import * as path from "path";
import { execSync } from "child_process";
import { Stage } from "@gnome-trading-group/gnome-shared-cdk";

interface FrontendStackProps extends cdk.StackProps {
  stage: Stage;
  metadataUrl: string;
  domainName: string;
  certificateArn: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly cliClientId: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, "ControllerBucket", {
      bucketName: `gnome-controller-frontend-${props.stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.userPool = new cognito.UserPool(this, "ControllerUserPool", {
      userPoolName: "gnome-controller-users",
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      autoVerify: {
        email: true,
      },
    });

    const domain = this.userPool.addDomain("CognitoDomain", {
      cognitoDomain: {
        domainPrefix: `gnome-controller-${props.stage}`,
      },
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, "ControllerOAI");
    websiteBucket.grantRead(originAccessIdentity);

    const certificate = acm.Certificate.fromCertificateArn(this, "ControllerCertificate", props.certificateArn);

    const distribution = new cloudfront.Distribution(this, "ControllerDistribution", {
      domainNames: [props.domainName],
      certificate,
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    const appClient = this.userPool.addClient("ControllerAppClient", {
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `https://${distribution.distributionDomainName}`,
          `https://${props.domainName}`,
          'http://localhost:5173',
          'http://localhost:3000',
          'http://localhost:8080',
        ],
        logoutUrls: [
          `https://${distribution.distributionDomainName}`,
          `https://${props.domainName}`,
          'http://localhost:5173',
          'http://localhost:3000',
          'http://localhost:8080',
        ],
      },
      preventUserExistenceErrors: true,
      authFlows: {
        adminUserPassword: false,
        custom: false,
        userPassword: false,
        userSrp: false,
      },
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(24),
      idTokenValidity: cdk.Duration.hours(24),
    });

    const cliClient = this.userPool.addClient("ControllerCliClient", {
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ["http://localhost:9876/callback"],
        logoutUrls: ["http://localhost:9876/callback"],
      },
      preventUserExistenceErrors: true,
      authFlows: { adminUserPassword: false, custom: false, userPassword: false, userSrp: false },
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(24),
      idTokenValidity: cdk.Duration.hours(24),
    });
    const cliPoolClient = cliClient.node.defaultChild as cognito.CfnUserPoolClient;
    cliPoolClient.supportedIdentityProviders = ["IdentityCenter"];
    this.cliClientId = cliClient.userPoolClientId;

    const identityProvider = new cognito.CfnUserPoolIdentityProvider(this, "IdentityCenterProvider", {
      userPoolId: this.userPool.userPoolId,
      providerName: "IdentityCenter",
      providerType: "SAML",
      providerDetails: {
        MetadataURL: props.metadataUrl,
      },
      attributeMapping: {
        email: "email",
        username: "username",
      },
    });

    const userPoolClient = appClient.node.defaultChild as cognito.CfnUserPoolClient;
    userPoolClient.supportedIdentityProviders = ['IdentityCenter'];

    const uiPath = path.join(__dirname, "..", "..", "..");

    const asset = new cdk.AssetStaging(this, "ControllerUIAsset", {
      sourcePath: uiPath,
      bundling: {
        image: cdk.DockerImage.fromRegistry('public.ecr.aws/docker/library/node:18'),
        local: {
          tryBundle(outputDir: string): boolean {
            return false;
            // try {
            //   // If you're running locally, make sure to run `npm run build` in the UI beforehand
            //   execSync(`cp -r ${uiPath}/dist/* ${path.join(outputDir)}`)
            // } catch {
            //   return false
            // }
            // return true
          },
        },
        command: [
          'bash', '-c',
          [
            `cp .env.${props.stage} .env`,
            'npm ci',
            'npm run build',
            'cp -r dist/* /asset-output',
          ].join(' && ')
        ],
      },
    });

    new s3deploy.BucketDeployment(this, "DeployControllerUI", {
      sources: [s3deploy.Source.asset(asset.absoluteStagedPath)],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "ControllerDistributionDomainName", {
      value: distribution.distributionDomainName,
      exportName: "ControllerDistributionDomainName",
      description: "Controller UI CloudFront URL",
    });

    new cdk.CfnOutput(this, "ControllerCustomDomainUrl", {
      value: `https://${props.domainName}`,
      description: "Controller UI custom domain URL",
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: "UserPoolId",
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "AppClientId", {
      value: appClient.userPoolClientId,
      exportName: "AppClientId",
      description: "Cognito App Client ID",
    });
    new cdk.CfnOutput(this, "CliClientId", {
      value: cliClient.userPoolClientId,
      description: "Cognito CLI App Client ID — set as COGNITO_CLIENT_ID in gnomepy config",
    });
  }
}
