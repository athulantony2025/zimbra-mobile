import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
  MARK_READ_MUTATION,
  SEND_DELIVERY_REPORT_MUTATION,
} from '../graphql/mailOperations';

type MailAttachment = {
  name?: string;
  size?: number;
  contentType?: string;
  part?: string;
};

type MailMessage = {
  id: string;
  subject?: string;
  flags?: string;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
};

type MailConversation = {
  id: string;
  subject?: string;
  flags?: string;
  unread?: number;
  messages?: MailMessage[];
};

type MailPreferences = {
  zimbraPrefMessageViewHtmlPreferred: boolean;
  zimbraPrefMarkMsgRead: number;
  zimbraPrefMailSendReadReceipts: string;
};

const DEFAULT_PREFERENCES: MailPreferences = {
  zimbraPrefMessageViewHtmlPreferred: true,
  zimbraPrefMarkMsgRead: -1,
  zimbraPrefMailSendReadReceipts: 'prompt',
};

const BASE_URL = 'https://apps-development.zimbradev.com';
const MAX_BODY_SIZE = 250000;
const HEADER_INPUT = [{ n: 'IN-REPLY-TO' }];

const toArray = <T,>(value?: T | T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const getToken = (raw: unknown) => {
  if (typeof raw === 'string') return raw.replace(/^Bearer\s+/i, '').trim();
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { _content?: string })._content === 'string'
  ) {
    return (raw as { _content: string })._content.trim();
  }
  return '';
};

const toBooleanPreference = (value: unknown, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() !== 'false';
  return fallback;
};

const toNumberPreference = (value: unknown, fallback = -1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isUnreadByFlags = (flags?: string) =>
  typeof flags === 'string' ? flags.includes('u') : false;

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : String(message ?? '');
  }
  return String(error ?? '');
};

const isGraphqlSchemaUnsupported = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('validation error') ||
    message.includes('cannot query field') ||
    message.includes('unknown type') ||
    message.includes('fieldundefined')
  );
};

const decodeHtmlEntities = (input: string) =>
  input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const stripHtml = (html: string) => {
  const withoutScriptAndStyle = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  const withLineBreaks = withoutScriptAndStyle
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  const noTags = withLineBreaks.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(noTags)
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const getDisplayBody = (message?: MailMessage) => {
  if (!message) return 'No content found.';
  const textBody = message.text?.trim();
  if (textBody) return textBody;
  const htmlBody = message.html?.trim();
  if (!htmlBody) return 'No content found.';
  const stripped = stripHtml(htmlBody);
  return stripped || 'No content found.';
};

const formatDate = (value?: string | number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toLocaleString();
};

const extractSoapBody = (data: any) =>
  Array.isArray(data?.Body) ? data.Body[0] : data?.Body;

const extractSoapFault = (body: any) =>
  Array.isArray(body?.Fault) ? body.Fault[0] : body?.Fault;

const extractSoapResponse = (body: any, requestName: string) => {
  const responseName = requestName.replace(/Request$/, 'Response');
  const response = body?.[responseName];
  return Array.isArray(response) ? response[0] : response;
};

const readTextContent = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const content = (value as { _content?: unknown })._content;
    if (typeof content === 'string') return content;
  }
  return '';
};

const extractMessageParts = (rawMessage: any) => {
  let text = '';
  let html = '';
  const attachments: MailAttachment[] = [];

  const walk = (parts: any[]) => {
    parts.forEach(part => {
      const contentType = String(part?.ct || part?.contentType || '').toLowerCase();
      const disposition = String(part?.cd || part?.contentDisposition || '').toLowerCase();
      const content = readTextContent(part?.content);
      const childParts = toArray(part?.mp ?? part?.mimePart ?? part?.mimeParts);

      if (!text && contentType.startsWith('text/plain') && content) {
        text = content;
      }
      if (!html && contentType.startsWith('text/html') && content) {
        html = content;
      }

      if (disposition.includes('attachment') || disposition.includes('inline')) {
        attachments.push({
          name: part?.filename || part?.name,
          size: toNumber(part?.s ?? part?.size, 0),
          contentType: part?.ct || part?.contentType,
          part: part?.part,
        });
      }

      if (childParts.length) walk(childParts);
    });
  };

  walk(toArray(rawMessage?.mp ?? rawMessage?.mimePart ?? rawMessage?.mimeParts));
  return { text, html, attachments };
};

const parseSoapMessage = (rawMessage: any): MailMessage => {
  const parsed = extractMessageParts(rawMessage);
  return {
    id: String(rawMessage?.id ?? ''),
    subject: rawMessage?.su ?? rawMessage?.subject,
    flags: rawMessage?.f ?? rawMessage?.flags,
    html: parsed.html || readTextContent(rawMessage?.html),
    text: parsed.text || readTextContent(rawMessage?.text),
    attachments: parsed.attachments,
  };
};

