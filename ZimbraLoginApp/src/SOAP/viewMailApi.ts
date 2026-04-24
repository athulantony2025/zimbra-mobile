import { callSoapApi } from './api';

export type MailAttachment = {
  name?: string;
  size?: number;
  contentType?: string;
  part?: string;
};

export type MailMessage = {
  id: string;
  subject?: string;
  flags?: string;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
};

export type MailConversation = {
  id: string;
  subject?: string;
  flags?: string;
  unread?: number;
  messages?: MailMessage[];
};

export type MailPreferences = {
  zimbraPrefMessageViewHtmlPreferred: boolean;
  zimbraPrefMarkMsgRead: number;
  zimbraPrefMailSendReadReceipts: string;
};

type MarkReadActionType = 'MsgAction' | 'ConvAction';

type HeaderInput = Array<{ n: string }>;

const toArray = <T,>(value?: T | T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  messages: toArray(rawConversation?.m ?? rawConversation?.messages).map(parseSoapMessage),
});

export const fetchMailPreferencesViaSoap = async (
  authToken: unknown,
  defaults: MailPreferences,
): Promise<MailPreferences> => {
  const getPrefsResponse = await callSoapApi<any>({
    authToken,
    requestName: 'GetPrefsRequest',
    namespace: 'urn:zimbraAccount',
    bodyPayload: {
      pref: [
        { name: 'zimbraPrefMessageViewHtmlPreferred' },
        { name: 'zimbraPrefMarkMsgRead' },
        { name: 'zimbraPrefMailSendReadReceipts' },
      ],
    },
  });

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
      defaults.zimbraPrefMessageViewHtmlPreferred,
    ),
    zimbraPrefMarkMsgRead: toNumberPreference(
      prefMap.zimbraPrefMarkMsgRead,
      defaults.zimbraPrefMarkMsgRead,
    ),
    zimbraPrefMailSendReadReceipts: String(
      prefMap.zimbraPrefMailSendReadReceipts || defaults.zimbraPrefMailSendReadReceipts,
    ).toLowerCase(),
  };
};

export const fetchMessageViaSoap = async (
  authToken: unknown,
  id: string,
  htmlPreferred: boolean,
  maxBodySize: number,
  header: HeaderInput,
): Promise<MailMessage | null> => {
  const response = await callSoapApi<any>({
    authToken,
    requestName: 'GetMsgRequest',
    bodyPayload: {
      m: {
        id,
        html: htmlPreferred ? 1 : 0,
        header,
        needExp: 1,
        neuter: 0,
        max: maxBodySize,
        raw: 0,
      },
    },
  });

  const rawMessage = toArray(response?.m)[0];
  return rawMessage ? parseSoapMessage(rawMessage) : null;
};

export const fetchConversationViaSoap = async (
  authToken: unknown,
  id: string,
  htmlPreferred: boolean,
  maxBodySize: number,
  header: HeaderInput,
): Promise<MailConversation | null> => {
  const response = await callSoapApi<any>({
    authToken,
    requestName: 'GetConvRequest',
    bodyPayload: {
      c: {
        id,
        fetch: 'all',
        html: htmlPreferred ? 1 : 0,
        header,
        needExp: 1,
        max: maxBodySize,
      },
    },
  });

  const rawConversation = toArray(response?.c)[0];
  return rawConversation ? parseSoapConversation(rawConversation) : null;
};

export const markReadViaSoap = async (
  authToken: unknown,
  actionType: MarkReadActionType,
  targetId: string,
): Promise<void> => {
  const requestName = actionType === 'MsgAction' ? 'MsgActionRequest' : 'ConvActionRequest';

  await callSoapApi({
    authToken,
    requestName,
    bodyPayload: {
      action: {
        id: targetId,
        op: 'read',
      },
    },
  });
};

export const sendDeliveryReportViaSoap = async (
  authToken: unknown,
  messageId: string,
): Promise<void> => {
  await callSoapApi({
    authToken,
    requestName: 'SendDeliveryReportRequest',
    bodyPayload: {
      mid: messageId,
    },
  });
};
