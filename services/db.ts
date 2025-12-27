import { supabase } from './supabase';
import { UserProfile, UserPermission, ActivityLog } from '../types';

export const DBService = {
  // --- USERS ---
  async getAllUsers(): Promise<UserProfile[]> {
    const { data } = await supabase.from('profiles').select('*').order('last_seen', { ascending: false });
    return (data || []).map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      isOnline: u.is_online,
      lastSeen: u.last_seen
    }));
  },

  // --- PERMISSIONS ---
  async getUserPermissions(userId: string): Promise<UserPermission | null> {
    const { data } = await supabase.from('user_permissions').select('*').eq('user_id', userId).single();
    if (!data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      folderIds: data.folder_ids || [],
      allowedFileIds: data.allowed_file_ids || [], // NEW
      canPrint: data.can_print,
      printLimits: data.print_limits || {}, // NEW
      expiresAt: data.expires_at
    };
  },

  async updateUserPermission(userId: string, folderIds: string[], allowedFileIds: string[], canPrint: boolean, expiresAt: string | null, printLimits: Record<string, number> = {}) {
    const { data: existing } = await supabase.from('user_permissions').select('id').eq('user_id', userId).single();

    if (existing) {
      return await supabase.from('user_permissions').update({
        folder_ids: folderIds,
        allowed_file_ids: allowedFileIds,
        can_print: canPrint,
        print_limits: printLimits,
        expires_at: expiresAt
      }).eq('user_id', userId);
    } else {
      return await supabase.from('user_permissions').insert({
        user_id: userId,
        folder_ids: folderIds,
        allowed_file_ids: allowedFileIds,
        can_print: canPrint,
        print_limits: printLimits,
        expires_at: expiresAt
      });
    }
  },

  async decrementPrintLimit(userId: string, fileId: string) {
    const perms = await this.getUserPermissions(userId);
    if (!perms || !perms.printLimits) return;

    const currentLimit = perms.printLimits[fileId];
    if (typeof currentLimit === 'number' && currentLimit > 0) {
      const newLimits = { ...perms.printLimits, [fileId]: currentLimit - 1 };
      // Call update with NEW limits
      await this.updateUserPermission(perms.userId, perms.folderIds, perms.allowedFileIds, perms.canPrint, perms.expiresAt, newLimits);
    }
  },

  // --- VOCABULARY ---
  async getVocab(userId: string) {
    let { data, error } = await supabase.from('user_vocab').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return (data || []).map(item => ({
      id: item.id,
      userId: item.user_id,
      wordEn: item.word_en,
      wordTr: item.word_tr,
      createdAt: item.created_at
    }));
  },

  async addVocab(userId: string, en: string, tr: string) {
    let { data, error } = await supabase.from('user_vocab').insert({ user_id: userId, word_en: en, word_tr: tr }).select().single();
    let mappedData = null;
    if (data) {
      mappedData = {
        id: data.id,
        userId: data.user_id,
        wordEn: data.word_en,
        wordTr: data.word_tr,
        createdAt: data.created_at
      };
    }
    return { data: mappedData, error };
  },

  deleteVocab(vocabId: string) {
    return supabase.from('user_vocab').delete().eq('id', vocabId);
  },

  // --- NEW VOCABULARY NOTEBOOKS ---
  async getNotebooks(userId: string) {
    const { data, error } = await supabase.from('vocab_notebooks').select('*').eq('user_id', userId).order('created_at', { ascending: true });
    if (error) { console.error(error); return []; }
    return data.map((n: any) => ({ ...n, parentId: n.parent_id, userId: n.user_id, createdAt: n.created_at }));
  },

  async createNotebook(userId: string, title: string, parentId: string | null = null) {
    const { data, error } = await supabase.from('vocab_notebooks').insert({ user_id: userId, title, parent_id: parentId }).select().single();
    if (error) {
      console.error("DB Create Notebook Error:", error);
    }
    if (data) return { ...data, parentId: data.parent_id, userId: data.user_id, createdAt: data.created_at };
    return null;
  },

  async updateNotebook(id: string, title: string) {
    return await supabase.from('vocab_notebooks').update({ title }).eq('id', id);
  },

  async deleteNotebook(id: string) {
    return await supabase.from('vocab_notebooks').delete().eq('id', id);
  },

  // --- NEW VOCABULARY WORDS ---
  async getNotebookWords(notebookId: string) {
    const { data, error } = await supabase.from('vocab_words').select('*').eq('notebook_id', notebookId).order('created_at', { ascending: false });
    return (data || []).map((w: any) => ({ ...w, notebookId: w.notebook_id, createdAt: w.created_at }));
  },

  async addNotebookWord(notebookId: string, term: string, definition: string) {
    const { data } = await supabase.from('vocab_words').insert({ notebook_id: notebookId, term, definition }).select().single();
    if (data) return { ...data, notebookId: data.notebook_id, createdAt: data.created_at };
    return null;
  },

  async updateNotebookWord(id: string, term: string, definition: string) {
    return await supabase.from('vocab_words').update({ term, definition }).eq('id', id);
  },

  async deleteNotebookWord(id: string) {
    return await supabase.from('vocab_words').delete().eq('id', id);
  },

  // --- NEW VOCABULARY STORIES ---
  async getNotebookStories(notebookId: string) {
    const { data, error } = await supabase.from('vocab_stories').select('*').eq('notebook_id', notebookId).order('created_at', { ascending: false });
    return (data || []).map((s: any) => ({ ...s, notebookId: s.notebook_id, createdAt: s.created_at }));
  },

  async createStory(notebookId: string, title: string, content: string) {
    const { data } = await supabase.from('vocab_stories').insert({ notebook_id: notebookId, title, content }).select().single();
    if (data) return { ...data, notebookId: data.notebook_id, createdAt: data.created_at };
    return null;
  },

  async updateStory(id: string, title: string, content: string) {
    return await supabase.from('vocab_stories').update({ title, content }).eq('id', id);
  },

  async deleteStory(id: string) {
    return await supabase.from('vocab_stories').delete().eq('id', id);
  },

  // --- LOGS ---
  async logActivity(userId: string, actionType: string, targetId: string | null, details: string | null) {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: actionType,
      target_id: targetId,
      details: details
    });
  },

  async getActivityLogs(): Promise<ActivityLog[]> {
    const { data } = await supabase
      .from('activity_logs')
      .select(`
            *,
            profiles (email)
        `)
      .order('created_at', { ascending: false })
      .limit(50);

    return (data || []).map(l => ({
      id: l.id,
      userId: l.user_id,
      userEmail: l.profiles?.email || 'Unknown',
      actionType: l.action_type as any,
      targetId: l.target_id,
      details: l.details,
      createdAt: l.created_at
    }));
  },

  // --- DEVICES (IPs) ---
  async getUserDevices(userId: string) {
    const { data } = await supabase.from('user_devices').select('*').eq('user_id', userId).order('last_used_at', { ascending: false });
    return data || [];
  },

  async toggleDeviceApproval(deviceId: string, isApproved: boolean) {
    return await supabase.from('user_devices').update({ is_approved: isApproved }).eq('id', deviceId);
  },

  async deleteDevice(deviceId: string) {
    return await supabase.from('user_devices').delete().eq('id', deviceId);
  }
};
