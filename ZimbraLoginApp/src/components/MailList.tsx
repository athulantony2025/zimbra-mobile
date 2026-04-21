import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { logout } from '../store/authSlice';
import { useAppSelector } from '../store/hooks';
import store from '../store/store';
import type { MainStackParamList } from '../navigation/types';

const BASE_URL = 'https://apps-development.zimbradev.com';
const LIMIT = 10000;

type InboxItem = {
  id?: string | number;
  su?: string;
  d?: string | number;
  f?: string;
  t?: string | number | Array<string | number>;
  tn?: string | string[];
  e?: Array<{ t?: string; a?: string; p?: string }>;
  _viewType?: 'message' | 'conversation';
};

type TagMeta = {
  name: string;
  color?: string | number;
};

const DEFAULT_TAG_COLOR = '#f59e0b';
const TAG_COLOR_MAP: Record<number, string> = {
  0: '#94a3b8',
  1: '#f59e0b',
  2: '#ef4444',
  3: '#22c55e',
  4: '#0ea5e9',
  5: '#a855f7',
  6: '#ec4899',
  7: '#14b8a6',
};

const getToken = (raw: unknown) => {
  if (typeof raw === 'string') return raw.replace(/^Bearer\s+/i, '').trim();
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as any)._content === 'string'
  )
    return (raw as any)._content.trim();
  return '';
};

const getSender = (item: InboxItem) =>
  item.e?.find(entry => entry?.t === 'f')?.p ||
  item.e?.find(entry => entry?.t === 'f')?.a ||
  'Unknown sender';

const isUnread = (item: InboxItem) =>
  typeof item.f === 'string' ? item.f.includes('u') : false;

const toArray = <T,>(value?: T | T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const splitCsvValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .flatMap(entry => String(entry ?? '').split(','))
      .map(entry => entry.trim())
      .filter(Boolean);
  }
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
};

const normalizeHexColor = (value: string) => {
  const trimmed = value.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return '';
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
};

const decimalToHexColor = (value: number) => {
  const clamped = Math.max(0, Math.min(0xffffff, Math.trunc(value)));
  return `#${clamped.toString(16).padStart(6, '0')}`;
};

const toTagColor = (value?: string | number) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 7) return TAG_COLOR_MAP[value] || DEFAULT_TAG_COLOR;
    if (value > 7) return decimalToHexColor(value);
    return DEFAULT_TAG_COLOR;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const normalizedHex = normalizeHexColor(trimmed);
    if (normalizedHex) return normalizedHex;

    if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed.toLowerCase()}`;
    if (/^0x[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed.slice(2).toLowerCase()}`;
    if (/^rgba?\(/i.test(trimmed)) return trimmed;

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      if (numeric >= 0 && numeric <= 7) {
        return TAG_COLOR_MAP[numeric] || DEFAULT_TAG_COLOR;
      }
      if (numeric > 7) return decimalToHexColor(numeric);
    }
  }

  return DEFAULT_TAG_COLOR;
};

const getTagTextColor = (backgroundColor: string) => {
  const hex = normalizeHexColor(backgroundColor);
  if (!hex) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 145 ? '#111827' : '#ffffff';
};

const flattenRawTags = (input: unknown): Array<Record<string, unknown>> => {
  const queue: unknown[] = toArray(input as unknown);
  const flattened: Array<Record<string, unknown>> = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    const tagEntry = current as Record<string, unknown>;
    flattened.push(tagEntry);
    queue.push(...toArray(tagEntry.tag as unknown));
    queue.push(...toArray(tagEntry.tags as unknown));
  }

  return flattened;
};

const buildTagMap = (tagResponse: any): Record<string, TagMeta> => {
  const rawTags = flattenRawTags(tagResponse?.tag ?? tagResponse?.tags);
  return rawTags.reduce<Record<string, TagMeta>>((acc, rawTag) => {
    const id = String(rawTag.id ?? '').trim();
    const name = String(rawTag.name ?? rawTag.n ?? '').trim();
    if (!id || !name) return acc;
    acc[id] = {
      name,
      color:
        (rawTag.rgb as string | number | undefined) ??
        (rawTag.rgbColor as string | number | undefined) ??
        (rawTag.color as string | number | undefined) ??
        (rawTag.c as string | number | undefined),
    };
    return acc;
  }, {});
};

const getItemTags = (item: InboxItem, tagMap: Record<string, TagMeta>) => {
  const tagIds = splitCsvValues(item.t);
  if (tagIds.length) {
    return tagIds.map(tagId => {
      const tagMeta = tagMap[tagId];
      return {
        id: tagId,
        name: tagMeta?.name || tagId,
        color: tagMeta?.color,
      };
    });
  }

  const fallbackNames = splitCsvValues(item.tn);
  return fallbackNames.map((name, index) => ({
    id: `name-${index}-${name}`,
    name,
    color: undefined,
  }));
};

