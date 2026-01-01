import { supabase } from './supabase';
import { UserProfile, UserPermission, ActivityLog } from '../types';

export const DBService = {
  // --- USERS ---
  async getAllUsers(): Promise<UserProfile[]> {
    const { data, error } = await supabase.from('profiles').select('*').order('last_seen', { ascending: false });
    if (error) {
      console.error("Error fetching users:", error);
      return [];
    }
    return (data || []).map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      isOnline: u.is_online, // Ensure DB has this column, otherwise partial
      lastSeen: u.last_seen
    }));
  },

  // --- PERMISSIONS ---
  async getUserPermissions(userId: string): Promise<UserPermission | null> {
    const { data, error } = await supabase.from('user_permissions').select('*').eq('user_id', userId).maybeSingle();
    // Use .maybeSingle() instead of .single() to avoiding error on 0 rows

    if (error) {
      console.error("Error fetching permissions:", error);
      return null;
    }
    if (!data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      folderIds: data.folder_ids || [],
      allowedFileIds: data.allowed_file_ids || [],
      canPrint: data.can_print,
      printLimits: data.print_limits || {},
      expiresAt: data.expires_at
    };
  },

  async updateUserPermission(userId: string, folderIds: string[], allowedFileIds: string[], canPrint: boolean, expiresAt: string | null, printLimits: Record<string, number> = {}) {
    // Use UPSERT to avoid race conditions (inset vs update)
    const { data, error } = await supabase.from('user_permissions').upsert({
      user_id: userId,
      folder_ids: folderIds,
      allowed_file_ids: allowedFileIds,
      can_print: canPrint,
      print_limits: printLimits,
      expires_at: expiresAt
    }, { onConflict: 'user_id' }).select();

    if (error) {
      console.error("Error updating permissions:", error);
      return null;
    }
    return data;
  },

  async decrementPrintLimit(userId: string, fileId: string) {
    // Ideally this should be a Postgres Function (RPC) for true atomicity.
    // For now, we will use a read-modify-write pattern but with error checking.
    const perms = await this.getUserPermissions(userId);
    if (!perms || !perms.printLimits) return;

    const currentLimit = perms.printLimits[fileId];
    if (typeof currentLimit === 'number' && currentLimit > 0) {
      const newLimits = { ...perms.printLimits, [fileId]: currentLimit - 1 };
      await this.updateUserPermission(perms.userId, perms.folderIds, perms.allowedFileIds, perms.canPrint, perms.expiresAt, newLimits);
    }
  },

  // --- VOCABULARY ---
  async getVocab(userId: string) {
    let { data, error } = await supabase.from('user_vocab').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) { console.error("Error fetching vocab:", error); return []; }
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
    if (error) {
      console.error("Error adding vocab:", error);
      return { data: null, error };
    }
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
    if (error) { console.error("Error getNotebooks:", error); return []; }
    return data.map((n: any) => ({ ...n, parentId: n.parent_id, userId: n.user_id, createdAt: n.created_at }));
  },

  async createNotebook(userId: string, title: string, parentId: string | null = null) {
    const { data, error } = await supabase.from('vocab_notebooks').insert({ user_id: userId, title, parent_id: parentId }).select().single();
    if (error) {
      console.error("DB Create Notebook Error:", error);
      return null;
    }
    if (data) return { ...data, parentId: data.parent_id, userId: data.user_id, createdAt: data.created_at };
    return null;
  },

  async updateNotebook(id: string, title: string) {
    const { error } = await supabase.from('vocab_notebooks').update({ title }).eq('id', id);
    if (error) console.error("Update notebook error:", error);
    return !error;
  },

  async deleteNotebook(id: string) {
    return await supabase.from('vocab_notebooks').delete().eq('id', id);
  },

  // --- NEW VOCABULARY WORDS ---
  async getNotebookWords(notebookId: string) {
    const { data, error } = await supabase.from('vocab_words').select('*').eq('notebook_id', notebookId).order('created_at', { ascending: false });
    if (error) { console.error("getNotebookWords error:", error); return []; }
    return (data || []).map((w: any) => ({ ...w, notebookId: w.notebook_id, createdAt: w.created_at }));
  },

  async addNotebookWord(notebookId: string, term: string, definition: string, language: string = 'en') {
    const { data, error } = await supabase.from('vocab_words').insert({ notebook_id: notebookId, term, definition, language }).select().single();
    if (error) { console.error("addNotebookWord error:", error); return null; }
    if (data) return { ...data, notebookId: data.notebook_id, createdAt: data.created_at };
    return null;
  },

  async updateNotebookWord(id: string, term: string, definition: string) {
    const { error } = await supabase.from('vocab_words').update({ term, definition }).eq('id', id);
    if (error) console.error("updateNotebookWord error:", error);
    return !error;
  },

  async deleteNotebookWord(id: string) {
    return await supabase.from('vocab_words').delete().eq('id', id);
  },

  // --- NEW VOCABULARY STORIES ---
  async getNotebookStories(notebookId: string) {
    const { data, error } = await supabase.from('vocab_stories').select('*').eq('notebook_id', notebookId).order('created_at', { ascending: false });
    if (error) { console.error("getNotebookStories error:", error); return []; }
    return (data || []).map((s: any) => ({ ...s, notebookId: s.notebook_id, createdAt: s.created_at }));
  },

  async getStoryById(id: string) {
    const { data, error } = await supabase.from('vocab_stories').select('*').eq('id', id).single();
    if (error) { console.error("getStoryById error:", error); return null; }
    return { ...data, notebookId: data.notebook_id, createdAt: data.created_at };
  },

  async createStory(notebookId: string, title: string, content: string) {
    const { data, error } = await supabase.from('vocab_stories').insert({ notebook_id: notebookId, title, content }).select().single();
    if (error) {
      console.error("DB Create Story Error:", error);
      throw error;
    }
    if (data) return { ...data, notebookId: data.notebook_id, createdAt: data.created_at };
    return null;
  },

  async updateStory(id: string, title: string, content: string) {
    const { error } = await supabase.from('vocab_stories').update({ title, content }).eq('id', id);
    if (error) {
      console.error("DB Update Story Error:", error);
      return null;
    }
    return true;
  },

  async deleteStory(id: string) {
    return await supabase.from('vocab_stories').delete().eq('id', id);
  },

  // --- LOGS ---
  async logActivity(userId: string, actionType: string, targetId: string | null, details: string | null) {
    const { error } = await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: actionType,
      target_id: targetId,
      details: details
    });
    if (error) console.error("Log Activity Error:", error);
  },

  async getActivityLogs(): Promise<ActivityLog[]> {
    // Note: If 'profiles' foreign key does not exist or relation is wrong, this join will fail.
    // Assuming relation exists based on current schema.
    const { data, error } = await supabase
      .from('activity_logs')
      .select(`
            *,
            profiles (email)
        `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching logs:", error);
      return [];
    }

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
    const { data, error } = await supabase.from('user_devices').select('*').eq('user_id', userId).order('last_used_at', { ascending: false });
    if (error) { console.error("getUserDevices error:", error); return []; }
    return data || [];
  },

  async toggleDeviceApproval(deviceId: string, isApproved: boolean) {
    const { error } = await supabase.from('user_devices').update({ is_approved: isApproved }).eq('id', deviceId);
    if (error) console.error("toggleDeviceApproval error:", error);
    return !error;
  },

  async deleteDevice(deviceId: string) {
    return await supabase.from('user_devices').delete().eq('id', deviceId);
  }
};

export const QuizService = {
  async getQuestions() {
    const { data, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Quiz Fetch Error:", error);
      return [];
    }

    return (data || []).map(q => ({
      id: q.id,
      question_text: q.question_text,
      options: q.options, // Assumes JSONB array
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      created_at: q.created_at
    }));
  },

  async createQuestionsBulk(questions: any[]) {
    if (!questions || questions.length === 0) return [];

    // Validate or sanitise if needed
    const { data, error } = await supabase
      .from('quiz_questions')
      .insert(questions.map(q => ({
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation
      })));

    if (error) {
      console.error("Bulk Create Error:", error);
      throw error;
    }
    return data;
  }
};
