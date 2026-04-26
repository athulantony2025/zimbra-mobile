import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { logout } from '../store/authSlice';
import { useAppSelector } from '../store/hooks';
import store from '../store/store';
import type { MainStackParamList } from '../navigation/types';
import { DEFAULT_SEARCH_LIMIT, fetchMailListData } from '../SOAP/mailApi';
import type { MailListItem as InboxItem, MailTag } from '../SOAP/types';
import {
  ActionButton,
  COLORS,
  EmptyStateMessage,
  ErrorState,
  LoadingState,
  sharedStyles,
} from './shared';
const LIMIT = DEFAULT_SEARCH_LIMIT;
// Zimbra tag color index mapping (fallback when `rgb` is not provided).
const COLOR_BY_INDEX: Record<number, string> = {
  0: '#9ca3af', // none/default
  1: '#3b82f6', // blue
  2: '#06b6d4', // cyan
  3: '#22c55e', // green
  4: '#a855f7', // purple
  5: '#ef4444', // red
  6: '#f59e0b', // yellow
  7: '#ec4899', // pink
  8: '#9ca3af', // gray
  9: '#f97316', // orange
};

const getSender = (item: InboxItem) =>
  item.e?.find(entry => entry?.t === 'f')?.p ||
  item.e?.find(entry => entry?.t === 'f')?.a ||
  'Unknown sender';

const isUnread = (item: InboxItem) =>
  typeof item.f === 'string' ? item.f.includes('u') : false;

const parseTagNames = (value?: string) => {
  const source = String(value || '');
  if (!source.trim()) return [] as string[];

  const tags: string[] = [];
  let current = '';
  let escaped = false;

  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === ',') {
      const normalized = current.trim();
      if (normalized) tags.push(normalized);
      current = '';
      continue;
    }
    current += char;
  }

  const tail = current.trim();
  if (tail) tags.push(tail);
  return tags;
};

const isHexColor = (value: string) => /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value);

const normalizeHexColor = (value: string) => {
  if (value.length === 7) return value;
  return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
};

const getTagBackgroundColor = (tag: MailTag) => {
  const rgb = String(tag.rgb || '').trim();
  if (isHexColor(rgb)) return normalizeHexColor(rgb);
  return COLOR_BY_INDEX[tag.color] || '#9ca3af';
};

const getMailTagNames = (item: InboxItem) => {
  if (typeof item.tagNames === 'string') return item.tagNames;
  if (typeof item.tn === 'string') return item.tn;
  return '';
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
  const mailTags = useAppSelector(state => state.auth.mailTags);
  const [emails, setEmails] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tagsByName = useMemo(() => {
    const map: Record<string, MailTag> = {};
    mailTags.forEach(tag => {
      const key = tag.name.trim().toLowerCase();
      if (key) map[key] = tag;
    });
    return map;
  }, [mailTags]);

  const loadInbox = async () => {
    setLoading(true);
    setError(null);

    try {
      const { items } = await fetchMailListData(authToken, folderId, LIMIT);
      setEmails(items);
    } catch (err: any) {
      setError(err?.message || 'Unable to fetch inbox emails');
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
    const timestamp = Number(item.d);
    const date = Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleString()
      : '';
    const tags = parseTagNames(getMailTagNames(item))
      .map(name => tagsByName[name.toLowerCase()])
      .filter((tag): tag is MailTag => !!tag);

    return (
      <TouchableOpacity
        style={[sharedStyles.card, styles.emailCard]}
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
        {tags.length > 0 && (
          <View style={styles.tagRow}>
            {tags.map(tag => {
              const backgroundColor = getTagBackgroundColor(tag);
              return (
                <View
                  key={`${item.id ?? subject}-${tag.id}-${tag.name}`}
                  style={[styles.tagPill, { backgroundColor }]}
                >
                  <Text
                    style={styles.tagText}
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
    <View style={[sharedStyles.screen, styles.container]}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>
            {folderName} ({itemCount ?? emails.length})
          </Text>
          {typeof unreadCount === 'number' && (
            <Text style={styles.unreadMeta}>Unread: {unreadCount}</Text>
          )}
        </View>
        <ActionButton
          label="Logout"
          onPress={handleLogout}
          backgroundColor={COLORS.destructive}
          style={styles.logoutButton}
          labelStyle={styles.logoutButtonText}
        />
      </View>

      {loading ? (
        <LoadingState message="Loading emails..." spinnerColor={COLORS.infoBlue} />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={loadInbox}
          retryLabel="Retry"
          accentColor={COLORS.infoBlue}
        />
      ) : (
        <FlatList
          data={emails}
          keyExtractor={(item, index) => String(item.id ?? index)}
          renderItem={renderItem}
          contentContainerStyle={
            emails.length === 0 ? sharedStyles.emptyList : sharedStyles.list
          }
          ListEmptyComponent={
            <EmptyStateMessage message={`No emails found in ${folderName}.`} />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#f5f5f5' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleWrap: { flex: 1, paddingRight: 12 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  unreadMeta: { fontSize: 13, color: '#475569', marginTop: 2 },
  logoutButton: {
    paddingHorizontal: 14,
  },
  logoutButtonText: { fontSize: 16, fontWeight: 'bold' },
  emailCard: {
    padding: 14,
    marginBottom: 10,
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
  tagPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.18)',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  date: { fontSize: 12, color: '#6b7280' },
});

export default MailList;
