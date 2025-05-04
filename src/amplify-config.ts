import { Amplify } from 'aws-amplify';
import { ResourcesConfig } from 'aws-amplify';

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;

if (!userPoolId || !userPoolClientId || !cognitoDomain) {
  throw new Error('Missing required environment variables for Cognito configuration');
}

const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      userPoolEndpoint: cognitoDomain,
      loginWith: {
        oauth: {
          domain: cognitoDomain,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [window.location.origin],
          redirectSignOut: [window.location.origin],
          responseType: 'code',
        },
      },
    },
  },
};

Amplify.configure(amplifyConfig);

export default amplifyConfig; 