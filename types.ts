
export interface PDFBook {
  id: string;
  name: string;
  collectionId: string;
  pdfData: string; // Base64 or Blob URL
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

export type ViewState = 'USER_LOGIN' | 'USER_VIEWER' | 'ADMIN_LOGIN' | 'ADMIN_DASHBOARD';
