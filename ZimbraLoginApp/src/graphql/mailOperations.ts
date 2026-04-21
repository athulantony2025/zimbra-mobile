import { gql } from '@apollo/client';

export const GET_PREFERENCES_QUERY = gql`
  query GetPreferences {
    getPreferences {
      zimbraPrefMessageViewHtmlPreferred
      zimbraPrefMarkMsgRead
      zimbraPrefMailSendReadReceipts
    }
  }
`;

export const GET_MESSAGE_QUERY = gql`
  query getMessage(
    $id: ID!
    $html: Boolean
    $max: Int
    $isLocal: Boolean = false
    $header: [MailItemHeaderInput]
  ) {
    message: getMessage(
      id: $id
      html: $html
      max: $max
      isLocal: $isLocal
      header: $header
    ) {
      id
      subject
      flags
      html
      text
      attachments {
        name
        size
        contentType
        part
      }
    }
  }
`;

export const GET_CONVERSATION_QUERY = gql`
  query getConversation(
    $id: ID!
    $header: [MailItemHeaderInput]
    $html: Boolean
    $max: Int
    $needExp: Boolean
    $fetch: String
  ) {
    conversation: getConversation(
      id: $id
      header: $header
      html: $html
      max: $max
      needExp: $needExp
      fetch: $fetch
    ) {
      id
      subject
      flags
      unread
      messages {
        id
        subject
        flags
        html
        text
        attachments {
          name
          size
          contentType
          part
        }
      }
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
