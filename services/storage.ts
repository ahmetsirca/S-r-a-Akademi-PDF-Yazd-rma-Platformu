
import { PDFBook, AccessKey, Collection } from '../types';
import { DB } from './db';

const STORAGE_KEYS = {
  KEYS: 'pdf_vault_keys',
  COLLECTIONS: 'pdf_vault_collections',
  ADMIN_PASS: 'pdf_vault_admin_pass'
};

export const StorageService = {
  // Collections (Keep in LocalStorage)
  getCollections: (): Collection[] => {
    const data = localStorage.getItem(STORAGE_KEYS.COLLECTIONS);
    return data ? JSON.parse(data) : [];
  },
  saveCollection: (name: string) => {
    const collections = StorageService.getCollections();
    const newCol: Collection = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify([...collections, newCol]));
    return newCol;
  },

  // Books (Move to IndexedDB)
  getBooks: async (): Promise<PDFBook[]> => {
    return await DB.getAllBooks();
  },
  getBookById: async (id: string): Promise<PDFBook | undefined> => {
    return await DB.getBook(id);
  },
  saveBook: async (book: Omit<PDFBook, 'id' | 'createdAt'>) => {
    const newBook: PDFBook = {
      ...book,
      id: crypto.randomUUID(),
      sourceType: book.sourceType || 'FILE', // Default to FILE for backward compatibility
      createdAt: Date.now()
    };
    await DB.addBook(newBook);
    return newBook;
  },
  deleteBook: async (id: string) => {
    await DB.deleteBook(id);
    // Also cleanup keys
    const keys = StorageService.getKeys().filter(k => k.bookId !== id);
    localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(keys));
  },

  // Keys (Keep in LocalStorage for fast lookup, but sync with async books logic in UI)
  getKeys: (): AccessKey[] => {
    const data = localStorage.getItem(STORAGE_KEYS.KEYS);
    return data ? JSON.parse(data) : [];
  },
  saveKey: (key: string, bookId: string, limit: number = 2) => {
    const keys = StorageService.getKeys();

    // Check if key already exists, if so, ensure unique or update? 
    // For now, allow multiple same keys or unique? Assume unique key string for login.
    // If key exists, do not duplicate, just update
    const existingIndex = keys.findIndex(k => k.key === key);
    if (existingIndex >= 0) {
      // Prevent duplicate keys globally for simplicity in login
      alert('Bu şifre zaten kullanımda!');
      throw new Error("Key exists");
    }

    const newKey: AccessKey = {
      id: crypto.randomUUID(),
      key,
      bookId,
      printLimit: limit,
      printCount: 0
    };
    localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify([...keys, newKey]));
    return newKey;
  },
  updateKeyCount: (keyId: string) => {
    const keys = StorageService.getKeys().map(k =>
      k.id === keyId ? { ...k, printCount: k.printCount + 1 } : k
    );
    localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(keys));
  },
  updateKeyPassword: (keyId: string, newPassword: string) => {
    const keys = StorageService.getKeys().map(k =>
      k.id === keyId ? { ...k, key: newPassword } : k
    );
    localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(keys));
  },

  // Admin
  getAdminPass: () => localStorage.getItem(STORAGE_KEYS.ADMIN_PASS) || 'Republic.1587',
  setAdminPass: (pass: string) => localStorage.setItem(STORAGE_KEYS.ADMIN_PASS, pass)
};
