-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES TABLE (Custom Auth)
create table profiles (
  id uuid default uuid_generate_v4() primary key,
  email text unique not null,
  password text, -- NEW: Password column
  full_name text,
  avatar_url text,
  is_online boolean default false,
  last_seen timestamp with time zone default timezone('utc'::text, now())
);

-- USER PERMISSIONS (Which folders can they access?)
create table user_permissions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  folder_ids text[] default '{}', -- Array of Folder UUIDs
  allowed_file_ids text[] default '{}', -- NEW: Array of specific File UUIDs
  can_print boolean default false,
  print_limits jsonb default '{}', -- NEW: File specific print limits { "file_id": count }
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- ACTIVITY LOGS
create table activity_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete set null,
  action_type text not null, -- 'LOGIN', 'VIEW_FILE', 'PRINT_FILE', 'LOGOUT'
  target_id text, -- Book ID or Folder ID
  details text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- USER DEVICES (IP Tracking)
create table user_devices (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  ip_address text not null,
  user_agent text,
  is_approved boolean default false,
  last_used_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- FOLDER KEYS (For accessing folders with a code instead of user account)
create table folder_keys (
  id uuid default uuid_generate_v4() primary key,
  key_code text unique not null,
  folder_ids text[] default '{}',
  allowed_file_ids text[] default '{}', -- NEW: Keys can now open specific files too
  note text,
  allow_print boolean default false,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
