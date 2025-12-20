
import { supabase } from './supabase';
import { PDFBook, AccessKey, Collection } from '../types';

export const StorageService = {
  // Collections
  getCollections: async (): Promise<Collection[]> => {
    const { data } = await supabase.from('collections').select('*');
    return data || [];
  },

  saveCollection: async (name: string): Promise<Collection> => {
    const { data, error } = await supabase.from('collections').insert({ name }).select().single();
    if (error) throw error;
    return data;
  },

  deleteCollection: async (id: string) => {
    await supabase.from('collections').delete().eq('id', id);
  },

  // Books
  getBooks: async (): Promise<PDFBook[]> => {
    const { data } = await supabase.from('pdf_books').select('*');
    return (data || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      collectionId: b.collection_id,
      sourceType: b.source_type,
      // Map file_path to pdfData so existing UI works without change
      pdfData: b.file_path,
      sourceUrl: b.file_path,
      createdAt: new Date(b.created_at).getTime()
    }));
  },

  saveBook: async (book: Omit<PDFBook, 'id' | 'createdAt'>) => {
    let filePath = book.sourceUrl || '';

    // If it's a FILE upload (Base64 data coming from UI)
    if (book.sourceType === 'FILE' && book.pdfData && book.pdfData.startsWith('data:')) {
      const base64Response = await fetch(book.pdfData);
      const blob = await base64Response.blob();

      // Sanitized filename
      const safeName = book.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `${Date.now()}_${safeName}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('sirca-pdfs')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('sirca-pdfs')
        .getPublicUrl(fileName);

      filePath = publicUrl;
    }

    const { data, error } = await supabase.from('pdf_books').insert({
      name: book.name,
      collection_id: book.collectionId,
      source_type: book.sourceType,
      file_path: filePath
    }).select().single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      collectionId: data.collection_id,
      sourceType: data.source_type,
      pdfData: data.file_path,
      createdAt: new Date(data.created_at).getTime()
    };
  },

  deleteBook: async (id: string) => {
    // Delete keys first to avoid Foreign Key constraint error (since we didn't use CASCADE in SQL)
    await supabase.from('access_keys').delete().eq('book_id', id);
    await supabase.from('pdf_books').delete().eq('id', id);
  },

  // Keys
  getKeys: async (): Promise<AccessKey[]> => {
    const { data } = await supabase.from('access_keys').select('*');
    return (data || []).map((k: any) => ({
      id: k.id,
      key: k.key_code,
      bookId: k.book_id,
      printLimit: k.print_limit,
      printCount: k.print_count
    }));
  },

  // Specialized method for login to avoid fetching all keys
  verifyKey: async (password: string): Promise<AccessKey | null> => {
    const { data, error } = await supabase
      .from('access_keys')
      .select('*')
      .eq('key_code', password)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      key: data.key_code,
      bookId: data.book_id,
      printLimit: data.print_limit,
      printCount: data.print_count
    };
  },

  saveKey: async (key: string, bookId: string, limit: number = 2) => {
    // Check if key exists
    const { data: existing } = await supabase.from('access_keys').select('id').eq('key_code', key).maybeSingle();
    if (existing) {
      alert('Bu şifre zaten kullanımda! Lütfen başka bir şifre deneyin.');
      throw new Error("Key exists");
    }

    const { data, error } = await supabase.from('access_keys').insert({
      key_code: key,
      book_id: bookId,
      print_limit: limit,
      print_count: 0
    }).select().single();

    if (error) throw error;

    return {
      id: data.id,
      key: data.key_code,
      bookId: data.book_id,
      printLimit: data.print_limit,
      printCount: data.print_count
    };
  },

  updateKeyCount: async (keyId: string) => {
    // Read first to inc
    const { data } = await supabase.from('access_keys').select('print_count').eq('id', keyId).single();
    if (data) {
      await supabase.from('access_keys').update({ print_count: data.print_count + 1 }).eq('id', keyId);
    }
  },

  updateKeyPassword: async (keyId: string, newPassword: string) => {
    const { error } = await supabase.from('access_keys').update({ key_code: newPassword }).eq('id', keyId);
    if (error) throw error;
  },

  // Admin Pass (LocalStorage is fine for now)
  getAdminPass: () => localStorage.getItem('pdf_vault_admin_pass') || 'Republic.1587',
  setAdminPass: (pass: string) => localStorage.setItem('pdf_vault_admin_pass', pass)
};
