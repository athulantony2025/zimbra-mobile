import { callSoapApi, getAuthToken } from './api';
import type {
  FolderItem,
  MailFoldersResult,
  MailListDataResult,
} from './types';

/**
 * Shared SOAP service for Mail screens.
 *
 * Keep UI components simple by using only:
 * - `fetchMailFolders(authToken)`
 * - `fetchMailListData(authToken, folderId, limit?)`
 */
export const DEFAULT_SEARCH_LIMIT = 10000;

// -----------------------------
// Small helpers
// -----------------------------

/** Ensures SOAP fields are always handled as arrays. */
const toList = <T,>(value?: T | T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

/** Converts unknown values to safe numbers. */
const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Normalizes and validates auth token before any SOAP call. */
const requireToken = (authToken: unknown) => {
  const token = getAuthToken(authToken);
  if (!token) throw new Error('Missing auth token. Please login again.');
  return token;
};

/** Maps raw folder SOAP object into UI-friendly `FolderItem`. */
const mapFolder = (raw: any): FolderItem => ({
  id: String(raw?.id ?? raw?.absFolderPath ?? raw?.path ?? raw?.name ?? 'folder'),
  name: raw?.name ?? 'Unnamed folder',
  absFolderPath: raw?.absFolderPath ?? raw?.path ?? '',
  parentFolderId: String(raw?.parentFolderId ?? raw?.l ?? ''),
  view: raw?.view ?? '',
  unread: toNumber(raw?.unread ?? raw?.u),
  nonFolderItemCount: toNumber(raw?.nonFolderItemCount ?? raw?.n),
  nonFolderItemCountTotal: toNumber(raw?.nonFolderItemCountTotal ?? raw?.s),
  unreadDescendent: toNumber(raw?.unreadDescendent),
});

/**
 * Loads folders for MailFolders screen.
 *
 * SOAP call: `GetFolderRequest`
 * @param authToken User/session token from auth store.
 * @returns Local folders + shared folders, both already normalized.
 */
const fetchMailFolders = async (
  authToken: unknown,
): Promise<MailFoldersResult> => {
  const token = requireToken(authToken);

  const response = await callSoapApi<any>({
    authToken: token,
    requestName: 'GetFolderRequest',
    bodyPayload: {
      view: 'message',
      depth: 1,
      tr: true,
    },
    contextPayload: {
      authTokenControl: {
        voidOnExpired: true,
      },
    },
    includeContextAuthToken: false,
    includeAuthorizationHeader: false,
  });

  const rootFolder = Array.isArray(response?.folder)
    ? response.folder[0]
    : response?.folder;

  const localFolders = toList(
    rootFolder?.folders ??
      rootFolder?.folder ??
      response?.folders ??
      response?.folder,
  ).map(mapFolder);

  const sharedFolders = toList(
    rootFolder?.linkedFolders ??
      rootFolder?.link ??
      response?.linkedFolders ??
      response?.link,
  ).map(mapFolder);

  return { localFolders, sharedFolders };
};

/**
 * Loads mail list data for MailList screen.
 *
 * SOAP call: `SearchRequest` for mail/conversation list.
 *
 * @param authToken User/session token from auth store.
 * @param folderId Mail folder ID (`inid:<folderId>` search query).
 * @param limit Max items requested from SearchRequest.
 * @returns Items (sorted newest first).
 */
const fetchMailListData = async (
  authToken: unknown,
  folderId: string,
  limit = DEFAULT_SEARCH_LIMIT,
): Promise<MailListDataResult> => {
  const token = requireToken(authToken);

  const searchResponse = await callSoapApi<any>({
    authToken: token,
    requestName: 'SearchRequest',
    bodyPayload: {
      query: `inid:${folderId}`,
      types: 'conversation',
      limit,
      offset: 0,
      sortBy: 'dateDesc',
      fullConversation: true,
      needExp: true,
    },
  });

  const conversationItems = toList(searchResponse?.c).map(item => ({
    ...item,
    _viewType: 'conversation' as const,
  }));

  const messageItems = toList(searchResponse?.m).map(item => ({
    ...item,
    _viewType: 'message' as const,
  }));

  const items = (conversationItems.length ? conversationItems : messageItems).sort(
    (a, b) => Number(b?.d ?? 0) - Number(a?.d ?? 0),
  );

  return { items };
};

// Public SOAP API methods (single export block for API calls).
export { fetchMailFolders, fetchMailListData };
