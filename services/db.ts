
import { PDFBook } from '../types';

const DB_NAME = 'SircaAkademiDB';
const DB_VERSION = 1;
const STORE_BOOKS = 'books';

export const DB = {
  open: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => reject('Database error: ' + (event.target as any).errorCode);

      request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        }
      };
    });
  },

  addBook: async (book: PDFBook): Promise<void> => {
    const db = await DB.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_BOOKS], 'readwrite');
        const store = transaction.objectStore(STORE_BOOKS);
        const request = store.add(book);

        request.onsuccess = () => resolve();
        request.onerror = () => reject('Error adding book');
    });
  },

  getAllBooks: async (): Promise<PDFBook[]> => {
    const db = await DB.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_BOOKS], 'readonly');
        const store = transaction.objectStore(STORE_BOOKS);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject('Error getting books');
    });
  },

  getBook: async (id: string): Promise<PDFBook | undefined> => {
    const db = await DB.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_BOOKS], 'readonly');
        const store = transaction.objectStore(STORE_BOOKS);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject('Error getting book');
    });
  },

  deleteBook: async (id: string): Promise<void> => {
    const db = await DB.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_BOOKS], 'readwrite');
        const store = transaction.objectStore(STORE_BOOKS);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject('Error deleting book');
    });
  }
};
