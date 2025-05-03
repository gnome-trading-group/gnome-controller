import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
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

    // Create Cognito User Pool
    const userPool = new cognito.UserPool(this, "ControllerUserPool", {
      userPoolName: "gnome-controller-users",
      selfSignUpEnabled: false, // Disable self sign-up
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
    });

    // Create Origin Access Identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, "ControllerOAI");
    websiteBucket.grantRead(originAccessIdentity);

    // Create CloudFront Function for authentication
    const authFunction = new cloudfront.Function(this, "AuthFunction", {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var headers = request.headers;
          
          // Check for auth token
          if (!headers.cookie || !headers.cookie.value.includes('id_token')) {
            return {
              statusCode: 302,
              statusDescription: 'Found',
              headers: {
                'location': { value: '/auth' }
              }
            };
          }
          
          return request;
        }
      `),
    });

    const distribution = new cloudfront.Distribution(this, "ControllerDistribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{
          function: authFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
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

    // Create App Client
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
        ],
      },
    });

    // Configure IAM Identity Center as identity provider
    const identityProvider = new cognito.CfnUserPoolIdentityProvider(this, "IdentityCenterProvider", {
      userPoolId: userPool.userPoolId,
      providerName: "IdentityCenter",
      providerType: "SAML",
      providerDetails: {
        MetadataURL: "https://portal.sso.us-east-1.amazonaws.com/saml/metadata", // Replace with your IAM Identity Center metadata URL
      },
      attributeMapping: {
        email: "email",
        username: "username",
      },
    });

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
