import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppSelector } from '../store/hooks';
import type { MainStackParamList } from '../navigation/types';

const BASE_URL = 'https://apps-development.zimbradev.com';

type RawFolder = {
  id?: string | number;
  name?: string;
  absFolderPath?: string;
  path?: string;
  parentFolderId?: string | number;
  l?: string | number;
  view?: string;
  unread?: string | number;
  u?: string | number;
  unreadDescendent?: string | number;
  nonFolderItemCount?: string | number;
  n?: string | number;
  nonFolderItemCountTotal?: string | number;
  s?: string | number;
  folders?: RawFolder[] | RawFolder;
  folder?: RawFolder[] | RawFolder;
  linkedFolders?: RawFolder[] | RawFolder;
  link?: RawFolder[] | RawFolder;
};

type FolderItem = {
  id: string;
  name: string;
  absFolderPath: string;
  parentFolderId: string;
  view: string;
  unread: number;
  nonFolderItemCount: number;
  nonFolderItemCountTotal: number;
  unreadDescendent: number;
};

const getFolderBadge = (name: string, isShared: boolean) => {
  if (isShared) return 'SH';
  const key = name.trim().toLowerCase();
  if (key === 'inbox') return 'IN';
  if (key === 'drafts') return 'DR';
  if (key === 'sent') return 'SE';
  if (key === 'spam' || key === 'junk') return 'SP';
  if (key === 'trash') return 'TR';
  const compact = key.replace(/[^a-z0-9]/g, '');
  return (compact.slice(0, 2) || 'FD').toUpperCase();
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

const toArray = <T,>(value?: T | T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeFolder = (raw: RawFolder): FolderItem => ({
  id: String(raw.id ?? raw.absFolderPath ?? raw.path ?? raw.name ?? 'folder'),
  name: raw.name ?? 'Unnamed folder',
  absFolderPath: raw.absFolderPath ?? raw.path ?? '',
  parentFolderId: String(raw.parentFolderId ?? raw.l ?? ''),
  view: raw.view ?? '',
  unread: toNumber(raw.unread ?? raw.u),
  nonFolderItemCount: toNumber(raw.nonFolderItemCount ?? raw.n),
  nonFolderItemCountTotal: toNumber(raw.nonFolderItemCountTotal ?? raw.s),
  unreadDescendent: toNumber(raw.unreadDescendent),
});

const MailFolders: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const authToken = useAppSelector(state => state.auth.authToken);
  const [localFolders, setLocalFolders] = useState<FolderItem[]>([]);
  const [sharedFolders, setSharedFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    const token = getToken(authToken);
    if (!token) {
      setError('Missing auth token. Please login again.');
      setLocalFolders([]);
      setSharedFolders([]);
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
            authTokenControl: {
              voidOnExpired: true,
            },
          },
        },
        Body: {
          GetFolderRequest: {
            _jsns: 'urn:zimbraMail',
            view: 'message',
            depth: 1,
            tr: true,
          },
        },
      };

      const response = await fetch(`${BASE_URL}/service/soap/GetFolderRequest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Cookie: `ZM_AUTH_TOKEN=${token}`,
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
        throw new Error(reason || `GetFolderRequest failed (${response.status})`);
      }

      const getFolderResponse = Array.isArray(body?.GetFolderResponse)
        ? body.GetFolderResponse[0]
        : body?.GetFolderResponse;
      const rootFolder = Array.isArray(getFolderResponse?.folder)
        ? getFolderResponse.folder[0]
        : getFolderResponse?.folder;

      const localFolderItems = toArray(
        rootFolder?.folders ??
          rootFolder?.folder ??
          getFolderResponse?.folders ??
          getFolderResponse?.folder,
      ).map(normalizeFolder);

      const sharedFolderItems = toArray(
        rootFolder?.linkedFolders ??
          rootFolder?.link ??
          getFolderResponse?.linkedFolders ??
          getFolderResponse?.link,
      ).map(normalizeFolder);

      setLocalFolders(localFolderItems);
      setSharedFolders(sharedFolderItems);
    } catch (err: any) {
      setError(err?.message || 'Unable to fetch folder metadata');
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const renderFolderRow = (item: FolderItem, isShared: boolean, index: number) => (
    <TouchableOpacity
      style={[styles.row, index === 0 ? styles.rowFirst : null]}
      key={`${isShared ? 'shared' : 'local'}-${item.id}-${index}`}
      onPress={() =>
        navigation.navigate('MailList', {
          folderId: item.id,
          folderName: item.name,
          unreadCount: item.unread,
          itemCount: item.nonFolderItemCount,
        })
      }
      activeOpacity={0.7}
    >
      <View style={[styles.badge, isShared ? styles.badgeShared : null]}>
        <Text style={styles.badgeText}>{getFolderBadge(item.name, isShared)}</Text>
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <Text style={styles.rowMeta}>{item.absFolderPath || '-'}</Text>
      </View>
      <View style={styles.rowCounts}>
        <Text style={styles.countPill}>{item.unread}</Text>
        <Text style={styles.countText}>{item.nonFolderItemCount}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1f6feb" />
          <Text style={styles.subtitle}>Loading folder metadata...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFolders}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            localFolders.length || sharedFolders.length
              ? styles.list
              : styles.emptyList
          }
        >
          <Text style={styles.sectionTitle}>Folders ({localFolders.length})</Text>
          {localFolders.length === 0 ? (
            <Text style={styles.subtitle}>No normal folders returned by API.</Text>
          ) : (
            <View style={styles.sectionWrap}>
              {localFolders.map((item, index) => renderFolderRow(item, false, index))}
            </View>
          )}

          <Text style={[styles.sectionTitle, styles.bottomSectionTitle]}>
            Folders Shared with Me ({sharedFolders.length})
          </Text>
          {sharedFolders.length === 0 ? (
            <Text style={styles.subtitle}>No shared folders returned by API.</Text>
          ) : (
            <View style={styles.sectionWrap}>
              {sharedFolders.map((item, index) => renderFolderRow(item, true, index))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    marginTop: 12,
    textAlign: 'center',
  },
  errorText: {
    color: '#c62828',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 14,
  },
  retryButton: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  list: {
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2b2f34',
    marginBottom: 8,
  },
  bottomSectionTitle: {
    marginTop: 16,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionWrap: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    minHeight: 62,
    borderTopWidth: 1,
    borderTopColor: '#edf0f3',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#e6f2fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeShared: {
    backgroundColor: '#eef5ea',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#185b8a',
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    color: '#1b1f24',
    fontWeight: '600',
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  rowCounts: {
    alignItems: 'flex-end',
    minWidth: 54,
  },
  countPill: {
    minWidth: 26,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#0b6aa2',
    backgroundColor: '#dbeffd',
  },
  countText: {
    marginTop: 4,
    fontSize: 12,
    color: '#4b5563',
  },
});

export default MailFolders;
