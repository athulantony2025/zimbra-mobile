import { gql } from '@apollo/client';

export const LOGIN_MUTATION = gql`
  mutation authenticate($authInput: AuthRequestInput!) {
    authenticate(authInput: $authInput) {
      authToken
      twoFactorAuthRequired
      resetPassword
      trustedDevicesEnabled
      trustedToken
    }
  }
`;

export const MARK_READ_MUTATION = gql`
  mutation action(
    $type: ActionTypeName!
    $ids: [ID!]
    $op: String!
    $isLocal: Boolean = false
  ) {
    action(type: $type, ids: $ids, op: $op, isLocal: $isLocal)
  }
`;

export const SEND_DELIVERY_REPORT_MUTATION = gql`
  mutation sendDeliveryReport($messageId: ID!) {
    sendDeliveryReport(messageId: $messageId)
  }
`;
