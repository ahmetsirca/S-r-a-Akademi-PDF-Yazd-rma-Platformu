
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


  // Admin Pass
  getAdminPass: () => localStorage.getItem('pdf_vault_admin_pass') || 'Republic.1587',
  setAdminPass: (pass: string) => localStorage.setItem('pdf_vault_admin_pass', pass),

  // -- FOLDERS SYSTEM --
  getFolders: async (): Promise<import('../types').Folder[]> => {
    const { data } = await supabase.from('folders').select('*').order('created_at', { ascending: false });
    return (data || []).map((f: any) => ({
      id: f.id,
      parentId: f.parent_id,
      title: f.title,
      isActive: f.is_active,
      createdAt: new Date(f.created_at).getTime()
    }));
  },

  createFolder: async (title: string, parentId: string | null = null) => {
    const { data, error } = await supabase.from('folders').insert({
      title,
      parent_id: parentId // Handle nested folder creation
    }).select().single();
    if (error) throw error;
    return data;
  },

  deleteFolder: async (id: string) => {
    await supabase.from('folders').delete().eq('id', id);
  },

  // Folder Content
  getFolderContent: async (folderId: string): Promise<import('../types').FolderContent[]> => {
    const { data } = await supabase.from('folder_content').select('*').eq('folder_id', folderId);
    return (data || []).map((c: any) => ({
      id: c.id,
      folderId: c.folder_id,
      type: c.type,
      title: c.title,
      url: c.url,
      createdAt: new Date(c.created_at).getTime()
    }));
  },

  addFolderItem: async (folderId: string, type: 'pdf' | 'link', title: string, fileDataOrUrl: string) => {
    let finalUrl = fileDataOrUrl;

    if (type === 'pdf' && fileDataOrUrl.startsWith('data:')) {
      // Upload PDF
      const base64Response = await fetch(fileDataOrUrl);
      const blob = await base64Response.blob();
      const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `folder_content/${Date.now()}_${safeName}.pdf`;

      const { error: uploadError } = await supabase.storage.from('sirca-pdfs').upload(fileName, blob);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('sirca-pdfs').getPublicUrl(fileName);
      finalUrl = publicUrl;
    }

    const { error } = await supabase.from('folder_content').insert({
      folder_id: folderId,
      type,
      title,
      url: finalUrl
    });
    if (error) throw error;
  },

  deleteFolderItem: async (id: string) => {
    await supabase.from('folder_content').delete().eq('id', id);
  },

  // Folder Keys
  getFolderKeys: async (): Promise<import('../types').FolderKey[]> => {
    // Fetch ALL keys, filtering will happen in UI or we can add args if needed
    const { data } = await supabase.from('folder_keys').select('*').order('created_at', { ascending: false });
    return (data || []).map((k: any) => ({
      id: k.id,
      folderIds: k.folder_ids || [], // Handle array
      keyCode: k.key_code,
      note: k.note,
      allowPrint: k.allow_print,
      expiresAt: k.expires_at ? new Date(k.expires_at).getTime() : null,
      createdAt: new Date(k.created_at).getTime()
    }));
  },

  createFolderKey: async (folderIds: string[], keyCode: string, note: string, expiresAt: Date | null, allowPrint: boolean) => {
    const { error } = await supabase.from('folder_keys').insert({
      folder_ids: folderIds,
      key_code: keyCode,
      note,
      allow_print: allowPrint,
      expires_at: expiresAt ? expiresAt.toISOString() : null
    });
    if (error) throw error;
  },

  deleteFolderKey: async (keyId: string) => {
    await supabase.from('folder_keys').delete().eq('id', keyId);
  },

  // Verify Folder Key - Returns the Key object if valid, null otherwise
  verifyFolderKey: async (folderId: string, keyCode: string): Promise<import('../types').FolderKey | null> => {
    // 1. Find key
    const { data: keyData } = await supabase.from('folder_keys')
      .select('*')
      .eq('key_code', keyCode)
      .maybeSingle();

    if (!keyData) return null;

    // 2. Check if key includes this folder
    const folderIds: string[] = keyData.folder_ids || [];
    if (!folderIds.includes(folderId)) return null;

    // 3. Check expiration
    if (keyData.expires_at) {
      const expiry = new Date(keyData.expires_at).getTime();
      if (Date.now() > expiry) return null; // Expired
    }

    return {
      id: keyData.id,
      folderIds: keyData.folder_ids,
      keyCode: keyData.key_code,
      note: keyData.note,
      allowPrint: keyData.allow_print,
      expiresAt: keyData.expires_at ? new Date(keyData.expires_at).getTime() : null,
      createdAt: new Date(keyData.created_at).getTime()
    };
  }
};
