
import { PDFBook, AccessKey, Collection } from '../types';

const STORAGE_KEYS = {
  BOOKS: 'pdf_vault_books',
  KEYS: 'pdf_vault_keys',
  COLLECTIONS: 'pdf_vault_collections',
  ADMIN_PASS: 'pdf_vault_admin_pass'
};

export const StorageService = {
  // Collections
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

  // Books
  getBooks: (): PDFBook[] => {
    const data = localStorage.getItem(STORAGE_KEYS.BOOKS);
    return data ? JSON.parse(data) : [];
  },
  saveBook: (book: Omit<PDFBook, 'id' | 'createdAt'>) => {
    const books = StorageService.getBooks();
    const newBook: PDFBook = {
      ...book,
      id: crypto.randomUUID(),
      createdAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify([...books, newBook]));
    return newBook;
  },
  deleteBook: (id: string) => {
    const books = StorageService.getBooks().filter(b => b.id !== id);
    localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(books));
    // Also cleanup keys
    const keys = StorageService.getKeys().filter(k => k.bookId !== id);
    localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(keys));
  },

  // Keys
  getKeys: (): AccessKey[] => {
    const data = localStorage.getItem(STORAGE_KEYS.KEYS);
    return data ? JSON.parse(data) : [];
  },
  saveKey: (key: string, bookId: string, limit: number = 2) => {
    const keys = StorageService.getKeys();
    // Allow multiple keys per book or update existing
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
