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
      canPrint: data.can_print,
      expiresAt: data.expires_at
    };
  },

  async updateUserPermission(userId: string, folderIds: string[], canPrint: boolean, expiresAt: string | null) {
    const { data: existing } = await supabase.from('user_permissions').select('id').eq('user_id', userId).single();

    if (existing) {
      return await supabase.from('user_permissions').update({
        folder_ids: folderIds,
        can_print: canPrint,
        expires_at: expiresAt
      }).eq('user_id', userId);
    } else {
      return await supabase.from('user_permissions').insert({
        user_id: userId,
        folder_ids: folderIds,
        can_print: canPrint,
        expires_at: expiresAt
      });
    }
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