const MailList = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'MailList'>>();
  const folderId = route.params?.folderId ?? '2';
  const folderName = route.params?.folderName ?? 'Inbox';
  const unreadCount = route.params?.unreadCount;
  const itemCount = route.params?.itemCount;
  const authToken = useAppSelector(state => state.auth.authToken);
  const [emails, setEmails] = useState<InboxItem[]>([]);
  const [tagMap, setTagMap] = useState<Record<string, TagMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = async () => {
    const token = getToken(authToken);
    if (!token) {
      setError('Missing auth token. Please login again.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        Header: {
          context: {
            _jsns: 'urn:zimbra',
            authToken: token,
          },
        },
        Body: {
          SearchRequest: {
            _jsns: 'urn:zimbraMail',
            query: `inid:${folderId}`,
            types: 'conversation',
            limit: LIMIT,
            offset: 0,
            sortBy: 'dateDesc',
            fullConversation: true,
            needExp: true,
          },
        },
      };

      const tagPayload = {
        Header: {
          context: {
            _jsns: 'urn:zimbra',
            authToken: token,
          },
        },
        Body: {
          GetTagRequest: {
            _jsns: 'urn:zimbraMail',
          },
        },
      };

      const [response, tagResponse] = await Promise.all([
        fetch(`${BASE_URL}/service/soap/SearchRequest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            Cookie: `ZM_AUTH_TOKEN=${token};`,
          },
          body: JSON.stringify(payload),
        }),
        fetch(`${BASE_URL}/service/soap/GetTagRequest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            Cookie: `ZM_AUTH_TOKEN=${token};`,
          },
          body: JSON.stringify(tagPayload),
        }),
      ]);

      const [data, rawTagData] = await Promise.all([
        response.json(),
        tagResponse.json().catch(() => null),
      ]);
      const body = Array.isArray(data?.Body) ? data.Body[0] : data?.Body;
      const fault = Array.isArray(body?.Fault) ? body.Fault[0] : body?.Fault;

      if (!response.ok || fault) {
        const reason = Array.isArray(fault?.Reason)
          ? fault.Reason?.[0]?.Text
          : fault?.Reason?.Text;
        throw new Error(reason || `Inbox fetch failed (${response.status})`);
      }

      const searchResponse = Array.isArray(body?.SearchResponse)
        ? body.SearchResponse[0]
        : body?.SearchResponse;
      const conversationItems = toArray(searchResponse?.c).map(item => ({
        ...item,
        _viewType: 'conversation' as const,
      }));
      const messageItems = toArray(searchResponse?.m).map(item => ({
        ...item,
        _viewType: 'message' as const,
      }));
      const items = (conversationItems.length ? conversationItems : messageItems).sort(
        (a, b) => Number(b?.d ?? 0) - Number(a?.d ?? 0),
      );

      const tagBody = rawTagData
        ? Array.isArray(rawTagData?.Body)
          ? rawTagData.Body[0]
          : rawTagData?.Body
        : null;
      const tagFault = Array.isArray(tagBody?.Fault) ? tagBody.Fault[0] : tagBody?.Fault;
      const getTagResponse =
        !tagResponse.ok || tagFault
          ? null
          : Array.isArray(tagBody?.GetTagResponse)
            ? tagBody.GetTagResponse[0]
            : tagBody?.GetTagResponse;

      setEmails(items);
      setTagMap(getTagResponse ? buildTagMap(getTagResponse) : {});
    } catch (err: any) {
      setError(err?.message || 'Unable to fetch inbox emails');
      setTagMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, [authToken, folderId]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => store.dispatch(logout()),
      },
    ]);
  };

  const renderItem = ({ item }: { item: InboxItem }) => {
    const from = getSender(item);
    const subject = item.su || '(No subject)';
    const itemTags = getItemTags(item, tagMap);
    const timestamp = Number(item.d);
    const date = Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleString()
      : '';

    return (
      <TouchableOpacity
        style={styles.emailCard}
        activeOpacity={0.75}
        onPress={() => {
          if (!item.id) return;
          navigation.navigate('ViewMail', {
            messageId: String(item.id),
            subject,
            sender: from,
            timestamp: item.d,
            viewType: item._viewType || 'message',
            unread: isUnread(item),
          });
        }}
      >
        <Text style={styles.subject} numberOfLines={1}>
          {subject}
        </Text>
        <Text style={styles.sender} numberOfLines={1}>
          From: {from}
        </Text>
        {itemTags.length > 0 && (
          <View style={styles.tagRow}>
            {itemTags.map(tag => {
              const backgroundColor = toTagColor(tag.color);
              return (
                <View
                  key={`${item.id ?? subject}-${tag.id}`}
                  style={[styles.tagChip, { backgroundColor }]}
                >
                  <Text
                    style={[styles.tagChipText, { color: getTagTextColor(backgroundColor) }]}
                    numberOfLines={1}
                  >
                    {tag.name}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        {!!date && <Text style={styles.date}>{date}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>
            {folderName} ({itemCount ?? emails.length})
          </Text>
          {typeof unreadCount === 'number' && (
            <Text style={styles.unreadMeta}>Unread: {unreadCount}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.subtitle}>Loading emails...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadInbox}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={emails}
          keyExtractor={(item, index) => String(item.id ?? index)}
          renderItem={renderItem}
          contentContainerStyle={
            emails.length === 0 ? styles.emptyList : styles.list
          }
          ListEmptyComponent={
            <Text style={styles.subtitle}>No emails found in {folderName}.</Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleWrap: { flex: 1, paddingRight: 12 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  unreadMeta: { fontSize: 13, color: '#475569', marginTop: 2 },
  subtitle: { fontSize: 16, textAlign: 'center', marginTop: 14, color: '#666' },
  logoutButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  list: { paddingBottom: 16 },
  emptyList: { flex: 1, justifyContent: 'center' },
  emailCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  subject: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  sender: { fontSize: 14, color: '#374151', marginBottom: 4 },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
    gap: 6,
  },
  tagChip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  date: { fontSize: 12, color: '#6b7280' },
  errorText: {
    color: '#cc0000',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 15,
  },
  retryButton: {
    backgroundColor: '#007bff',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  retryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default MailList;
