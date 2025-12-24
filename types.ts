
export interface PDFBook {
  id: string;
  name: string;
  collectionId: string;
  pdfData?: string; // Base64 for files
  sourceUrl?: string; // URL for links
  sourceType: 'FILE' | 'LINK';
  createdAt: number;
}

export interface AccessKey {
  id: string;
  key: string;
  bookId: string;
  printLimit: number;
  printCount: number;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

// -- NEW TYPES FOR COURSES/FOLDERS --
export interface Folder {
  id: string;
  parentId: string | null;
  title: string;
  isActive: boolean;
  createdAt: number;
}

export interface FolderContent {
  id: string;
  folderId: string;
  type: 'pdf' | 'link';
  title: string;
  url: string;
  createdAt: number;
}

export interface FolderKey {
  id: string;
  folderIds: string[]; // Array of UUIDs
  allowedFileIds?: string[]; // New: Specific files
  keyCode: string;
  note?: string;
  allowPrint: boolean;
  expiresAt: number | null; // Timestamp or null
  createdAt: number;
}

// -- NEW TYPES FOR AUTH & USER MANAGEMENT --
export interface UserProfile {
  id: string; // matches auth.users.id
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeen: string | null; // ISO Date string
}

export interface UserPermission {
  id: string;
  userId: string;
  folderIds: string[]; // List of folder UUIDs user can access
  allowedFileIds: string[]; // List of file UUIDs
  canPrint: boolean;
  printLimits?: Record<string, number>; // Map fileId -> remaining print count
  expiresAt: string | null; // ISO Date string
}

export interface ActivityLog {
  id: string;
  userId: string | null;
  userEmail?: string; // Joined field for display
  actionType: 'LOGIN' | 'LOGOUT' | 'VIEW_FILE' | 'PRINT_FILE' | 'FOLDER_ACCESS';
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

export type ViewState = 'USER_LOGIN' | 'USER_VIEWER' | 'ADMIN_LOGIN' | 'ADMIN_DASHBOARD' | 'USER_FOLDER_VIEW';

export interface UserVocab {
  id: string;
  userId: string;
  wordEn: string;
  wordTr: string;
  createdAt: string;
}


