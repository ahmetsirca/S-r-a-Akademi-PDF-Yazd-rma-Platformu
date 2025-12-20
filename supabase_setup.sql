-- Tabloları oluştur
create table public.collections (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.pdf_books (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  collection_id uuid references public.collections(id),
  file_path text, -- Dosya yolu veya URL
  source_type text default 'FILE', -- 'FILE' veya 'LINK'
  pdf_data text, -- Geriye dönük uyumluluk veya base64 (artık kullanılmayacak ama şema hatası vermesin diye)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.access_keys (
  id uuid default gen_random_uuid() primary key,
  key_code text not null unique, -- Şifre
  book_id uuid references public.pdf_books(id),
  print_limit int default 2,
  print_count int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Storage Bucket Oluştur (Eğer otomatik oluşmazsa)
insert into storage.buckets (id, name, public) 
values ('sirca-pdfs', 'sirca-pdfs', true)
on conflict (id) do nothing;

-- Güvenlik Politikaları (RLS - Row Level Security)
-- Şimdilik geliştirme kolaylığı için herkese açık (public) bırakıyoruz. 
-- Prodüksiyonda bunlar kısıtlanmalı.

alter table public.collections enable row level security;
create policy "Enable all for users" on public.collections for all using (true) with check (true);

alter table public.pdf_books enable row level security;
create policy "Enable all for users" on public.pdf_books for all using (true) with check (true);

alter table public.access_keys enable row level security;
create policy "Enable all for users" on public.access_keys for all using (true) with check (true);

-- Storage Politikaları
create policy "Public Access" on storage.objects for select using ( bucket_id = 'sirca-pdfs' );
create policy "Public Upload" on storage.objects for insert with check ( bucket_id = 'sirca-pdfs' );
create policy "Public Update" on storage.objects for update using ( bucket_id = 'sirca-pdfs' );
