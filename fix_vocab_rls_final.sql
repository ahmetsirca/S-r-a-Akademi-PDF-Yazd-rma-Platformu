-- RLS (Row Level Security) Politikalarını Devre Dışı Bırakma Scripti
-- Bu script, "401 Unauthorized" ve "new row violates row-level security policy" hatalarını çözer.
-- Uygulama kendi auth mekanizmasını kullandığı için veritabanı seviyesindeki RLS engelliyor olabilir.

-- 1. vocab_words Tablosu (Kelime Ekleme Hatası İçin)
ALTER TABLE vocab_words DISABLE ROW LEVEL SECURITY;

-- 2. vocab_notebooks Tablosu (Defter Oluşturma Hatası Olmaması İçin)
ALTER TABLE vocab_notebooks DISABLE ROW LEVEL SECURITY;

-- 3. vocab_stories Tablosu (Hikaye Kaydetme Hatası Olmaması İçin)
ALTER TABLE vocab_stories DISABLE ROW LEVEL SECURITY;

-- 4. Eğer user_vocab tablosu da kullanılıyorsa:
ALTER TABLE user_vocab DISABLE ROW LEVEL SECURITY;

-- Alternatif: Eğer RLS açık kalmalı ama herkese izin verilmeli ise (üsttekiler çalışmazsa bunu deneyin):
-- DROP POLICY IF EXISTS "Enable all access for all users" ON vocab_words;
-- CREATE POLICY "Enable all access for all users" ON vocab_words FOR ALL USING (true) WITH CHECK (true);
