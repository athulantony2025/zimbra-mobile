import type { MailMessage, MailPreferences } from '../../SOAP/viewMailApi';

export const DEFAULT_PREFERENCES: MailPreferences = {
  zimbraPrefMessageViewHtmlPreferred: true,
  zimbraPrefMarkMsgRead: -1,
  zimbraPrefMailSendReadReceipts: 'prompt',
};

export const MAX_BODY_SIZE = 250000;
export const HEADER_INPUT: Array<{ n: string }> = [{ n: 'IN-REPLY-TO' }];

const EVENT_MARKERS = ['begin:vcalendar', 'begin:vevent', 'dtstart', 'method:request'];

export type EventDetails = {
  summary?: string;
  start?: string;
  end?: string;
  location?: string;
  organizer?: string;
  method?: string;
};

export type RawGraphqlPreferences = {
  zimbraPrefMessageViewHtmlPreferred?: boolean | string;
  zimbraPrefMarkMsgRead?: number | string;
  zimbraPrefMailSendReadReceipts?: string;
};

export const isUnreadByFlags = (flags?: string) =>
  typeof flags === 'string' ? flags.includes('u') : false;

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : String(message ?? '');
  }
  return String(error ?? '');
};

export const isGraphqlSchemaUnsupported = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('validation error') ||
    message.includes('cannot query field') ||
    message.includes('unknown type') ||
    message.includes('fieldundefined')
  );
};

export const normalizePreferences = (
  rawPreferences: RawGraphqlPreferences,
): MailPreferences => {
  const htmlPreference = rawPreferences.zimbraPrefMessageViewHtmlPreferred;
  const markReadPreference = Number(rawPreferences.zimbraPrefMarkMsgRead);

  return {
    zimbraPrefMessageViewHtmlPreferred:
      typeof htmlPreference === 'boolean'
        ? htmlPreference
        : String(
            htmlPreference ?? DEFAULT_PREFERENCES.zimbraPrefMessageViewHtmlPreferred,
          ).toLowerCase() !== 'false',
    zimbraPrefMarkMsgRead: Number.isFinite(markReadPreference)
      ? markReadPreference
      : DEFAULT_PREFERENCES.zimbraPrefMarkMsgRead,
    zimbraPrefMailSendReadReceipts: String(
      rawPreferences.zimbraPrefMailSendReadReceipts ||
        DEFAULT_PREFERENCES.zimbraPrefMailSendReadReceipts,
    ).toLowerCase(),
  };
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

const decodeIcsText = (value: string) =>
  value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');

const readOrganizer = (value: string) => {
  const normalized = decodeIcsText(value).trim();
  const mailtoMatch = normalized.match(/mailto:([^;]+)/i);
  return mailtoMatch?.[1] || normalized;
};

const parseIcsDate = (rawValue?: string) => {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const dateOnlyMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return parsed.toLocaleDateString();
  }

  const dateTimeMatch = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
  );
  if (dateTimeMatch) {
    const [, year, month, day, hour, minute, second, isUtc] = dateTimeMatch;
    const parsed = isUtc
      ? new Date(
          Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
          ),
        )
      : new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        );
    return parsed.toLocaleString();
  }

  return decodeIcsText(value);
};

const readIcsField = (ics: string, field: string) => {
  const pattern = new RegExp(`^${field}(?:;[^:]*)?:(.+)$`, 'im');
  const match = ics.match(pattern);
  return match?.[1]?.trim() || '';
};

const parseEventDetailsFromText = (content: string): EventDetails | null => {
  const normalized = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '');
  if (!normalized.trim()) return null;

  const summary = decodeIcsText(readIcsField(normalized, 'SUMMARY'));
  const location = decodeIcsText(readIcsField(normalized, 'LOCATION'));
  const organizer = readOrganizer(readIcsField(normalized, 'ORGANIZER'));
  const method = decodeIcsText(readIcsField(normalized, 'METHOD')).toUpperCase();
  const start = parseIcsDate(readIcsField(normalized, 'DTSTART'));
  const end = parseIcsDate(readIcsField(normalized, 'DTEND'));

  const hasEventFields = !!(summary || location || organizer || start || end || method);
  return hasEventFields
    ? {
        summary,
        start,
        end,
        location,
        organizer,
        method,
      }
    : null;
};

export const hasCalendarAttachment = (message?: MailMessage) =>
  (message?.attachments || []).some(attachment => {
    const contentType = String(attachment.contentType || '').toLowerCase();
    const name = String(attachment.name || '').toLowerCase();
    return contentType.includes('text/calendar') || name.endsWith('.ics');
  });

export const isEventMessage = (message?: MailMessage) => {
  if (!message) return false;
  const bodyContent = `${message.text || ''}\n${stripHtml(message.html || '')}`
    .toLowerCase();
  const hasBodyMarkers = EVENT_MARKERS.some(marker => bodyContent.includes(marker));
  return hasBodyMarkers || hasCalendarAttachment(message);
};

export const getEventDetails = (message?: MailMessage) => {
  if (!message) return null;
  const sources = [message.text || '', stripHtml(message.html || '')].filter(Boolean);
  for (const source of sources) {
    const parsed = parseEventDetailsFromText(source);
    if (parsed) return parsed;
  }
  return null;
};

export const getDisplayBody = (message?: MailMessage) => {
  if (!message) return 'No content found.';
  const textBody = message.text?.trim();
  if (textBody) return textBody;
  const htmlBody = message.html?.trim();
  if (!htmlBody) return 'No content found.';
  const stripped = stripHtml(htmlBody);
  return stripped || 'No content found.';
};

export const formatDate = (value?: string | number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toLocaleString();
};
