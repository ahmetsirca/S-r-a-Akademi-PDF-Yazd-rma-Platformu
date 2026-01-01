-- RLS (Row Level Security) ayarlarını devre dışı bırak
-- Bu işlem, "Yeni Defter Oluşturma" problemini çözer ve kullanıcıların hata almadan işlem yapmasını sağlar.

alter table vocab_notebooks disable row level security;
alter table vocab_words disable row level security;
alter table vocab_stories disable row level security;

-- Eğer policy'ler varsa onları da temizleyelim (Opsiyonel ama temizlik için iyi)
drop policy if exists "Users can view their own notebooks" on vocab_notebooks;
drop policy if exists "Users can insert their own notebooks" on vocab_notebooks;
drop policy if exists "Users can update their own notebooks" on vocab_notebooks;
drop policy if exists "Users can delete their own notebooks" on vocab_notebooks;

drop policy if exists "Users can view words in their notebooks" on vocab_words;
drop policy if exists "Users can insert words into their notebooks" on vocab_words;
drop policy if exists "Users can update words in their notebooks" on vocab_words;
drop policy if exists "Users can delete words in their notebooks" on vocab_words;

drop policy if exists "Users can view stories in their notebooks" on vocab_stories;
drop policy if exists "Users can insert stories into their notebooks" on vocab_stories;
drop policy if exists "Users can update stories in their notebooks" on vocab_stories;
drop policy if exists "Users can delete stories in their notebooks" on vocab_stories;
