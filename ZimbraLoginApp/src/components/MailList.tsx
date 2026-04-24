import React, { useEffect, useState } from 'react';
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
import type { MailListItem as InboxItem, TagMeta } from '../SOAP/types';
import {
  ActionButton,
  COLORS,
  EmptyStateMessage,
  ErrorState,
  LoadingState,
  decimalToHexColor,
  normalizeHexColor,
  sharedStyles,
  splitCsvValues,
} from './shared';
const LIMIT = DEFAULT_SEARCH_LIMIT;

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

const getSender = (item: InboxItem) =>
  item.e?.find(entry => entry?.t === 'f')?.p ||
  item.e?.find(entry => entry?.t === 'f')?.a ||
  'Unknown sender';

const isUnread = (item: InboxItem) =>
  typeof item.f === 'string' ? item.f.includes('u') : false;

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
    setLoading(true);
    setError(null);

    try {
      const { items, tagMap: tags } = await fetchMailListData(
        authToken,
        folderId,
        LIMIT,
      );
      setEmails(items);
      setTagMap(tags);
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
});

export default MailList;
