import { gql } from '@apollo/client';

export const LOGIN_MUTATION = gql`
  mutation authenticate($authInput: AuthRequestInput!) {
    authenticate(authInput: $authInput) {
      authToken
      csrfToken
      twoFactorAuthRequired
      resetPassword
      trustedDevicesEnabled
      trustedToken
    }
  }
`;