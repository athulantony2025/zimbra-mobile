import type { MailMessage, MailPreferences } from '../../SOAP/viewMailApi';

export const DEFAULT_PREFERENCES: MailPreferences = {
  zimbraPrefMessageViewHtmlPreferred: true,
  zimbraPrefMarkMsgRead: -1,
  zimbraPrefMailSendReadReceipts: 'prompt',
};

export const MAX_BODY_SIZE = 250000;
export const HEADER_INPUT: Array<{ n: string }> = [{ n: 'IN-REPLY-TO' }];

const EVENT_MARKERS = [
  'begin:vcalendar',
  'begin:vevent',
  'dtstart',
  'method:request',
  '*~*~*~*~*~*~*~*',
  'organizer:',
  'invitees:',
  'attendees:',
  'when:',
];

export type EventDetails = {
  summary?: string;
  start?: string;
  end?: string;
  location?: string;
  organizer?: string;
  invitees?: string[];
  description?: string;
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

const cleanIcsName = (value: string) =>
  decodeIcsText(value)
    .replace(/^"|"$/g, '')
    .trim();

const toDisplayIdentity = (name?: string, email?: string) => {
  const normalizedName = String(name || '').trim();
  if (normalizedName) return normalizedName;

  const normalizedEmail = String(email || '').trim();
  if (!normalizedEmail) return '';

  const localPart = normalizedEmail.split('@')[0]?.trim();
  return localPart || normalizedEmail;
};

const parseOrganizerFromIcs = (ics: string) => {
  const organizerLine = ics
    .split('\n')
    .map(line => line.trim())
    .find(line => /^ORGANIZER(?:;|:)/i.test(line));
  if (!organizerLine) return '';

  const separatorIndex = organizerLine.indexOf(':');
  const head =
    separatorIndex >= 0 ? organizerLine.slice(0, separatorIndex) : organizerLine;
  const tail = separatorIndex >= 0 ? organizerLine.slice(separatorIndex + 1) : '';

  const nameMatch = head.match(/(?:^|;)CN=([^;]+)/i);
  const name = nameMatch?.[1] ? cleanIcsName(nameMatch[1]) : '';
  const emailMatch = tail.match(/mailto:([^;]+)/i);
  const email = emailMatch?.[1] ? decodeIcsText(emailMatch[1]).trim() : '';

  return toDisplayIdentity(name, email) || readOrganizer(tail);
};

const parseInviteesFromIcs = (ics: string) => {
  const seen = new Set<string>();
  const invitees: string[] = [];

  ics
    .split('\n')
    .map(line => line.trim())
    .forEach(line => {
      if (!/^ATTENDEE(?:;|:)/i.test(line)) return;

      const separatorIndex = line.indexOf(':');
      const head = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
      const tail = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';

      const nameMatch = head.match(/(?:^|;)CN=([^;]+)/i);
      const name = nameMatch?.[1] ? cleanIcsName(nameMatch[1]) : '';
      const emailMatch = tail.match(/mailto:([^;]+)/i);
      const email = emailMatch?.[1] ? decodeIcsText(emailMatch[1]).trim() : '';
      const display = toDisplayIdentity(name, email);
      const dedupeKey = display.toLowerCase();

      if (!dedupeKey || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      invitees.push(display);
    });

  return invitees;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const readLabeledField = (content: string, labels: string[]) => {
  const labelsPattern = labels.map(escapeRegex).join('|');
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${labelsPattern})\\s*[:\\-]\\s*(.+)$`, 'im');
  const value = content.match(pattern)?.[1] || '';
  return decodeIcsText(value).trim();
};

const normalizeInvitees = (values: string[]) => {
  const seen = new Set<string>();
  const invitees: string[] = [];

  values.forEach(value => {
    const emailMatch = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    const display = emailMatch
      ? toDisplayIdentity('', emailMatch[0].toLowerCase())
      : cleanIcsName(value);
    const dedupeKey = display.toLowerCase();

    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    invitees.push(display);
  });

  return invitees;
};

const parseInviteesFromValue = (value: string) =>
  normalizeInvitees(
    value
      .split(/[,\n;]+/)
      .map(part => part.trim())
      .filter(Boolean),
  );

const extractInviteesFromBody = (content: string) => {
  const emailMatches = Array.from(
    content.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi),
  ).map(match => match[0]);

  return normalizeInvitees(emailMatches);
};

const splitWhenRange = (whenValue: string) => {
  const normalized = whenValue.replace(/\s+/g, ' ').trim();
  if (!normalized) return { start: '', end: '' };

  const separatorMatch = normalized.match(/^(.*?)(?:\s+to\s+|\s+-\s+)(.+)$/i);
  if (separatorMatch) {
    return {
      start: separatorMatch[1].trim(),
      end: separatorMatch[2].trim(),
    };
  }

  return { start: normalized, end: '' };
};

const parseEventDetailsFromPlainText = (content: string): EventDetails | null => {
  const normalized = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '');
  if (!normalized.trim()) return null;

  const whenText = readLabeledField(normalized, ['when', 'date', 'time']);
  const { start, end } = splitWhenRange(whenText);
  const organizer = readLabeledField(normalized, ['organizer']);
  const location = readLabeledField(normalized, ['location', 'where']);
  const summary = readLabeledField(normalized, ['subject', 'title', 'meeting']);
  const method = readLabeledField(normalized, ['rsvp', 'response']).toUpperCase();
  const description = readLabeledField(normalized, ['description', 'agenda', 'note']);

  const inviteeLine = readLabeledField(normalized, [
    'invitees',
    'attendees',
    'required attendees',
    'optional attendees',
  ]);
  let invitees = parseInviteesFromValue(inviteeLine);
  if (!invitees.length && normalized.includes('*~*~*~*~*~*~*~*')) {
    invitees = extractInviteesFromBody(normalized);
  }

  const hasEventFields = !!(
    summary ||
    start ||
    end ||
    organizer ||
    location ||
    invitees.length ||
    description ||
    method
  );

  return hasEventFields
    ? {
        summary,
        start,
        end,
        organizer,
        location,
        invitees,
        description,
        method,
      }
    : null;
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
  const organizer = parseOrganizerFromIcs(normalized);
  const invitees = parseInviteesFromIcs(normalized);
  const description = decodeIcsText(readIcsField(normalized, 'DESCRIPTION'));
  const method = decodeIcsText(readIcsField(normalized, 'METHOD')).toUpperCase();
  const start = parseIcsDate(readIcsField(normalized, 'DTSTART'));
  const end = parseIcsDate(readIcsField(normalized, 'DTEND'));

  const hasIcsEventFields = !!(
    summary ||
    location ||
    organizer ||
    start ||
    end ||
    method ||
    invitees.length ||
    description
  );
  if (hasIcsEventFields) {
    return {
      summary,
      start,
      end,
      location,
      organizer,
      invitees,
      description,
      method,
    };
  }

  return parseEventDetailsFromPlainText(normalized);
};

const extractEventDetailsFromMessage = (message?: MailMessage) => {
  if (!message) return null;
  const sources = [message.text || '', stripHtml(message.html || '')].filter(Boolean);
  for (const source of sources) {
    const parsed = parseEventDetailsFromText(source);
    if (parsed) return parsed;
  }
  return null;
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
  return hasBodyMarkers || hasCalendarAttachment(message) || !!extractEventDetailsFromMessage(message);
};

export const getEventDetails = (message?: MailMessage) => extractEventDetailsFromMessage(message);

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
