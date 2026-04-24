import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppSelector } from '../store/hooks';
import type { MainStackParamList } from '../navigation/types';
import { fetchMailFolders } from '../SOAP/mailApi';
import type { FolderItem } from '../SOAP/types';
import {
  COLORS,
  EmptyStateMessage,
  ErrorState,
  LoadingState,
  sharedStyles,
} from './shared';

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

const MailFolders: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const authToken = useAppSelector(state => state.auth.authToken);
  const [localFolders, setLocalFolders] = useState<FolderItem[]>([]);
  const [sharedFolders, setSharedFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { localFolders: local, sharedFolders: shared } =
        await fetchMailFolders(authToken);
      setLocalFolders(local);
      setSharedFolders(shared);
    } catch (err: any) {
      setError(err?.message || 'Unable to fetch folder metadata');
      setLocalFolders([]);
      setSharedFolders([]);
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
    <View style={[sharedStyles.screen, styles.container]}>
      {loading ? (
        <LoadingState
          message="Loading folder metadata..."
          spinnerColor={COLORS.primaryBlue}
        />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={loadFolders}
          retryLabel="Retry"
          accentColor={COLORS.primaryBlue}
        />
      ) : (
        <ScrollView
          contentContainerStyle={
            localFolders.length || sharedFolders.length
              ? [sharedStyles.list, styles.list]
              : sharedStyles.emptyList
          }
        >
          <Text style={styles.sectionTitle}>Folders ({localFolders.length})</Text>
          {localFolders.length === 0 ? (
            <EmptyStateMessage message="No normal folders returned by API." />
          ) : (
            <View style={[sharedStyles.card, styles.sectionWrap]}>
              {localFolders.map((item, index) => renderFolderRow(item, false, index))}
            </View>
          )}

          <Text style={[styles.sectionTitle, styles.bottomSectionTitle]}>
            Folders Shared with Me ({sharedFolders.length})
          </Text>
          {sharedFolders.length === 0 ? (
            <EmptyStateMessage message="No shared folders returned by API." />
          ) : (
            <View style={[sharedStyles.card, styles.sectionWrap]}>
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
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  list: {
    paddingBottom: 4,
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
  sectionWrap: {
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
