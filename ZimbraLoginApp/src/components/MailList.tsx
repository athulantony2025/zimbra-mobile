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
import type { MailListItem as InboxItem } from '../SOAP/types';
import {
  ActionButton,
  COLORS,
  EmptyStateMessage,
  ErrorState,
  LoadingState,
  sharedStyles,
} from './shared';
const LIMIT = DEFAULT_SEARCH_LIMIT;

const getSender = (item: InboxItem) =>
  item.e?.find(entry => entry?.t === 'f')?.p ||
  item.e?.find(entry => entry?.t === 'f')?.a ||
  'Unknown sender';

const isUnread = (item: InboxItem) =>
  typeof item.f === 'string' ? item.f.includes('u') : false;

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  date: { fontSize: 12, color: '#6b7280' },
});

export default MailList;
