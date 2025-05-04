import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import * as path from "path";

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, "ControllerBucket", {
      bucketName: "gnome-controller-frontend",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const userPool = new cognito.UserPool(this, "ControllerUserPool", {
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

    const domain = userPool.addDomain("CognitoDomain", {
      cognitoDomain: {
        domainPrefix: "gnome-controller",
      },
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, "ControllerOAI");
    websiteBucket.grantRead(originAccessIdentity);

    const distribution = new cloudfront.Distribution(this, "ControllerDistribution", {
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

    const appClient = userPool.addClient("ControllerAppClient", {
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
          'http://localhost:5173',
          'http://localhost:3000',
          'http://localhost:8080',
        ],
        logoutUrls: [
          `https://${distribution.distributionDomainName}`,
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
    });

    const identityProvider = new cognito.CfnUserPoolIdentityProvider(this, "IdentityCenterProvider", {
      userPoolId: userPool.userPoolId,
      providerName: "IdentityCenter",
      providerType: "SAML",
      providerDetails: {
        MetadataURL: "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/NzQ2NjY5MTk2MzE2X2lucy0wMjA1N2ZhNzE4MDc5Y2U2",
      },
      attributeMapping: {
        email: "email",
        username: "username",
      },
    });

    const userPoolClient = appClient.node.defaultChild as cognito.CfnUserPoolClient;
    userPoolClient.supportedIdentityProviders = ['IdentityCenter'];

    new s3deploy.BucketDeployment(this, "DeployControllerUI", {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', '..', 'dist'))],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "ControllerDistributionDomainName", {
      value: distribution.distributionDomainName,
      description: "Controller UI URL",
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "AppClientId", {
      value: appClient.userPoolClientId,
      description: "Cognito App Client ID",
    });
  }
}
