import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApolloClient } from '@apollo/client/react';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import { useAppSelector } from '../store/hooks';
import {
  GET_CONVERSATION_QUERY,
  GET_MESSAGE_QUERY,
  GET_PREFERENCES_QUERY,
} from '../graphql/query';
import {
  MARK_READ_MUTATION,
  SEND_DELIVERY_REPORT_MUTATION,
} from '../graphql/mutations';
import {
  fetchConversationViaSoap,
  fetchMailPreferencesViaSoap,
  fetchMessageViaSoap,
  markReadViaSoap,
  sendDeliveryReportViaSoap,
} from '../SOAP/viewMailApi';
import type {
  MailAttachment,
  MailConversation,
  MailMessage,
  MailPreferences,
} from '../SOAP/viewMailApi';
import {
  COLORS,
  DEFAULT_PREFERENCES,
  ErrorState,
  formatDate,
  getDisplayBody,
  getEventDetails,
  hasCalendarAttachment,
  HEADER_INPUT,
  isEventMessage,
  isGraphqlSchemaUnsupported,
  isUnreadByFlags,
  LoadingState,
  MAX_BODY_SIZE,
  normalizePreferences,
} from './shared';
import type { EventDetails, RawGraphqlPreferences } from './shared';

const ViewMail: React.FC = () => {
  const client = useApolloClient();
  const authToken = useAppSelector(state => state.auth.authToken);
  const route = useRoute<RouteProp<MainStackParamList, 'ViewMail'>>();
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadSentRef = useRef(false);
  const isMountedRef = useRef(true);
  const useSoapOnlyRef = useRef(false);

  const itemId = route.params?.messageId;
  const viewType = route.params?.viewType ?? 'message';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [subject, setSubject] = useState(route.params?.subject ?? '(No subject)');
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [conversation, setConversation] = useState<MailConversation | null>(null);

  const sender = route.params?.sender ?? 'Unknown sender';
  const receivedAt = useMemo(
    () => formatDate(route.params?.timestamp),
    [route.params?.timestamp],
  );

  const clearReadTimer = () => {
    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
  };

  const performMarkRead = useCallback(
    async (
      actionType: 'MsgAction' | 'ConvAction',
      targetId: string,
      preferences: MailPreferences,
      readReceiptMessageId?: string,
    ) => {
      if (markReadSentRef.current) return;
      markReadSentRef.current = true;

      try {
        if (!useSoapOnlyRef.current) {
          try {
            await client.mutate({
              mutation: MARK_READ_MUTATION,
              variables: {
                type: actionType,
                ids: [targetId],
                op: 'read',
                isLocal: false,
              },
            });
          } catch (error) {
            if (!isGraphqlSchemaUnsupported(error)) {
              throw error;
            }
            useSoapOnlyRef.current = true;
          }
        }

        if (useSoapOnlyRef.current) {
          await markReadViaSoap(authToken, actionType, targetId);
        }

        if (
          preferences.zimbraPrefMailSendReadReceipts === 'always' &&
          route.params?.sendReadReceipt &&
          readReceiptMessageId
        ) {
          if (!useSoapOnlyRef.current) {
            try {
              await client.mutate({
                mutation: SEND_DELIVERY_REPORT_MUTATION,
                variables: { messageId: readReceiptMessageId },
              });
            } catch (error) {
              if (!isGraphqlSchemaUnsupported(error)) {
                throw error;
              }
              useSoapOnlyRef.current = true;
            }
          }

          if (useSoapOnlyRef.current) {
            await sendDeliveryReportViaSoap(authToken, readReceiptMessageId);
          }
        }

        if (isMountedRef.current) {
          setStatusNote('Marked as read.');
        }
      } catch (err: any) {
        markReadSentRef.current = false;
        if (isMountedRef.current) {
          setStatusNote(err?.message || 'Unable to mark as read.');
        }
      }
    },
    [authToken, client, route.params?.sendReadReceipt],
  );

  const scheduleMarkRead = useCallback(
    async (
      preferences: MailPreferences,
      unread: boolean,
      actionType: 'MsgAction' | 'ConvAction',
      targetId: string,
      readReceiptMessageId?: string,
    ) => {
      if (!unread) {
        setStatusNote('Already read.');
        return;
      }

      const delaySeconds = preferences.zimbraPrefMarkMsgRead;
      if (delaySeconds === -1) {
        setStatusNote('Auto mark-as-read is disabled by preference.');
        return;
      }

      if (delaySeconds === 0) {
        setStatusNote('Marking as read...');
        await performMarkRead(
          actionType,
          targetId,
          preferences,
          readReceiptMessageId,
        );
        return;
      }

      if (delaySeconds > 0) {
        setStatusNote(`Will mark as read in ${delaySeconds}s.`);
        clearReadTimer();
        readTimerRef.current = setTimeout(() => {
          void performMarkRead(
            actionType,
            targetId,
            preferences,
            readReceiptMessageId,
          );
        }, delaySeconds * 1000);
      }
    },
    [performMarkRead],
  );

  const loadPreferences = useCallback(async (): Promise<MailPreferences> => {
    if (!useSoapOnlyRef.current) {
      try {
        const preferenceResponse = await client.query<{
          getPreferences?: RawGraphqlPreferences;
        }>({
          query: GET_PREFERENCES_QUERY,
          fetchPolicy: 'network-only',
        });

        const rawPreferences = preferenceResponse.data?.getPreferences;
        if (rawPreferences) {
          return normalizePreferences(rawPreferences);
        }
      } catch (graphqlError) {
        if (!isGraphqlSchemaUnsupported(graphqlError)) {
          throw graphqlError;
        }
        useSoapOnlyRef.current = true;
      }
    }

    return fetchMailPreferencesViaSoap(authToken, DEFAULT_PREFERENCES);
  }, [authToken, client]);

  const loadMail = useCallback(async () => {
    if (!itemId) {
      setError('Missing message id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setStatusNote(null);
    markReadSentRef.current = false;
    clearReadTimer();

    try {
      const preferences = await loadPreferences();

      if (viewType === 'conversation') {
        let loadedConversation: MailConversation | null = null;

        if (!useSoapOnlyRef.current) {
          try {
            const conversationResponse = await client.query<{
              conversation?: MailConversation;
            }>({
              query: GET_CONVERSATION_QUERY,
              variables: {
                id: itemId,
                fetch: 'all',
                html: preferences.zimbraPrefMessageViewHtmlPreferred,
                needExp: true,
                max: MAX_BODY_SIZE,
                header: HEADER_INPUT,
              },
              fetchPolicy: 'network-only',
            });
            loadedConversation =
              (conversationResponse.data?.conversation as MailConversation) || null;
          } catch (error) {
            if (!isGraphqlSchemaUnsupported(error)) {
              throw error;
            }
            useSoapOnlyRef.current = true;
          }
        }

        if (useSoapOnlyRef.current) {
          loadedConversation = await fetchConversationViaSoap(
            authToken,
            itemId,
            preferences.zimbraPrefMessageViewHtmlPreferred,
            MAX_BODY_SIZE,
            HEADER_INPUT,
          );
        }

        if (!loadedConversation?.id) {
          throw new Error('Conversation not found.');
        }

        setConversation(loadedConversation);
        setMessage(null);
        setSubject(loadedConversation.subject || route.params?.subject || '(No subject)');

        const isUnread =
          Number(loadedConversation.unread) > 0 ||
          isUnreadByFlags(loadedConversation.flags) ||
          !!route.params?.unread;

        await scheduleMarkRead(
          preferences,
          isUnread,
          'ConvAction',
          loadedConversation.id,
        );
      } else {
        let loadedMessage: MailMessage | null = null;

        if (!useSoapOnlyRef.current) {
          try {
            const messageResponse = await client.query<{
              message?: MailMessage;
            }>({
              query: GET_MESSAGE_QUERY,
              variables: {
                id: itemId,
                html: preferences.zimbraPrefMessageViewHtmlPreferred,
                max: MAX_BODY_SIZE,
                isLocal: false,
                header: HEADER_INPUT,
              },
              fetchPolicy: 'network-only',
            });
            loadedMessage = (messageResponse.data?.message as MailMessage) || null;
          } catch (error) {
            if (!isGraphqlSchemaUnsupported(error)) {
              throw error;
            }
            useSoapOnlyRef.current = true;
          }
        }

        if (useSoapOnlyRef.current) {
          loadedMessage = await fetchMessageViaSoap(
            authToken,
            itemId,
            preferences.zimbraPrefMessageViewHtmlPreferred,
            MAX_BODY_SIZE,
            HEADER_INPUT,
          );
        }

        if (!loadedMessage?.id) {
          throw new Error('Message not found.');
        }

        setMessage(loadedMessage);
        setConversation(null);
        setSubject(loadedMessage.subject || route.params?.subject || '(No subject)');

        const isUnread = isUnreadByFlags(loadedMessage.flags) || !!route.params?.unread;
        await scheduleMarkRead(
          preferences,
          isUnread,
          'MsgAction',
          loadedMessage.id,
          loadedMessage.id,
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load mail details.');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [
    authToken,
    client,
    itemId,
    loadPreferences,
    route.params?.subject,
    route.params?.unread,
    scheduleMarkRead,
    viewType,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadMail();
    return () => {
      isMountedRef.current = false;
      clearReadTimer();
    };
  }, [loadMail]);

  const renderAttachments = (attachments?: MailAttachment[]) => {
    if (!attachments?.length) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Attachments ({attachments.length})</Text>
        {attachments.map((attachment, index) => (
          <View
            key={`${attachment.part || attachment.name || 'attachment'}-${index}`}
            style={styles.attachmentRow}
          >
            <Text style={styles.attachmentName} numberOfLines={1}>
              {attachment.name || 'Unnamed attachment'}
            </Text>
            <Text style={styles.attachmentMeta}>
              {attachment.contentType || 'unknown'} | {attachment.size ?? 0} bytes
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderEventDetails = (
    details: EventDetails | null,
    calendarAttachmentDetected = false,
  ) => {
    if (!details && !calendarAttachmentDetected) return null;

    return (
      <View style={styles.eventWrap}>
        <Text style={styles.eventTitle}>Event Details</Text>
        {!details && calendarAttachmentDetected && (
          <Text style={styles.eventLine}>
            Calendar invite attachment detected. Event metadata was not in message
            body.
          </Text>
        )}
        {!!details?.summary && (
          <Text style={styles.eventLine}>
            <Text style={styles.eventKey}>Title: </Text>
            {details?.summary}
          </Text>
        )}
        {!!details?.start && (
          <Text style={styles.eventLine}>
            <Text style={styles.eventKey}>Starts: </Text>
            {details?.start}
          </Text>
        )}
        {!!details?.end && (
          <Text style={styles.eventLine}>
            <Text style={styles.eventKey}>Ends: </Text>
            {details?.end}
          </Text>
        )}
        {!!details?.location && (
          <Text style={styles.eventLine}>
            <Text style={styles.eventKey}>Location: </Text>
            {details?.location}
          </Text>
        )}
        {!!details?.organizer && (
          <Text style={styles.eventLine}>
            <Text style={styles.eventKey}>Organizer: </Text>
            {details?.organizer}
          </Text>
        )}
        {!!details?.method && (
          <Text style={styles.eventLine}>
            <Text style={styles.eventKey}>Type: </Text>
            {details?.method}
          </Text>
        )}
      </View>
    );
  };

  const renderMessageContent = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Body</Text>
      {isEventMessage(message || undefined) &&
        renderEventDetails(
          getEventDetails(message || undefined),
          hasCalendarAttachment(message || undefined),
        )}
      <Text style={styles.bodyText}>{getDisplayBody(message || undefined)}</Text>
      {renderAttachments(message?.attachments)}
    </View>
  );

  const renderConversationContent = () => {
    const messages = conversation?.messages || [];
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Thread Messages ({messages.length})</Text>
        {messages.map((threadMessage, index) => (
          <View key={threadMessage.id || `thread-${index}`} style={styles.threadCard}>
            <Text style={styles.threadSubject}>
              {threadMessage.subject || '(No subject)'}
            </Text>
            {isEventMessage(threadMessage) &&
              renderEventDetails(
                getEventDetails(threadMessage),
                hasCalendarAttachment(threadMessage),
              )}
            <Text style={styles.bodyText}>{getDisplayBody(threadMessage)}</Text>
            {renderAttachments(threadMessage.attachments)}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.subject}>{subject}</Text>
        <Text style={styles.metaText}>From: {sender}</Text>
        {!!receivedAt && <Text style={styles.metaText}>Received: {receivedAt}</Text>}
        {!!statusNote && <Text style={styles.statusText}>{statusNote}</Text>}
      </View>

      {loading ? (
        <LoadingState
          message="Loading full mail content..."
          spinnerColor={COLORS.primaryBlue}
        />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => void loadMail()}
          retryLabel="Retry"
          accentColor={COLORS.primaryBlue}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {viewType === 'conversation'
            ? renderConversationContent()
            : renderMessageContent()}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
    padding: 14,
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e7ebf3',
    padding: 14,
    marginBottom: 12,
  },
  subject: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  metaText: {
    color: '#4b5563',
    fontSize: 13,
    marginBottom: 2,
  },
  statusText: {
    marginTop: 8,
    color: '#0369a1',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    paddingBottom: 18,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e7ebf3',
    padding: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 10,
  },
  bodyText: {
    color: '#111827',
    fontSize: 14,
    lineHeight: 22,
  },
  eventWrap: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 8,
    backgroundColor: '#f8fbff',
    padding: 10,
    marginBottom: 10,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e3a8a',
    marginBottom: 6,
  },
  eventLine: {
    fontSize: 13,
    color: '#1f2937',
    marginBottom: 2,
    lineHeight: 20,
  },
  eventKey: {
    fontWeight: '700',
    color: '#1f2937',
  },
  attachmentRow: {
    borderTopWidth: 1,
    borderTopColor: '#edf1f7',
    paddingTop: 10,
    marginTop: 10,
  },
  attachmentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  attachmentMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  threadCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  threadSubject: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
});

export default ViewMail;
