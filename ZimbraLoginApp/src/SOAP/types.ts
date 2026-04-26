/**
 * Shared Mail SOAP types.
 * Keep all mail-related types here so API/service files stay focused on logic.
 */

/** Normalized folder shape consumed by `MailFolders.tsx`. */
export type FolderItem = {
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

/**
 * Mail row shape consumed by `MailList.tsx`.
 * It supports both conversation (`c`) and message (`m`) SOAP results.
 */
export type MailListItem = {
  id?: string | number;
  su?: string;
  d?: string | number;
  f?: string;
  tagNames?: string;
  tn?: string;
  e?: Array<{ t?: string; a?: string; p?: string }>;
  _viewType?: 'message' | 'conversation';
};

/** Normalized tag shape consumed by `MailList.tsx` and Redux. */
export type MailTag = {
  id: string;
  name: string;
  color: number;
  rgb: string;
  unread: number;
};

/** Response shape returned by `fetchMailFolders`. */
export type MailFoldersResult = {
  localFolders: FolderItem[];
  sharedFolders: FolderItem[];
};

/** Response shape returned by `fetchMailListData`. */
export type MailListDataResult = {
  items: MailListItem[];
};

/** Response shape returned by `fetchMailTags`. */
export type MailTagsResult = {
  tags: MailTag[];
};
