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
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
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
  e?: Array<{ t?: string; a?: string; p?: string }>;
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

const MailList = () => {
  const route = useRoute<RouteProp<MainStackParamList, 'MailList'>>();
  const folderId = route.params?.folderId ?? '2';
  const folderName = route.params?.folderName ?? 'Inbox';
  const authToken = useAppSelector(state => state.auth.authToken);
  const [emails, setEmails] = useState<InboxItem[]>([]);
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
            types: 'message',
            limit: LIMIT,
            offset: 0,
            sortBy: 'dateDesc',
          },
        },
      };

      const response = await fetch(`${BASE_URL}/service/soap/SearchRequest`, {
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
      const items = Array.isArray(searchResponse?.m)
        ? searchResponse.m
        : searchResponse?.m
        ? [searchResponse.m]
        : [];

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
    const from =
      item.e?.find(entry => entry?.t === 'f')?.p ||
      item.e?.find(entry => entry?.t === 'f')?.a ||
      'Unknown sender';
    const subject = item.su || '(No subject)';
    const timestamp = Number(item.d);
    const date = Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleString()
      : '';

    return (
      <View style={styles.emailCard}>
        <Text style={styles.subject} numberOfLines={1}>
          {subject}
        </Text>
        <Text style={styles.sender} numberOfLines={1}>
          From: {from}
        </Text>
        {!!date && <Text style={styles.date}>{date}</Text>}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          {folderName} ({emails.length})
        </Text>
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
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },
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
