export type MainStackParamList = {
  MailFolders: undefined;
  MailList: {
    folderId: string;
    folderName?: string;
    unreadCount?: number;
    itemCount?: number;
  };
  ViewMail: {
    messageId: string;
    subject?: string;
    sender?: string;
    timestamp?: string | number;
    viewType?: 'message' | 'conversation';
    unread?: boolean;
    sendReadReceipt?: boolean;
  };
};
