import { supabase } from './supabase';
import { UserProfile } from '../types';

export const AuthService = {
    /**
     * Custom Login with Name + Email + Access Code
     */
    async loginWithIdentity(fullName: string, email: string, code: string): Promise<{ profile: UserProfile, unlockedFolders: string[], isDeviceApproved: boolean } | null> {

        // 1. Verify Code matches a Key (FolderKey or AccessKey)
        let unlockedFolders: string[] = [];
        let canPrint = false;
        let expiresAt: string | null = null;

        // A. Check Folder Keys
        const { data: folderKeys } = await supabase.from('folder_keys').select('*').eq('key_code', code);
        const folderKey = folderKeys && folderKeys.length > 0 ? folderKeys[0] : null;

        if (folderKey) {
            unlockedFolders = folderKey.folder_ids || [];
            canPrint = folderKey.allow_print;
            expiresAt = folderKey.expires_at;

            // Check expiry
            if (folderKey.expires_at && new Date(folderKey.expires_at) < new Date()) {
                throw new Error("Bu kodun süresi dolmuş.");
            }
        } else {
            throw new Error("Geçersiz erişim kodu.");
        }

        // 2. Upsert Profile
        const { data: existing } = await supabase.from('profiles').select('*').eq('email', email).single();
        let userId = existing?.id;

        if (!userId) {
            // Create New
            const { data: newUser, error } = await supabase.from('profiles').insert({
                email,
                full_name: fullName,
                is_online: true,
                last_seen: new Date().toISOString()
            }).select().single();
            if (error) throw error;
            userId = newUser.id;
        } else {
            await supabase.from('profiles').update({
                full_name: fullName,
                is_online: true,
                last_seen: new Date().toISOString()
            }).eq('id', userId);
        }

        // 3. DEVICE / IP CHECK
        let ipAddress = '0.0.0.0';
        try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipJson = await ipRes.json();
            ipAddress = ipJson.ip;
        } catch (e) { }

        let isDeviceApproved = false;

        const { data: existingDevice } = await supabase.from('user_devices')
            .select('*')
            .eq('user_id', userId)
            .eq('ip_address', ipAddress)
            .single();

        if (existingDevice) {
            await supabase.from('user_devices').update({ last_used_at: new Date().toISOString() }).eq('id', existingDevice.id);
            isDeviceApproved = existingDevice.is_approved;
        } else {
            // Check count of devices
            const { count } = await supabase.from('user_devices').select('*', { count: 'exact', head: true }).eq('user_id', userId);
            const isFirstDevice = count === 0;

            await supabase.from('user_devices').insert({
                user_id: userId,
                ip_address: ipAddress,
                user_agent: navigator.userAgent,
                is_approved: isFirstDevice, // First device auto-approved
                last_used_at: new Date().toISOString()
            });
            isDeviceApproved = isFirstDevice;
        }

        return {
            profile: { id: userId!, email, fullName, avatarUrl: null, isOnline: true, lastSeen: null },
            unlockedFolders,
            isDeviceApproved
        };
    },

    /**
     * Check if user has permissions (Passwordless Login)
     */
    async checkPermissionAccess(fullName: string, email: string): Promise<{ profile: UserProfile, unlockedFolders: string[], isDeviceApproved: boolean } | null> {
        const { data: existing } = await supabase.from('profiles').select('*').eq('email', email).single();
        if (!existing) return null; // User unknown

        // Check permissions
        const { data: perms } = await supabase.from('user_permissions').select('*').eq('user_id', existing.id).single();
        if (!perms) return null; // No special permissions

        if (perms.expires_at && new Date(perms.expires_at) < new Date()) {
            throw new Error("Erişim izninizin süresi dolmuş.");
        }

        await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', existing.id);

        // IP Check
        let ipAddress = '0.0.0.0';
        try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipJson = await ipRes.json();
            ipAddress = ipJson.ip;
        } catch (e) { }

        let isDeviceApproved = false;
        const { data: existingDevice } = await supabase.from('user_devices').select('*').eq('user_id', existing.id).eq('ip_address', ipAddress).single();
        if (existingDevice) {
            await supabase.from('user_devices').update({ last_used_at: new Date().toISOString() }).eq('id', existingDevice.id);
            isDeviceApproved = existingDevice.is_approved;
        } else {
            await supabase.from('user_devices').insert({
                user_id: existing.id,
                ip_address: ipAddress,
                user_agent: navigator.userAgent,
                is_approved: false, // Suspicious
                last_used_at: new Date().toISOString()
            });
        }

        return {
            profile: {
                id: existing.id,
                email: existing.email,
                fullName: existing.full_name,
                avatarUrl: existing.avatar_url,
                isOnline: true,
                lastSeen: existing.last_seen
            },
            unlockedFolders: perms.folder_ids || [],
            isDeviceApproved
        };
    },

    // --- Helper for Session Persistence ---
    saveSession(profile: UserProfile) {
        localStorage.setItem('sirca_user_session', JSON.stringify(profile));
    },

    loadSession(): UserProfile | null {
        const saved = localStorage.getItem('sirca_user_session');
        return saved ? JSON.parse(saved) : null;
    },

    async updateOnlineStatus(userId: string, isOnline: boolean) {
        return await supabase
            .from('profiles')
            .update({
                is_online: isOnline,
                last_seen: new Date().toISOString()
            })
            .eq('id', userId);
    },

    async logout(userId: string) {
        localStorage.removeItem('sirca_user_session');
        await supabase.from('profiles').update({ is_online: false }).eq('id', userId);
        await supabase.from('activity_logs').insert({ user_id: userId, action_type: 'LOGOUT', details: 'User logged out' });
    }
};
