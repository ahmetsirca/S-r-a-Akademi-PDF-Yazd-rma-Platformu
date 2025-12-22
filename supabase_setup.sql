
-- Books Table (Existing, for reference)
create table if not exists books (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  pdf_url text not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Access Keys Table (Existing)
create table if not exists access_keys (
  id uuid default uuid_generate_v4() primary key,
  book_id uuid references books(id) on delete cascade,
  key_code text unique not null,
  note text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- NEW: Folders Table for "Derslerim"
create table if not exists folders (
  id uuid default uuid_generate_v4() primary key,
  parent_id uuid references folders(id) on delete cascade, -- Support for nested folders
  title text not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- NEW: Folder Content Table (PDFs and Links inside folders)
create table if not exists folder_content (
  id uuid default uuid_generate_v4() primary key,
  folder_id uuid references folders(id) on delete cascade,
  type text not null check (type in ('pdf', 'link')),
  title text not null,
  url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- NEW: Folder Access Keys (Specific passwords for folders)
create table if not exists folder_keys (
  id uuid default uuid_generate_v4() primary key,
  folder_ids uuid[] not null, -- Array of folder IDs this key unlocks
  key_code text unique not null,
  note text, -- e.g. Student Name
  expires_at timestamp with time zone, -- Optional expiration
  allow_print boolean default false, -- Control printing permission
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Migration for existing tables (in case user doesn't want to drop)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'folder_keys' AND column_name = 'allow_print') THEN
        ALTER TABLE folder_keys ADD COLUMN allow_print boolean default false;
    END IF;
END $$;


-- ==========================================
-- AUTHENTICATION & USER MANAGEMENT TABLES
-- ==========================================

-- ==========================================
-- AUTHENTICATION & USER MANAGEMENT TABLES
-- ==========================================

-- 1. Profiles (Custom User Table - No Auth Dependency)
-- We drop and recreate to remove auth.users constraint if it exists
drop table if exists activity_logs;
drop table if exists user_permissions;
drop table if exists profiles;

create table if not exists profiles (
  id uuid default uuid_generate_v4() primary key,
  email text unique not null,
  full_name text,
  avatar_url text, -- Can use UI Avatars
  is_online boolean default false,
  last_seen timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. User Devices (Track IPs)
create table if not exists user_devices (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  ip_address text not null,
  user_agent text,
  is_approved boolean default false, -- Requires admin approval for critical actions like printing
  last_used_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now())
);
-- Unique constraint to prevent duplicate IP entries per user
alter table user_devices add constraint unique_user_ip unique (user_id, ip_address);

-- 3. User Permissions (Control what users can access without password)
create table if not exists user_permissions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  folder_ids uuid[] default '{}', -- Folders they can open without password
  can_print boolean default false, -- General print permission override
  expires_at timestamp with time zone, -- Access expiration date
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Activity Logs (Track user actions)
create table if not exists activity_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete set null,
  action_type text not null, -- 'LOGIN', 'LOGOUT', 'VIEW_FILE', 'PRINT_FILE', 'FOLDER_ACCESS'
  target_id text, -- ID of the book, folder, or file
  details text, -- Human readable details (e.g. "Opened Math.pdf")
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Drop old triggers if they exist (Clean up)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- Enable RLS
alter table profiles enable row level security;
alter table user_permissions enable row level security;
alter table activity_logs enable row level security;

-- Policies (Open for app logic)
create policy "Public access" on profiles for select using (true);
create policy "Public insert" on profiles for insert with check (true);
create policy "Public update" on profiles for update using (true);

create policy "Public perms" on user_permissions for select using (true); 
create policy "Public perms write" on user_permissions for insert with check (true);
create policy "Public perms update" on user_permissions for update using (true);

create policy "Public logs" on activity_logs for select using (true);
create policy "Public logs insert" on activity_logs for insert with check (true);

