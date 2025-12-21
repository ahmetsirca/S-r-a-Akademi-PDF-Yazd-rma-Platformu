
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
  keyCode: string;
  note?: string;
  expiresAt: number | null; // Timestamp or null
  createdAt: number;
}

export type ViewState = 'USER_LOGIN' | 'USER_VIEWER' | 'ADMIN_LOGIN' | 'ADMIN_DASHBOARD' | 'USER_FOLDER_VIEW';