const parseSoapConversation = (rawConversation: any): MailConversation => ({
  id: String(rawConversation?.id ?? ''),
  subject: rawConversation?.su ?? rawConversation?.subject,
  flags: rawConversation?.f ?? rawConversation?.flags,
  unread: toNumber(rawConversation?.u ?? rawConversation?.unread, 0),
  messages: toArray(rawConversation?.m ?? rawConversation?.messages).map(
    parseSoapMessage,
  ),
});

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

  const soapRequest = useCallback(
    async <TResponse,>(
      requestName: string,
      bodyPayload: Record<string, unknown>,
      ns: 'urn:zimbraMail' | 'urn:zimbraAccount' = 'urn:zimbraMail',
    ): Promise<TResponse> => {
      const token = getToken(authToken);
      if (!token) {
        throw new Error('Missing auth token. Please login again.');
      }

      const payload = {
        Header: {
          context: {
            _jsns: 'urn:zimbra',
            authToken: token,
          },
        },
        Body: {
          [requestName]: {
            _jsns: ns,
            ...bodyPayload,
          },
        },
      };

      const response = await fetch(`${BASE_URL}/service/soap/${requestName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          Cookie: `ZM_AUTH_TOKEN=${token};`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      const body = extractSoapBody(data);
      const fault = extractSoapFault(body);

      if (!response.ok || fault) {
        const reason = Array.isArray(fault?.Reason)
          ? fault.Reason?.[0]?.Text
          : fault?.Reason?.Text;
        throw new Error(reason || `${requestName} failed (${response.status})`);
      }

      return extractSoapResponse(body, requestName) as TResponse;
    },
    [authToken],
  );

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
          const requestName =
            actionType === 'MsgAction' ? 'MsgActionRequest' : 'ConvActionRequest';
          await soapRequest(requestName, {
            action: {
              id: targetId,
              op: 'read',
            },
          });
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
            await soapRequest('SendDeliveryReportRequest', {
              mid: readReceiptMessageId,
            });
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
    [client, route.params?.sendReadReceipt, soapRequest],
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
          getPreferences?: {
            zimbraPrefMessageViewHtmlPreferred?: boolean | string;
            zimbraPrefMarkMsgRead?: number | string;
            zimbraPrefMailSendReadReceipts?: string;
          };
        }>({
          query: GET_PREFERENCES_QUERY,
          fetchPolicy: 'network-only',
        });

        const rawPreferences = preferenceResponse.data?.getPreferences;
        if (rawPreferences) {
          return {
            zimbraPrefMessageViewHtmlPreferred: toBooleanPreference(
              rawPreferences.zimbraPrefMessageViewHtmlPreferred,
              DEFAULT_PREFERENCES.zimbraPrefMessageViewHtmlPreferred,
            ),
            zimbraPrefMarkMsgRead: toNumberPreference(
              rawPreferences.zimbraPrefMarkMsgRead,
              DEFAULT_PREFERENCES.zimbraPrefMarkMsgRead,
            ),
            zimbraPrefMailSendReadReceipts: String(
              rawPreferences.zimbraPrefMailSendReadReceipts || 'prompt',
            ).toLowerCase(),
          };
        }
      } catch (graphqlError) {
        if (!isGraphqlSchemaUnsupported(graphqlError)) {
          throw graphqlError;
        }
        useSoapOnlyRef.current = true;
      }
    }

    const getPrefsResponse = await soapRequest<any>(
      'GetPrefsRequest',
      {
        pref: [
          { name: 'zimbraPrefMessageViewHtmlPreferred' },
          { name: 'zimbraPrefMarkMsgRead' },
          { name: 'zimbraPrefMailSendReadReceipts' },
        ],
      },
      'urn:zimbraAccount',
    );
    const prefEntries = toArray(getPrefsResponse?.pref);

    const prefMap: Record<string, unknown> = {};
    prefEntries.forEach((entry: any) => {
      const name = entry?._name ?? entry?.name;
      const value = entry?._content ?? entry?.value ?? entry?.content;
      if (name) prefMap[String(name)] = value;
    });

    return {
      zimbraPrefMessageViewHtmlPreferred: toBooleanPreference(
        prefMap.zimbraPrefMessageViewHtmlPreferred,
        DEFAULT_PREFERENCES.zimbraPrefMessageViewHtmlPreferred,
      ),
      zimbraPrefMarkMsgRead: toNumberPreference(
        prefMap.zimbraPrefMarkMsgRead,
        DEFAULT_PREFERENCES.zimbraPrefMarkMsgRead,
      ),
      zimbraPrefMailSendReadReceipts: String(
        prefMap.zimbraPrefMailSendReadReceipts || 'prompt',
      ).toLowerCase(),
    };
  }, [client, soapRequest]);

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
          const getConvResponse = await soapRequest<any>('GetConvRequest', {
            c: {
              id: itemId,
              fetch: 'all',
              html: preferences.zimbraPrefMessageViewHtmlPreferred ? 1 : 0,
              header: HEADER_INPUT,
              needExp: 1,
              max: MAX_BODY_SIZE,
            },
          });
          const rawConversation = toArray(getConvResponse?.c)[0];
          loadedConversation = rawConversation
            ? parseSoapConversation(rawConversation)
            : null;
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
          const getMsgResponse = await soapRequest<any>('GetMsgRequest', {
            m: {
              id: itemId,
              html: preferences.zimbraPrefMessageViewHtmlPreferred ? 1 : 0,
              header: HEADER_INPUT,
              needExp: 1,
              neuter: 0,
              max: MAX_BODY_SIZE,
              raw: 0,
            },
          });
          const rawMessage = toArray(getMsgResponse?.m)[0];
          loadedMessage = rawMessage ? parseSoapMessage(rawMessage) : null;
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

  const renderMessageContent = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Body</Text>
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
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1f6feb" />
          <Text style={styles.subtitle}>Loading full mail content...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadMail()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  subtitle: {
    fontSize: 15,
    color: '#555',
    marginTop: 10,
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
  errorText: {
    color: '#c62828',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default ViewMail;
